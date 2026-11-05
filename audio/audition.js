// The audition page (open the game with ?sound=1): every cue in audio/cues.json by group with a play button, a source circling the listener (to hear the 3D placement),
// the level score with the danger and heartbeat controls, and the mix volumes. For judging the picks: each row shows the cue id and the library sound it was cut from.
export async function openAudition(AUD, doc = document) {
  window.__aud = AUD;
  const cues = (await (await fetch("./audio/cues.json")).json()).cues;
  const el = doc.createElement("div");
  el.style.cssText = "position:fixed;inset:0;z-index:50;background:#0a0a0a;color:#d8d8c4;font:13px/1.5 system-ui,sans-serif;overflow:auto;padding:18px 22px";
  el.innerHTML = `<h2 style="letter-spacing:.2em;margin:0 0 6px">SOUND AUDITION</h2><div id="au-st" style="opacity:.7;margin-bottom:10px">Click anywhere to start the sound.</div>
  <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin-bottom:14px">
   <label>Level score <select id="au-lv"><option>B1<option>L1<option>L2<option>L3<option>L4</select></label>
   <label>Monster distance <input id="au-d" type="range" min="2" max="40" value="40"> <span id="au-dv">none</span></label>
   <label>Health <input id="au-hp" type="range" min="1" max="100" value="100"> <span id="au-hpv">100</span></label>
   <label>Music <input id="au-vm" type="range" min="0" max="1" step="0.05"></label><label>Effects <input id="au-vs" type="range" min="0" max="1" step="0.05"></label>
   <button id="au-orbit">Circle a growl around me</button><button id="au-stop">Stop all</button></div><div id="au-list"></div>`;
  doc.body.appendChild(el);
  const $ = id => el.querySelector("#" + id), live = new Set(), groups = {};
  for (const [k, c] of Object.entries(cues)) (groups[c.bus === "music" ? "music and layers" : k.split("_")[0]] ||= []).push([k, c]);
  const list = $("au-list");
  for (const [g, rows] of Object.entries(groups)) {
    const box = doc.createElement("div"); box.innerHTML = `<h3 style="margin:14px 0 4px;border-bottom:1px solid #333">${g}</h3>`;
    for (const [k, c] of rows) {
      const row = doc.createElement("div"); row.style.cssText = "display:flex;gap:10px;align-items:center;padding:2px 0";
      const b = doc.createElement("button"); b.textContent = "▶ " + k; b.style.minWidth = "170px"; b.dataset.cue = k;
      b.onclick = () => { const h = AUD.play(k, {bus: c.bus, loop: !!c.loop, priority: true, gain: 1}); live.add(h); };
      const info = doc.createElement("span"); info.style.opacity = ".65"; info.textContent = `${c.id}${c.loop ? " · loops" : ""}${c.note ? " · " + c.note : ""}`;
      row.append(b, info); box.appendChild(row);
    }
    list.appendChild(box);
  }
  let chaseD = 40, hp = 100, t = 0, orbit = null, last = performance.now(), run = true;
  const sync = () => { $("au-dv").textContent = chaseD >= 40 ? "none" : chaseD + " m"; $("au-hpv").textContent = hp; };
  $("au-lv").onchange = e => AUD.setLevel(e.target.value);
  $("au-d").oninput = e => { chaseD = +e.target.value; sync(); }; $("au-hp").oninput = e => { hp = +e.target.value; sync(); };
  $("au-vm").value = AUD.settings.music; $("au-vs").value = AUD.settings.sfx;
  $("au-vm").oninput = e => AUD.set("music", +e.target.value); $("au-vs").oninput = e => AUD.set("sfx", +e.target.value);
  $("au-orbit").onclick = () => { if (orbit) orbit.stop(); orbit = AUD.play("mon_growl_1", {pos: [3, 1.4, 0], loop: true, priority: true, loud: true}); };
  $("au-stop").onclick = () => { for (const h of live) h.stop(); live.clear(); if (orbit) orbit.stop(); orbit = null; AUD.stopMusic(); };
  doc.addEventListener("pointerdown", async () => { if (await AUD.unlock()) { $("au-st").textContent = "Sound is " + AUD.status + ". Pick a level to hear its score; slide the monster closer to bring in the danger layers; lower the health to bring in the heartbeat."; AUD.setLevel($("au-lv").value); } }, {once: true});
  const frame = now => {
    if (!run) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
    AUD.setListener(0, 1.6, 0, 0);
    if (orbit && orbit.setPos) orbit.setPos(Math.cos(t * 0.9) * 4, 1.4, Math.sin(t * 0.9) * 4);
    AUD.update(dt, {chasers: chaseD < 40 ? [{d: chaseD}] : [], hp});
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame); sync();
  return {close() { run = false; el.remove(); }, el};
}
