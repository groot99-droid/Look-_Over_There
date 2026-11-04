#!/usr/bin/env python3
"""Build the game's audio from the author's sound library (audio/cues.json + audio/sources.lock.json -> audio/files/*.ogg).

    python3 tools/build_audio.py                      # every cue, from the public GitHub release
    python3 tools/build_audio.py --only m_b1,gun      # some cues
    python3 tools/build_audio.py --source-dir DIR     # zips already on disk (tests, offline)
    python3 tools/build_audio.py --allow-partial      # a failure leaves a note (audio/files/FAILED) and still exits 0 (Docker build)

Each sound is read out of its zip with HTTP range requests (the zip's directory first, then only that member), so a 1 GB zip is never
downloaded whole; the member's sha256 is checked against the lock before anything is made from it. Then ffmpeg trims it, makes loops
seamless (the tail is cross-faded into the head), levels it (peak for effects, average for music), and writes Opus in Ogg: mono 48 kHz
for effects (so the game can place them in 3D), stereo for music. Python stdlib + ffmpeg only; the originals are never kept.
Exit codes: 0 done, 1 some cues failed, 2 usage error."""
import argparse, hashlib, io, json, os, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLOCK = 8 * 1024 * 1024
SFX_PEAK_DB, MUSIC_MEAN_DB, MUSIC_PEAK_DB = -3.0, -24.0, -1.5


class HTTPRangeFile(io.RawIOBase):
    """A read-only seekable file over one URL, fetched in BLOCK-sized range requests (suffix ranges are not used: some proxies refuse them)."""
    def __init__(self, url, opener=None, block=BLOCK):
        self.url, self.pos, self.block = url, 0, block
        self.open_ = opener or urllib.request.urlopen
        self.cache_at, self.cache = -1, b""
        head = self._range(0, 0)
        self.size = int(head[1])
    def _range(self, start, end):                                   # -> (bytes, total size)
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end}", "User-Agent": "look-over-there-build"})
        with self.open_(req, timeout=180) as r:
            total = r.headers.get("Content-Range", "").split("/")[-1]
            data = r.read()
        return data, (total if total.isdigit() else len(data))
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def read(self, n=-1):
        if n is None or n < 0: n = self.size - self.pos
        n = min(n, self.size - self.pos)
        out = []
        while n > 0:
            if not (self.cache_at <= self.pos < self.cache_at + len(self.cache)):
                start = self.pos; end = min(self.size - 1, start + max(n, self.block) - 1)
                self.cache, self.cache_at = self._range(start, end)[0], start
            off = self.pos - self.cache_at; take = self.cache[off:off + n]
            if not take: break
            out.append(take); self.pos += len(take); n -= len(take)
        return b"".join(out)
    def readinto(self, b):
        d = self.read(len(b)); b[:len(d)] = d; return len(d)


def open_zip(entry, repo, source_dir=None, opener=None):
    if source_dir:
        return zipfile.ZipFile(Path(source_dir) / entry["asset"])
    url = f"https://github.com/{repo}/releases/download/{entry['release']}/{entry['asset']}"
    return zipfile.ZipFile(HTTPRangeFile(url, opener))


def fetch_member(entry, repo, source_dir=None, opener=None):
    """The member's bytes, checked against the lock's sha256 (the recorded member name first, then any member with that hash)."""
    with open_zip(entry, repo, source_dir, opener) as z:
        names = z.namelist()
        for name in ([entry["member"]] if entry["member"] in names else []) + [n for n in names if n != entry["member"] and n.lower().endswith((".wav", ".m4a"))]:
            if "__MACOSX" in name: continue
            info = z.getinfo(name)
            if name != entry["member"] and info.file_size != entry["bytes"]: continue
            blob = z.read(name)
            if hashlib.sha256(blob).hexdigest() == entry["sha256"]: return blob
    raise RuntimeError(f"{entry['asset']} holds no file with sha256 {entry['sha256'][:12]}")


def loops(cue, length):                                              # does this cue get a cross-faded seam?
    return bool(cue.get("loop")) and float(cue.get("xfade", 0)) > 0 and length > 4 * float(cue["xfade"])


