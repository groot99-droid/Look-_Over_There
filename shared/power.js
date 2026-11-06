// The building's power: one switch for the whole room. It starts off, is thrown once, by anyone, from the box on L3 (a quick shortcut)
// or from the far switch on L4, and stays on. While it is off the L4 store's glass doors are shut.
import {REGISTRY} from "./registry.js";
export const POWER_SOURCES = REGISTRY.powerSources;
export const newPower = () => ({on: false, by: null});
// Returns the new state, or null if it is not allowed (already on, or thrown from a floor that has no power switch). Never mutates st.
export function throwPower(st, scene) {
  if (!st || st.on || !POWER_SOURCES.includes(scene)) return null;
  return {on: true, by: scene};
}
