#!/usr/bin/env python3
"""Resolve audio/cues.json against the sound library's catalog.json into audio/sources.lock.json (asset, zip member, sha256, size, release),
so the game repo does not need the library repo to build its audio.
    python3 tools/make_lock.py --catalog ../Pipelines-Plugin/sound-library/catalog.json
Exit codes: 0 done, 1 a cue names a sound the catalog does not have."""
import argparse, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent

def resolve(cues, catalog):
    by_id = {i["id"]: i for i in catalog["items"]}
    entries, missing = {}, []
    for key, cue in cues["cues"].items():
        item = by_id.get(cue["id"])
        if not item: missing.append((key, cue["id"])); continue
        s = item["source"]
        entries[cue["id"]] = {"release": s["release"], "asset": s["asset"], "member": s["member"], "sha256": item["sha256"], "bytes": item["bytes"],
                              "duration_s": item["duration_s"], "sample_rate": item["sample_rate"], "channels": item["channels"], "name": item["name"]}
    return {"repo": catalog.get("repo", ""), "entries": dict(sorted(entries.items()))}, missing

def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("--catalog", required=True); ap.add_argument("--cues", default=str(ROOT / "audio/cues.json")); ap.add_argument("--out", default=str(ROOT / "audio/sources.lock.json"))
    a = ap.parse_args(argv)
    lock, missing = resolve(json.load(open(a.cues)), json.load(open(a.catalog)))
    for key, id_ in missing: print(f"MISSING {key}: {id_}", file=sys.stderr)
    if missing: return 1
    Path(a.out).write_text(json.dumps(lock, indent=1) + "\n"); print(f"{len(lock['entries'])} sounds locked -> {a.out}"); return 0

if __name__ == "__main__": sys.exit(main())