def probe_len(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def level(clip, cue):
    """Gain (dB) that brings the processed clip to its target: peak -3 dBFS for effects; average -24 dB (peak at most -1.5) for music, beds and tension layers."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(clip), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    mean = re.search(r"mean_volume: (-?[\d.]+) dB", err); peak = re.search(r"max_volume: (-?[\d.]+) dB", err)
    if not mean or not peak: return cue.get("gain_db", 0.0)
    mean, peak = float(mean.group(1)), float(peak.group(1))
    g = min(MUSIC_MEAN_DB - mean, MUSIC_PEAK_DB - peak) if cue["bus"] == "music" and not cue["key"].startswith("heart") else SFX_PEAK_DB - peak
    return max(-30.0, min(30.0, g)) + cue.get("gain_db", 0.0)


def run(args):
    subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-loglevel", "error", "-y"] + args, capture_output=True, check=True)


def encode(src, dst, cue):
    start, ln = cue.get("start", 0), cue.get("len")
    total = probe_len(src); ln = min(ln, total - start) if ln else total - start
    tmp = Path(tempfile.mkdtemp(prefix="cue-")); clip = tmp / "clip.wav"; fmt = ["-ac", str(cue.get("ch", 1)), "-ar", "48000"]
    if loops(cue, ln):
        # a seamless loop: swap the halves and cross-fade the old end into the old start, so the file's end runs straight into its start
        x, mid = float(cue["xfade"]), ln / 2
        run(["-ss", str(start + mid), "-t", str(ln - mid), "-i", str(src)] + fmt + [str(tmp / "p2.wav")])
        run(["-ss", str(start), "-t", str(mid), "-i", str(src)] + fmt + [str(tmp / "p1.wav")])
        run(["-i", str(tmp / "p2.wav"), "-i", str(tmp / "p1.wav"), "-filter_complex", f"acrossfade=d={x}:c1=qsin:c2=qsin", str(clip)])
    else:
        fade = ["-af", f"afade=t=out:st={max(0, ln - cue['fade_out'])}:d={cue['fade_out']}"] if cue.get("fade_out") else []
        run(["-ss", str(start), "-t", str(ln), "-i", str(src)] + fade + fmt + [str(clip)])
    gain = level(clip, cue)
    run(["-i", str(clip), "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89", "-c:a", "libopus", "-b:a", "64k" if cue.get("ch", 1) == 2 else "28k", "-application", "audio", str(dst)])
    shutil.rmtree(tmp, ignore_errors=True)
    return probe_len(dst), round(gain, 1)


def build(cues, lock, out, only=None, source_dir=None, opener=None, log=print):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    index_path = out / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    repo = lock.get("repo", ""); failed = []
    wanted = {k: dict(v, key=k) for k, v in cues["cues"].items() if not only or k in only}
    by_id = {}
    for k, cue in wanted.items(): by_id.setdefault(cue["id"], []).append(k)
    for id_, keys in by_id.items():
        entry = lock["entries"].get(id_)
        todo = [k for k in keys if not (out / f"{k}.ogg").exists() or index.get(k, {}).get("stamp") != stamp(wanted[k], entry)]
        if not todo: log(f"  {id_}: up to date"); continue
        try:
            if not entry: raise RuntimeError("not in the lock: run tools/make_lock.py")
            log(f"  {id_} ({entry['bytes'] / 1e6:.0f} MB) from {entry['asset']}")
            blob = fetch_member(entry, repo, source_dir, opener)
            tmp = Path(tempfile.mkdtemp(prefix="member-")); src = tmp / ("src" + Path(entry["member"]).suffix.lower())
            src.write_bytes(blob); del blob
            for k in todo:
                dur, gain = encode(src, out / f"{k}.ogg", wanted[k])
                index[k] = {"file": f"{k}.ogg", "dur": round(dur, 3), "bytes": (out / f"{k}.ogg").stat().st_size, "bus": wanted[k]["bus"], "ch": wanted[k].get("ch", 1),
                            "loop": bool(wanted[k].get("loop")), "gain_db": gain, "stamp": stamp(wanted[k], entry)}
                log(f"    {k}: {dur:.1f} s, {index[k]['bytes'] // 1024} KB, gain {gain:+.1f} dB")
            shutil.rmtree(tmp, ignore_errors=True)
        except Exception as err:  # noqa: BLE001 - one failure must not stop the rest
            for k in keys: failed.append((k, str(err)))
            log(f"  FAILED {id_}: {err}")
    index_path.write_text(json.dumps(index, indent=1, sort_keys=True))
    return index, failed


def stamp(cue, entry):
    return hashlib.sha256(json.dumps([{k: v for k, v in cue.items() if k != "note"}, entry and entry["sha256"], 2], sort_keys=True).encode()).hexdigest()[:16]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cues", default=str(ROOT / "audio/cues.json")); ap.add_argument("--lock", default=str(ROOT / "audio/sources.lock.json")); ap.add_argument("--out", default=str(ROOT / "audio/files"))
    ap.add_argument("--only", default=""); ap.add_argument("--source-dir"); ap.add_argument("--allow-partial", action="store_true")
    a = ap.parse_args(argv)
    if not shutil.which("ffmpeg"): print("ffmpeg is needed", file=sys.stderr); return 2
    cues, lock = json.load(open(a.cues)), json.load(open(a.lock))
    only = {k for k in a.only.split(",") if k} or None
    if only and not only <= set(cues["cues"]): print("unknown cue:", ", ".join(sorted(only - set(cues["cues"]))), file=sys.stderr); return 2
    index, failed = build(cues, lock, a.out, only, a.source_dir)
    total = sum(v["bytes"] for v in index.values())
    print(f"{len(index)} cues built, {total / 1e6:.1f} MB; {len(failed)} failed")
    marker = Path(a.out) / "FAILED"
    if failed:
        for k, why in failed: print(f"  {k}: {why}", file=sys.stderr)
        marker.write_text("\n".join(f"{k}: {why}" for k, why in failed) + "\n")
        return 0 if a.allow_partial else 1
    marker.unlink(missing_ok=True); return 0


if __name__ == "__main__": sys.exit(main())
