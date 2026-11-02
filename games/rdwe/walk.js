// The walk phase: a first-person 3D room between a chapter's caption and the next
// loading screen. NEXT drops the player into the room they were just looking at, and
// they have to walk to its exit (the stairs, the end of the hall) before the next
// loading clip plays. Modelled on the Chronicle Museum viewer (three.js r160,
// procedural rooms, touch joystick), trimmed for phones: no post-processing, one
// draw call per material, static shadow maps rendered once, textures generated on
// the device instead of downloaded, and a pixel ratio that adapts to the frame rate.
//
// Public API (script.js dynamic-imports this module):
//   chapters()                         -> Promise<[chapter]>: each room's meta.chapter, in SCENES order, with `walk` set
//   hasScene(id)                       -> whether a chapter has a walk scene
//   prepare(id, elements)              -> builds the scene off-screen (call while the room video plays)
//   start(id, elements, opts)          -> Promise<'reached' | 'skipped' | 'cancelled'>
//   skip()                             -> ends the current walk as 'skipped'
//   cancel()                           -> tears the current walk down without resolving as reached
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createControls, EYE_HEIGHT } from './controls.js';
import { disposeScene } from './build.js';
import { createPlay } from './play.js';
import * as sound from './sound.js';

const SCENES = {
  dining: () => import('./scenes/dining.js'),
  hallway: () => import('./scenes/hallway.js'),
  teal: () => import('./scenes/teal.js'),
  teal2: () => import('./scenes/teal2.js'),
  flooded: () => import('./scenes/flooded.js'),
  trampoline: () => import('./scenes/trampoline.js'),
  grocery: () => import('./scenes/grocery.js'),
};

export function setSound(on) { sound.setEnabled(on); }

export function hasScene(id) { return !!SCENES[id]; }

// The chapters, one per room, in the order SCENES registers the rooms. Each scene file holds its
// own chapter (meta.chapter: clips, track, caption, stamp, log) next to its objective.
export async function chapters() {
  const ids = Object.keys(SCENES);
  const mods = await Promise.all(ids.map((id) => SCENES[id]()));
  return mods.map((m, i) => {
    if (!m.meta || m.meta.id !== ids[i] || !m.meta.chapter) throw new Error(`walk/scenes/${ids[i]}.js: no meta.chapter`);
    return { ...m.meta.chapter, walk: ids[i] };
  });
}

// --- device quality tier ---------------------------------------------------------------
function detectQuality() {
  const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  const small = Math.min(window.innerWidth, window.innerHeight) < 620;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const phone = touch && (small || cores <= 4 || mem <= 4);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    phone, touch, reducedMotion,
    texSize: phone ? 512 : 1024,
    shadows: true,
    shadowMap: phone ? 512 : 1024,
    maxPixelRatio: phone ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 2),
    minPixelRatio: phone ? 0.75 : 1,
    antialias: true,
  };
}

// Let the page breathe between texture generations so the room video keeps playing.
function yieldFrame() {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 60 });
    else setTimeout(resolve, 0);
  });
}

// --- renderer (created once, reused by every walk) ----------------------------------------
let renderer = null;
let envTexture = null;
let quality = null;

