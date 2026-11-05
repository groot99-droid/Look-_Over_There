// Doc 4 §5.2: three layers driven by fracture() (Doc 1 §2.3), all capped so
// the effect reads as smooth wrongness, never a glitch (Doc 1 C1, Doc 2 §4).
//
// Texture bleed used to be the opposite render's IMG_IN still at low
// opacity. There are no stills now, so the bleed is the opposite room's
// own palette -- its fog and ambient colours, read from data/rooms.json
// -- laid over the scene in soft-light. The same building, lit the other
// way, showing through this one.
//
// The anomaly sprite is "a single paper slip reading 99, lying at the same
// screen coordinate in both renders" (Doc 4 §5.2 / Doc 1 §9.2): engine-
// rendered text, fixed by CSS, so "same coordinate" is true by construction.

const TEXTURE_BLEED_CAP = 0.22; // Doc 4 §5.2: "Cap texture bleed at 0.22. Above that it reads as a glitch effect."
const CHROMA_DRIFT_MAX_DEG = 4;
const ANOMALY_VISIBLE_THRESHOLD = 0.05;
const ANOMALY_POSITION = { x: '8%', y: '85%' }; // fixed across all scenes/branches by construction

export function paletteGradient(rec) {
  if (!rec) return null;
  const fog = (rec.fog && rec.fog.color) || rec.background || '#000000';
  const amb = (rec.ambient && rec.ambient.color) || '#ffffff';
  const sun = (rec.sun && rec.sun.color) || amb;
  return `linear-gradient(170deg, ${sun} 0%, ${amb} 45%, ${fog} 100%)`;
}

export function createFractureOverlay(sceneContainer) {
  const bleed = document.createElement('div');
  bleed.className = 'fracture-bleed';
  const anomaly = document.createElement('div');
  anomaly.className = 'fracture-anomaly';
  anomaly.textContent = '99';
  anomaly.style.left = ANOMALY_POSITION.x;
  anomaly.style.top = ANOMALY_POSITION.y;
  sceneContainer.append(bleed, anomaly);

  return {
    // fractureValue: 0..1 (Doc 1 §2.3). oppositeRoom: the OTHER render's
    // room record for this scene (null for S0, which has no C/H split).
    apply(fractureValue, oppositeRoom) {
      const f = Math.min(1, Math.max(0, fractureValue));
      const gradient = paletteGradient(oppositeRoom);
      if (gradient) {
        bleed.style.backgroundImage = gradient;
        bleed.style.opacity = String(f * TEXTURE_BLEED_CAP);
      } else {
        bleed.style.opacity = '0';
      }
      sceneContainer.style.setProperty('--chroma-drift', `${f * CHROMA_DRIFT_MAX_DEG}deg`);
      anomaly.style.opacity = f > ANOMALY_VISIBLE_THRESHOLD ? String(Math.min(1, f)) : '0';
    },
    destroy() {
      bleed.remove();
      anomaly.remove();
    }
  };
}
