// S0 application beat (added post-launch, at the user's request -- not part
// of Doc 1-4's original design, unlike every other module in src/). The
// candidate walks up to the computer in his apartment and sits; this form is
// laid over the CRT's screen (src/director.js follows stage.screenRect()):
// a drag-and-drop form (text/form.json), then the portal's answer and a
// countdown stepping "6 MONTHS" down to "LEAVE NOW", drawn on the screen.
//
// Three questions, two tiles each -- WILLING and NOT WILLING, both already
// written out by the building; the candidate only chooses which one to hand
// over. This is the second cut: the first asked the old ten intake questions
// with one pre-filled tile apiece, which meant every player submitted an
// identical form and the answers could not mean anything. (The cut before
// that was free typing, judged "boring".) The ten-question set is gone
// entirely (and the mini-games after it are gone too).
//
// What the answers do: two or more NOT WILLING answers seed the hostile
// render, which is what finally makes S1-H/S2-H reachable. The seed is
// render-only -- it moves lastRender, never conformance -- so every ending
// threshold and the documented 256-path counts are untouched (state.js
// seedRenderFromIntake). No friction or dwell scoring: it happens before the
// game proper starts. It's the pre-game ritual, not a scored beat. It cannot
// be failed: the hit-test is generous, and neither tile is the wrong one.

const COUNTDOWN_STEPS = ['6 MONTHS', '5 MONTHS', '4 MONTHS', '3 MONTHS', '2 MONTHS', '1 MONTH', 'LEAVE NOW'];
const COUNTDOWN_STEP_MS = 450;
const COUNTDOWN_HOLD_MS = 400; // linger on "LEAVE NOW" before handing off

const SNAP_DELAY_MS = 350; // pause on a successful drop before the next field, so it reads as landing

