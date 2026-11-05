// Doc 4 §4.1's validator asserts every text key referenced by a scene exists
// in /text. This module fails loudly (throws) on a missing key so that
// assertion has teeth at runtime, not just in the validator.

const cache = new Map();

async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`text.js: failed to load ${path} (${res.status})`);
  const json = await res.json();
  cache.set(path, json);
  return json;
}

export async function loadTextLibrary(base = '/text') {
  const [system, form, manifest, endings] = await Promise.all([
    loadJSON(`${base}/system.json`),
    loadJSON(`${base}/form.json`),
    loadJSON(`${base}/manifest.json`),
    loadJSON(`${base}/endings.json`)
  ]);
  return { system, form, manifest, endings };
}

// Flat key lookup against system.json, e.g. text('door.violation').
export function stringFor(library, key) {
  const value = library.system[key];
  if (value === undefined) {
    throw new Error(`text.js: missing required text key "${key}"`);
  }
  return value;
}

export function endingFor(library, endingId) {
  const key = { ASSIMILATION: 'ending.assimilation', EXPULSION: 'ending.expulsion', PENDING: 'ending.pending', RETAINED: 'ending.retained' }[endingId];
  const value = library.endings[key];
  if (value === undefined) {
    throw new Error(`text.js: missing ending text for "${endingId}"`);
  }
  return value;
}