function getRenderer(mount) {
  if (renderer) {
    if (renderer.domElement.parentNode !== mount) mount.appendChild(renderer.domElement);
    return renderer;
  }
  quality = quality || detectQuality();
  renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(quality.maxPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the rooms are static: rendered once per walk
  renderer.domElement.className = 'walk-canvas';
  renderer.domElement.setAttribute('tabindex', '-1');
  mount.appendChild(renderer.domElement);

  // A warm, dim studio as the reflection environment: enough for the table top and the
  // lamp's glaze to catch something, without flooding the plaster with grey fill.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(renderer);
  room.traverse((o) => {
    if (o.isLight) { o.color.multiply(new THREE.Color('#ffd2a0')); o.intensity *= 0.6; return; }
    if (!o.isMesh || !o.material) return;
    if (o.material.isMeshBasicMaterial) o.material.color.multiply(new THREE.Color('#ffd9b0')).multiplyScalar(0.55);
    else if (o.material.side === THREE.BackSide) o.material.color.set('#5a4a3a');
    else o.material.color.set('#4a3e33');
  });
  envTexture = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  return renderer;
}

// --- prepared scenes -----------------------------------------------------------------------
const prepared = new Map(); // id -> Promise<built scene>

export function prepare(id, elements) {
  if (!SCENES[id]) return Promise.resolve(null);
  if (prepared.has(id)) return prepared.get(id);
  const p = (async () => {
    const r = getRenderer(elements.mount);
    const mod = await SCENES[id]();
    const built = await mod.build({ quality, yieldFrame, renderer: r });
    // The HUD text a walk changes (ctx.setObjective / setArrive) goes on this walk's own
    // copy, so a second lap through the game opens on the room's first words again.
    built.meta = { ...built.meta, start: { ...built.meta.start } };
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(built.background || 0x000000);
    scene.fog = built.fog || null;
    scene.environment = envTexture;
    scene.add(built.group);
    scene.add(built.lights);
    built.scene = scene;
    // First upload of every texture and shader while the video is still playing, so the
    // glitch into the room does not stall on compilation.
    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
    camera.position.set(built.meta.start.x, EYE_HEIGHT, built.meta.start.z);
    r.compile(scene, camera);
    return built;
  })();
  prepared.set(id, p);
  p.catch(() => prepared.delete(id));
  return p;
}

// --- the walk itself ------------------------------------------------------------------------
let current = null; // { resolve, stop }

export function skip() { if (current) current.finish('skipped'); }
export function cancel() { if (current) current.finish('cancelled'); }
export function active() { return !!current; }

export async function start(id, elements, opts = {}) {
  if (current) current.finish('cancelled');
  const { fade } = elements;
  fade.classList.remove('soft');
  fade.style.opacity = '1';
  const built = await prepare(id, elements);
  if (!built) return 'skipped';
  const r = getRenderer(elements.mount);
  const q = quality;
  const reduced = q.reducedMotion || !!opts.reducedMotion;
  const scene = built.scene;
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, built.far || 80);
  scene.add(camera);
  r.toneMappingExposure = built.exposure || 1;
  if (opts.sound !== undefined) sound.setEnabled(!!opts.sound);
  sound.resume();

  const controls = createControls(camera, r.domElement, { reducedMotion: reduced });
  controls.setColliders(built.colliders, built.bounds);
  controls.setPosition(built.meta.start.x, EYE_HEIGHT, built.meta.start.z);
  controls.setLook(built.meta.start.yaw || 0, built.meta.start.pitch !== undefined ? built.meta.start.pitch : (window.innerWidth < window.innerHeight ? -0.08 : 0));
  // waking up: start low and stand up over the first moments
  let rise = built.meta.riseFrom !== undefined ? { from: built.meta.riseFrom - EYE_HEIGHT, t: 0 } : null;
  if (rise) controls.setEyeOffset(rise.from);

  // HUD
  const { objective, hint, joystick, readout, tally, use: useButton } = elements;
  objective.textContent = built.meta.objective;
  objective.classList.remove('near');
  if (readout) { readout.textContent = ''; readout.classList.remove('visible'); }
  if (tally) { tally.textContent = ''; tally.classList.remove('visible', 'flash'); }
  // what a scene may do to the HUD and the walk from its update()
  const ctx = {
    setObjective(text) { built.meta.objective = text; if (!objective.classList.contains('near')) objective.textContent = text; },
    setArrive(text) { built.meta.arrive = text; if (objective.classList.contains('near')) objective.textContent = text; },
    setReadout(text) { if (!readout) return; readout.textContent = text || ''; readout.classList.toggle('visible', !!text); },
    // the mini game's score line, under the readout. Nothing new is posted once the exit has
    // begun; the same text again flashes the line, so a repeated miss still registers.
    setTally(text) {
      if (!tally || ctx.exiting) return;
      if (text && text === tally.textContent) {
        tally.classList.remove('flash');
        void tally.offsetWidth;
        tally.classList.add('flash');
      }
      tally.textContent = text || '';
      tally.classList.toggle('visible', !!text);
    },
    exiting: false,
    sound, reduced, quality: q, controls,
  };

  // The room's mini game: things to use. "use" is queued and handled inside the tick, so a
  // test stepping the simulation sees exactly what a player would.
  const play = built.interact && built.interact.length
    ? createPlay(built.interact, { camera, button: useButton, touch: q.touch })
    : null;
  let pendingUse = false;
  const requestUse = () => { if (play) pendingUse = true; };
  controls.onUse(requestUse);
  // A tap made while the other thumb holds the joystick gets no click from the browser, so a
  // touch is taken on pointerup; the click that may follow a single-finger tap is then ignored.
  let lastTouchUse = -Infinity;
  const pressUse = (e) => {
    e.preventDefault();
    e.stopPropagation();
    requestUse();
    // hand the keyboard back to the room, so Space does not press the button a second time
    useButton.blur();
    try { r.domElement.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  };
  const onUsePointerUp = (e) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    lastTouchUse = performance.now();
    pressUse(e);
  };
  const onUseButton = (e) => {
    if (performance.now() - lastTouchUse < 600) { e.preventDefault(); return; }
    pressUse(e);
  };
  if (useButton) {
    useButton.classList.remove('visible');
    useButton.addEventListener('pointerup', onUsePointerUp);
    useButton.addEventListener('click', onUseButton);
  }
  hint.textContent = q.touch
    ? 'LEFT THUMB TO WALK  ·  RIGHT THUMB TO LOOK'
    : 'W A S D  TO WALK  ·  MOUSE TO LOOK';
  hint.classList.add('visible');
  const knob = joystick.querySelector('.knob');
  controls.onJoystick((phase, x, y, dx, dy) => {
    if (phase === 'show') {
      joystick.style.left = x + 'px';
      joystick.style.top = y + 'px';
      joystick.classList.add('visible');
      knob.style.transform = 'translate(-50%, -50%)';
    } else if (phase === 'move') {
      knob.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${-dy * 34}px))`;
    } else {
      joystick.classList.remove('visible');
      knob.style.transform = 'translate(-50%, -50%)';
    }
  });

  // resize
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    // a portrait phone sees a taller slice of the room, so open the vertical field of view
    camera.fov = camera.aspect < 0.8 ? 88 : camera.aspect < 1.2 ? 80 : 72;
    camera.updateProjectionMatrix();
    r.setSize(w, h, false);
  }
  resize();
  window.addEventListener('resize', resize);

  // adaptive pixel ratio: drop when frames run long, climb back when there is headroom
  let pixelRatio = q.maxPixelRatio;
  r.setPixelRatio(pixelRatio);
  let slowFor = 0, fastFor = 0;
  function adapt(dt) {
    if (dt > 1 / 40) { slowFor += dt; fastFor = 0; } else if (dt < 1 / 56) { fastFor += dt; slowFor = 0; } else { slowFor = fastFor = 0; }
    if (slowFor > 1.2 && pixelRatio > q.minPixelRatio) {
      pixelRatio = Math.max(q.minPixelRatio, pixelRatio - 0.25);
      r.setPixelRatio(pixelRatio); resize(); slowFor = 0;
    } else if (fastFor > 6 && pixelRatio < q.maxPixelRatio) {
      pixelRatio = Math.min(q.maxPixelRatio, pixelRatio + 0.25);
      r.setPixelRatio(pixelRatio); resize(); fastFor = 0;
    }
  }

  r.shadowMap.needsUpdate = true;

  const inBox = (p, b) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;

  let state = 'walk';         // walk | exit | done
  let exitT = 0, exitDur = 1;
  let exitCurve = null;
  let hintTimer = 0;
  let raf = 0;
  let last = performance.now();
  const lookFrom = new THREE.Quaternion();
  const lookTo = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();

  function beginExit() {
    state = 'exit';
    fade.classList.remove('soft');
    controls.setEnabled(false);
    objective.classList.add('near');
    objective.textContent = built.meta.arrive;
    if (play) play.hide();
    pendingUse = false;
    ctx.exiting = true;
    const from = camera.position.clone();
    const path = typeof built.exitPath === 'function' ? built.exitPath(from) : built.exitPath;
    const pts = [from, ...path];
    exitCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    // a scene may set its own pace (a fall is quick, lying down is slow)
    exitDur = built.exitDuration || Math.max(1.6, exitCurve.getLength() / 1.7);
    exitT = 0;
    lookFrom.copy(camera.quaternion);
    const target = typeof built.exitLookAt === 'function' ? built.exitLookAt(from) : built.exitLookAt;
    tmpM.lookAt(from, target, camera.up);
    lookTo.setFromRotationMatrix(tmpM);
    if (built.onExit) built.onExit(ctx);
  }

  // One simulation tick (no drawing). The test harness calls this directly so a walk
  // is deterministic however slowly the machine renders.
  function simulate(dt) {
    if (state === 'walk') {
      if (rise) {
        rise.t = Math.min(1, rise.t + dt / 1.4);
        const e = 1 - Math.pow(1 - rise.t, 3);
        controls.setEyeOffset(rise.from * (1 - e));
        if (rise.t >= 1) { rise = null; controls.setEyeOffset(0); }
      }
      controls.update(dt);
      const p = controls.position();
      // an endless floor: the scene may wrap the player back onto its tile
      if (built.wrap && built.wrap(p)) controls.update(0);
      if (built.update) built.update(p, dt, camera, ctx);
      if (play) {
        play.update(p);
        if (pendingUse) { pendingUse = false; play.use(ctx); play.update(p); }
      }
      if (built.trigger && inBox(p, built.trigger)) beginExit();
      else if (built.nearGoal && inBox(p, built.nearGoal)) {
        if (!objective.classList.contains('near')) { objective.classList.add('near'); objective.textContent = built.meta.arrive; }
      } else if (objective.classList.contains('near')) {
        objective.classList.remove('near'); objective.textContent = built.meta.objective;
      }
      if (controls.isMoving()) hintTimer += dt * 3;
      hintTimer += dt;
      if (hintTimer > 6) hint.classList.remove('visible');
    } else if (state === 'exit') {
      exitT = Math.min(1, exitT + dt / exitDur);
      const e = built.exitEase === 'in' ? exitT * exitT
        : built.exitEase === 'linear' ? exitT
          : exitT < 0.5 ? 2 * exitT * exitT : 1 - Math.pow(-2 * exitT + 2, 2) / 2;
      exitCurve.getPointAt(e, tmpV);
      camera.position.copy(tmpV);
      if (!reduced) {
        const shake = built.exitShake || 0;
        camera.position.y += Math.sin(exitT * Math.PI * 2 * exitDur * 1.6) * 0.02;
        if (shake) {
          camera.position.x += (Math.random() - 0.5) * shake;
          camera.position.y += (Math.random() - 0.5) * shake;
          camera.position.z += (Math.random() - 0.5) * shake;
        }
      }
      camera.quaternion.slerpQuaternions(lookFrom, lookTo, Math.min(1, exitT * (built.exitTurn || 1.8)));
      if (built.update) built.update(camera.position, dt, camera, ctx);
      const fadeAt = built.exitFadeStart !== undefined ? built.exitFadeStart : 0.45;
      const dark = Math.max(0, (exitT - fadeAt) / (1 - fadeAt));
      fade.style.opacity = String(dark * dark);
      if (exitT >= 1) { state = 'done'; finish('reached'); return false; }
    }
    return true;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    // (a frame's timestamp can be earlier than the performance.now() the loop started from, after a
    // long build: time never runs backward)
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (!simulate(dt)) return;
    r.render(scene, camera);
    adapt(dt);
  }

  function step(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) if (!simulate(dt)) break;
    if (current) r.render(scene, camera);
    return controls.position().toArray();
  }

  // Test hook: simulate without drawing.
  function sim(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) if (!simulate(dt)) break;
    return controls.position().toArray();
  }

  // Test hook: stop or restart the animation loop (screenshots under software GL need a
  // quiet main thread; step() still renders on demand).
  function setLoop(on) {
    if (!on) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf && current) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function onVisibility() {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf && current) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  document.addEventListener('visibilitychange', onVisibility);

  let resolveWalk;
  const done = new Promise((resolve) => { resolveWalk = resolve; });

  function finish(result) {
    if (!current) return;
    current = null;
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    controls.dispose();
    sound.stopHum();
    joystick.classList.remove('visible');
    hint.classList.remove('visible');
    if (readout) readout.classList.remove('visible');
    if (tally) tally.classList.remove('visible');
    if (useButton) {
      useButton.classList.remove('visible');
      useButton.removeEventListener('pointerup', onUsePointerUp);
      useButton.removeEventListener('click', onUseButton);
    }
    scene.remove(camera);
    // Free the room. A revisit rebuilds it (the loop returns to the title card first).
    prepared.delete(id);
    if (built.dispose) built.dispose();
    disposeScene(scene);
    fade.style.opacity = result === 'reached' ? '1' : '0';
    resolveWalk(result);
  }

  // Test hook: press "use" now (the next tick handles it, as for a key press).
  function use() { requestUse(); return sim(1 / 60, 1); }

  current = {
    finish, step, sim, setLoop, use, controls, camera, built, scene, ctx,
    get state() { return state; },
    get target() { return play ? play.target : null; },
  };
  controls.setEnabled(true);
  r.render(scene, camera);
  // fade up from black once the first frame is on the canvas
  requestAnimationFrame(() => { fade.classList.add('soft'); fade.style.opacity = '0'; });
  raf = requestAnimationFrame(frame);
  // Give the canvas keyboard focus without stealing the pointer-lock gesture.
  try { r.domElement.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  return done;
}

// Debug / test hooks (walk_test.mjs drives these): a snapshot and a deterministic step.
export const debug = {
  get renderer() { return renderer; },
  get quality() { return quality; },
  get current() { return current; },
  THREE,
};