let formTextPromise = null;
function loadFormText() {
  if (!formTextPromise) formTextPromise = fetch('./text/form.json').then((r) => r.json());
  return formTextPromise;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createApplicationUI(container) {
  function renderForm(fields, onSubmitGesture) {
    return new Promise((resolve) => {
      const wrap = el('div', 'application-form');
      const field_ = el('div', 'application-dragfield');
      wrap.appendChild(field_);
      container.appendChild(wrap);

      const answers = {};
      let refusals = 0; // NOT WILLING count -- 2+ seeds the hostile render
      let index = 0;

      function renderField() {
        field_.innerHTML = '';
        const field = fields[index];
        const isLast = index === fields.length - 1;

        field_.appendChild(el('div', 'application-label', `${field.id}. ${field.label}`));

        const slot = el('div', 'application-slot', 'DRAG HERE');
        const willingTile = el('div', 'application-tile', field.willing);
        const refuseTile = el('div', 'application-tile', field.notWilling);
        field_.append(slot, willingTile, refuseTile);

        slot.style.left = '50%';
        slot.style.top = '38%';
        willingTile.style.left = '28%';
        willingTile.style.top = '76%';
        refuseTile.style.left = '72%';
        refuseTile.style.top = '76%';

        let dragging = null; // the tile currently under the pointer, or null
        let dropped = false;

        function clientToPercent(clientX, clientY) {
          const rect = field_.getBoundingClientRect();
          return {
            x: Math.max(4, Math.min(96, ((clientX - rect.left) / rect.width) * 100)),
            y: Math.max(4, Math.min(96, ((clientY - rect.top) / rect.height) * 100))
          };
        }

        function onPointerDown(e) {
          if (dropped) return;
          dragging = e.currentTarget;
          dragging.classList.add('application-tile-dragging');
          const p = clientToPercent(e.clientX, e.clientY);
          dragging.style.left = `${p.x}%`;
          dragging.style.top = `${p.y}%`;
        }

        function onPointerMove(e) {
          if (!dragging || dropped) return;
          const p = clientToPercent(e.clientX, e.clientY);
          dragging.style.left = `${p.x}%`;
          dragging.style.top = `${p.y}%`;
        }

        function advance(chosenTile) {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          answers[field.label] = chosenTile.textContent;
          if (chosenTile === refuseTile) refusals++;
          if (isLast) {
            container.removeChild(wrap);
            resolve({ answers, refusals });
            return;
          }
          index++;
          renderField();
        }

        function onPointerUp() {
          if (!dragging || dropped) return;
          const tile = dragging;
          dragging = null;
          const tr = tile.getBoundingClientRect();
          const sr = slot.getBoundingClientRect();
          const tcx = tr.left + tr.width / 2;
          const tcy = tr.top + tr.height / 2;
          // Generous hit-test (padded slot bounds) -- Doc 3's "no mini-game
          // can be failed" applies here too: a near-miss still lands.
          const pad = 24;
          const hit = tcx >= sr.left - pad && tcx <= sr.right + pad && tcy >= sr.top - pad && tcy <= sr.bottom + pad;
          if (hit) {
            dropped = true;
            // Doc 4 §7.4: the one browser-mandated user gesture -- must fire
            // synchronously in this real pointerup handler, not inside the
            // setTimeout below (a timer callback doesn't count as part of
            // the gesture and autoplay policy would block AudioContext).
            if (isLast) onSubmitGesture();
            tile.classList.remove('application-tile-dragging');
            tile.classList.add('application-tile-landed');
            tile.style.left = '50%';
            tile.style.top = '38%';
            // The tile not chosen withdraws rather than sitting there as a
            // second answer the building might still read.
            const other = tile === willingTile ? refuseTile : willingTile;
            other.classList.add('application-tile-withdrawn');
            slot.classList.add('application-slot-filled');
            setTimeout(() => advance(tile), SNAP_DELAY_MS);
          } else {
            tile.classList.remove('application-tile-dragging');
          }
        }

        willingTile.addEventListener('pointerdown', onPointerDown);
        refuseTile.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      }

      renderField();
    });
  }

  function renderCountdown() {
    return new Promise((resolve) => {
      const wrap = el('div', 'application-countdown');
      const label = el('div', 'countdown-label', COUNTDOWN_STEPS[0]);
      const barOuter = el('div', 'countdown-bar-outer');
      const barInner = el('div', 'countdown-bar-inner');
      barOuter.appendChild(barInner);
      wrap.append(label, barOuter);
      container.appendChild(wrap);

      let i = 0;
      const last = COUNTDOWN_STEPS.length - 1;
      const timer = setInterval(() => {
        i++;
        label.textContent = COUNTDOWN_STEPS[i];
        barInner.style.width = `${(i / last) * 100}%`;
        if (i >= last) {
          clearInterval(timer);
          setTimeout(() => {
            container.removeChild(wrap);
            resolve();
          }, COUNTDOWN_HOLD_MS);
        }
      }, COUNTDOWN_STEP_MS);
    });
  }

  return {
    // onSubmitGesture fires synchronously inside the form's final drop
    // handler -- callers must use it (not the returned promise) to unlock
    // the AudioContext, or autoplay policy will block it.
    // Resolves { answers, refusals }: the labelled answers, and the NOT
    // WILLING count the director seeds the render from (state.js
    // seedRenderFromIntake).
    async presentForm({ onSubmitGesture = () => {} } = {}) {
      const formText = await loadFormText();
      return renderForm(formText.fields, onSubmitGesture);
    },
    // The countdown is drawn on the CRT itself now (src/screens.js); these
    // give the director its steps and pace.
    countdownSteps: () => COUNTDOWN_STEPS.slice(),
    countdownStepMs: () => COUNTDOWN_STEP_MS,
    // Form then DOM countdown in one go (kept for previews).
    async present({ onSubmitGesture = () => {} } = {}) {
      const formText = await loadFormText();
      const { answers, refusals } = await renderForm(formText.fields, onSubmitGesture);
      await renderCountdown();
      return { answers, refusals };
    }
  };
}
