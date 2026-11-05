// Doc 4 §2: boot, preflight, and put the candidate in his apartment. The
// game is played on foot from there (src/director.js) to the ending card.

import { createState, DEBUG_RESUME } from './state.js';
import { createDirector } from './director.js';
import { createStage } from './stage/stage.js';
import { loadTextLibrary, endingFor } from './text.js';
import { createAudio } from './audio.js';
import { createSfx } from './sfx.js';
import { initBail } from './bail.js';
import { initSoundToggle } from './soundToggle.js';

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`main.js: failed to load ${path} (${res.status})`);
  return res.json();
}

function renderEndingCard(endingId, state, library) {
  const card = endingFor(library, endingId);
  const root = document.getElementById('ending-card');
  root.innerHTML = '';
  root.hidden = false;

  const title = document.createElement('p');
  title.className = 'ending-title';
  title.textContent = card.title;

  const body = document.createElement('p');
  body.className = 'ending-body';
  body.textContent = card.body;

  root.append(title, body);

  // Doc 1 §2.5: SAW_HARLOWE "gains one extra line" on ending cards. Doc 1
  // says the line exists but never says what it is; text/endings.json's
  // _harloweNote records what was written and the constraints it had to
  // meet. It sits between the body and the signoff so the company's card
  // still gets the last word -- and it must never contain "you", which
  // belongs to the signoff alone (C4, asserted by canon.text.js).
  // Still guarded on a truthy line: a card with none simply omits it.
  const harloweLine = card.harloweExtraLine;
  if (state.flags.has('SAW_HARLOWE') && harloweLine) {
    const extra = document.createElement('p');
    extra.className = 'ending-harlowe-line';
    extra.textContent = harloweLine;
    root.appendChild(extra);
  }

  const signoff = document.createElement('p');
  signoff.className = 'ending-signoff';
  signoff.textContent = card.signoff;
  root.appendChild(signoff);
}

async function boot() {
  if (DEBUG_RESUME) {
    // Doc 4 §3.7: must never be true in a deployed build. No CI enforces
    // this in the no-Node environment -- fail loud at boot instead.
    throw new Error('DEBUG_RESUME must be false in any build.');
  }

  const [manifest, endings, library, rooms] = await Promise.all([
    loadJSON('./data/scenes.json'),
    loadJSON('./data/endings.json'),
    loadTextLibrary('./text'),
    loadJSON('./data/rooms.json')
  ]);

  const state = createState();
  const audio = createAudio();
  const sfx = createSfx(audio);

  const mount = {
    scene: document.getElementById('scene-layer'),
    hud: document.getElementById('hud-layer'),
    screen: document.getElementById('screen-layer')
  };

  const stage = createStage(mount.scene, { rooms, audio, sfx, overlay: mount.hud });
  const director = createDirector({
    manifest,
    endings,
    state,
    stage,
    mount,
    audio,
    sfx,
    library,
    onEnding(endingId) {
      renderEndingCard(endingId, state, library);
      stage.stop(); // the card is opaque and final: stop drawing the building under it
      if (window.parent !== window) setTimeout(() => window.parent.postMessage({ type: 'intern-ending', id: endingId }, '*'), 14000); // embedded in Look Over There: hand the player back
    }
  });

  window.__NINETY_NINE__ = { state, director, stage, manifest, endings, library, audio, rooms }; // dev inspection only

  initBail(director);
  initSoundToggle(audio);
  // Dev only: ?start=S5&render=H drops the candidate straight into a scene.
  const q = new URLSearchParams(location.search);
  await director.start(q.get('start') || 'S0', q.get('render') || 'C');

  // Dev only: ?autopilot=SSRR... walks the candidate through by himself
  // (src/dev/autopilot.js, tools/walkthrough.cjs).
  if (q.has('autopilot')) {
    const { startAutopilot } = await import('./dev/autopilot.js');
    window.__NINETY_NINE__.autopilot = startAutopilot({ director, stage, plan: q.get('autopilot'), seed: q.get('seed') || 'C', bailAt: q.get('bail'), speed: parseFloat(q.get('speed') || '2.5') });
  }
}

boot().catch((err) => {
  console.error(err);
  const root = document.getElementById('boot-error');
  root.hidden = false;
  root.textContent = `Boot failed: ${err.message}`;
});
