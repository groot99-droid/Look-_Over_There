"""Tests for tools/build_audio.py on generated sounds (a fake zip, a local server that speaks HTTP range requests). Needs ffmpeg.
    python3 -m unittest tools/test_build_audio.py"""
import hashlib, http.server, json, math, struct, subprocess, sys, tempfile, threading, unittest, urllib.request, wave, zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_audio as B


def tone(path, seconds=12.0, rate=48000, freq=330.0, channels=1):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<" + "h" * channels, *([int(14000 * math.sin(2 * math.pi * freq * i / rate))] * channels)) for i in range(int(seconds * rate))))


class RangeHandler(http.server.BaseHTTPRequestHandler):
    root = None
    def log_message(self, *a): pass
    def do_GET(self):
        data = (self.root / self.path.lstrip("/")).read_bytes(); rng = self.headers.get("Range")
        if rng and rng.startswith("bytes=-"): self.send_response(501); self.end_headers(); return          # like the real proxy: no suffix ranges
        if rng:
            a, b = rng[6:].split("-"); a, b = int(a), min(int(b), len(data) - 1)
            self.send_response(206); self.send_header("Content-Range", f"bytes {a}-{b}/{len(data)}"); body = data[a:b + 1]
        else:
            self.send_response(200); body = data
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)


def pcm(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "48000", "-"], capture_output=True, check=True)
    return struct.unpack("<" + "f" * (len(r.stdout) // 4), r.stdout)


class BuildAudio(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp()); wav = cls.tmp / "t.wav"; tone(wav)
        cls.blob = wav.read_bytes()
        with zipfile.ZipFile(cls.tmp / "Fake.zip", "w", zipfile.ZIP_DEFLATED) as z: z.writestr("cat/tone.wav", cls.blob); z.writestr("cat/pad.bin", b"x" * 3_000_000)
        sha = hashlib.sha256(cls.blob).hexdigest()
        cls.lock = {"repo": "x/y", "entries": {"cat/tone": {"release": "R", "asset": "Fake.zip", "member": "cat/tone.wav", "sha256": sha, "bytes": len(cls.blob)},
                                              "cat/bad": {"release": "R", "asset": "Fake.zip", "member": "cat/tone.wav", "sha256": "0" * 64, "bytes": len(cls.blob)}}}
        cls.cues = {"cues": {"loop": {"id": "cat/tone", "bus": "music", "ch": 2, "len": 10, "loop": True, "xfade": 1},
                             "short": {"id": "cat/tone", "bus": "sfx", "ch": 1, "start": 2, "len": 1},
                             "bad": {"id": "cat/bad", "bus": "sfx", "ch": 1}}}
        RangeHandler.root = cls.tmp; cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), RangeHandler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown()

    def test_range_file_reads_a_zip_member_without_the_rest(self):
        f = B.HTTPRangeFile(f"http://127.0.0.1:{self.srv.server_port}/Fake.zip", block=64 * 1024)
        self.assertEqual(f.size, (self.tmp / "Fake.zip").stat().st_size)
        with zipfile.ZipFile(f) as z: self.assertEqual(z.read("cat/tone.wav"), self.blob)
    def test_build_makes_seamless_loops_and_trims_and_refuses_a_wrong_hash(self):
        out = self.tmp / "out"; logs = []
        index, failed = B.build(self.cues, self.lock, out, source_dir=self.tmp, log=logs.append)
        self.assertEqual([k for k, _ in failed], ["bad"]); self.assertFalse((out / "bad.ogg").exists(), "nothing is made from a file that fails its hash")
        self.assertAlmostEqual(index["loop"]["dur"], 9.0, delta=0.15, msg="10 s clip with a 1 s cross-fade is a 9 s loop")
        self.assertAlmostEqual(index["short"]["dur"], 1.0, delta=0.1)
        x = pcm(out / "loop.ogg"); top = max(abs(v) for v in x)
        rms = lambda seg: (sum(v * v for v in seg) / len(seg)) ** 0.5; n = 4800
        self.assertLess(abs(math.log10(rms(x[-n:]) / rms(x[:n]))) * 20, 3.0, "the end and the start are about as loud (no dip or jump at the seam)")
        self.assertLess(abs(x[-1] - x[0]), 0.6 * top, "and the join is not a hard step (a lossy codec keeps this from being sample-exact)")
        self.assertGreater(max(abs(x[len(x) // 2 + i]) for i in range(2000)), 0.3 * top, "and the middle is not silent")
        peak = max(abs(v) for v in pcm(out / "short.ogg")); self.assertTrue(0.55 < peak < 0.92, f"effects are levelled to about -3 dBFS (Opus overshoots a little) (peak {peak:.2f})")
        self.assertTrue(index["short"]["bytes"] < 12000 and (out / "index.json").exists())
    def test_up_to_date_cues_are_skipped_and_changed_ones_rebuilt(self):
        out = self.tmp / "out2"; cues = {"cues": {"short": self.cues["cues"]["short"]}}
        B.build(cues, self.lock, out, source_dir=self.tmp, log=lambda m: None)
        logs = []; B.build(cues, self.lock, out, source_dir=self.tmp, log=logs.append); self.assertTrue(any("up to date" in m for m in logs))
        cues["cues"]["short"] = {**cues["cues"]["short"], "len": 0.5}; logs = []; B.build(cues, self.lock, out, source_dir=self.tmp, log=logs.append)
        self.assertFalse(any("up to date" in m for m in logs))


if __name__ == "__main__": unittest.main()
