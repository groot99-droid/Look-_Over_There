// A second persistent non-diegetic control, alongside bail.js's EXIT
// affordance -- bail.js's comment calls EXIT "the ONE persistent
// non-diegetic UI element in the entire game" (Doc 4 §14); this knowingly
// breaks that rule for a plain accessibility/utility toggle (muting sound),
// not a narrative element, so it's kept visually matched to EXIT (same
// corner treatment, opposite side) rather than styled as anything diegetic.

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function initSoundToggle(audio) {
  const button = document.createElement('button');
  button.id = 'sound-toggle';
  button.type = 'button';

  const glyph = document.createElement('span');
  glyph.className = 'sound-toggle-glyph';
  glyph.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'sound-toggle-label';

  button.append(glyph, label);
  document.body.appendChild(button);

  function render() {
    const muted = audio.isMuted();
    button.classList.toggle('sound-toggle-on', !muted);
    button.classList.toggle('sound-toggle-off', muted);
    glyph.textContent = muted ? '✕' : '♪'; // × / ♪ -- plain glyphs, not emoji, to match the terminal-text register
    label.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    button.title = muted ? 'Unmute sound (M)' : 'Mute sound (M)';
    button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    button.setAttribute('aria-pressed', String(!muted));
  }

  function toggle() {
    audio.toggleMute();
    render();
    // Brief pulse so the state change reads as an event, not just a static
    // label swap -- restart the animation by forcing a reflow.
    button.classList.remove('sound-toggle-pulse');
    void button.offsetWidth;
    button.classList.add('sound-toggle-pulse');
  }

  button.addEventListener('click', toggle);

  function onKeydown(e) {
    if (e.key !== 'm' && e.key !== 'M') return;
    if (isTypingTarget(document.activeElement)) return; // MG-01/MG-05 free-text fields contain "m"
    toggle();
  }
  document.addEventListener('keydown', onKeydown);

  render();

  return {
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      button.remove();
    }
  };
}
