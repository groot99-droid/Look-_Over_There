// Spoken lines and company text that land in the room: the receptionist's
// "Ninety-nine." / "Shaun.", the door's "That action violates the terms of
// the contracted agreement.", the cab's "THE CAR IS ALREADY IN MOTION."
// Moved out of the old router; scenes.json's `captions` (timed from the
// scene's start) and the director's `caption` beats both land here.

import { stringFor } from './text.js';

export function createCaptions(container, library) {
  let timers = [];
  let gone = false;

  function show(text, { holdMs = 2600, className = '' } = {}) {
    if (gone || !text) return;
    // one line at a time: a new caption fades out whatever is still up (they
    // all sit at the same spot and would overlap)
    for (const old of container.querySelectorAll('.scene-caption:not(.scene-caption-out)')) {
      old.classList.add('scene-caption-out');
      setTimeout(() => old.remove(), 700);
    }
    const el = document.createElement('div');
    el.className = `scene-caption ${className}`.trim();
    el.textContent = text;
    container.appendChild(el);
    timers.push(setTimeout(() => el.classList.add('scene-caption-out'), holdMs));
    timers.push(setTimeout(() => el.remove(), holdMs + 700));
  }

  return {
    show(keyOrText, opts = {}) {
      let text = keyOrText;
      if (library && Object.prototype.hasOwnProperty.call(library.system, keyOrText)) text = stringFor(library, keyOrText);
      show(text, opts);
    },
    schedule(captions) {
      for (const cap of captions || []) {
        const text = cap.text || (library ? stringFor(library, cap.textKey) : cap.textKey);
        timers.push(setTimeout(() => show(text, { holdMs: cap.holdMs || 2500, className: cap.className || '' }), cap.atMs || 0));
      }
    },
    clear() {
      for (const t of timers) clearTimeout(t);
      timers = [];
      for (const el of container.querySelectorAll('.scene-caption')) el.remove();
    },
    stop() { gone = true; this.clear(); }
  };
}
