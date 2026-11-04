# Sound

Music per level, effects and 3D monsters, all made from the author's sound library (`Pipelines-Plugin/sound-library`, release `SFX_2026_01`). Nothing audio is committed except small text files; the sounds are built from the library when the game is deployed.

## How it is made

- `audio/cues.json`: every sound the game plays. Each cue names a library sound (`id`), how to trim it (`start`, `len`), whether it loops (`loop`, with a cross-fade `xfade` so the seam is seamless), a `gain_db`, mono or stereo, and its bus. **To swap a sound, change its `id`** (find ids with `python3 sound-library/library.py search "growl"`), then run the two commands below.
- `python3 tools/make_lock.py --catalog ../Pipelines-Plugin/sound-library/catalog.json` resolves the ids against the library's catalog into `audio/sources.lock.json` (release asset, zip member, sha256), so this repo does not need the other one to build.
- `python3 tools/build_audio.py` reads only the needed members out of the public zips with HTTP range requests (a 1 GB zip is never downloaded whole), checks each file's sha256, then ffmpeg trims, loops, levels (effects to about -3 dBFS peak, music to about -24 dB average) and encodes Opus in Ogg: effects mono 28 kbps, music stereo 64 kbps. Output `audio/files/*.ogg` and `audio/files/index.json` (git-ignored, 6.3 MB for 58 cues). Re-runs skip what has not changed.
- The `Dockerfile` runs the build in its own stage, cached until the cue sheet, the lock or the script change. If the library cannot be reached the image still builds and the game is silent; the build lists the failed cues in `index.json` (`_failed`).
- Tests: `python3 -m unittest tools/test_build_audio.py` (fake zip, a local server that speaks range requests), `node --test shared/mix.test.js` (the rules), `node tools/audio_test.mjs` (the engine against the real files in headless Chromium).

## What plays

- **Music** (`audio/engine.js`, rules in `shared/mix.js`): each level has a score piece and an atmosphere, cross-faded for 2.5 s when you change floor; the score is darkened with a low-pass and played a little slow. B1 Endless Wandering over a deep drone; L1 Lost Between Stars over a hollow-electric atmosphere; L2 Through Silent Valleys over a cold one; L3 (the breather) Fragments of Dawn over a hopeful one, with no danger layers; L4 a danger atmosphere over a machine one, plus the alarm. The results screen has its own resolve piece (Veil of Tomorrow).
- **Danger layers:** three tension loops (`t_1` to `t_3`) fade in as a monster hunting someone on your floor gets closer (within about 32 m), more with two hunters, and the score ducks to about 65%; they fade out slowly when the hunt ends. Under 36 HP a heartbeat comes in, and a faster one under about 20.
- **Effects:** your footsteps (pace sets the rhythm and level; crouching is nearly silent, running loud), teammates' footsteps in 3D, doors (creak, close, lock), fuse take/slot/drop, switches, keypad digits and result, the power coming on, the gun (and the empty click), the glitch when a monster is banished, the beacon (roll, ticking LED, end), the cloak (on, off, flat), the locker and pickups, hurt, down and lift, the finale and the exit.
- **Monsters in 3D:** each has a positioned breathing loop, footsteps at its speed, a growl when it starts hunting (and a sting if it is close), through an HRTF panner with distance falloff. A wall between you and a sound makes it quieter and duller (a line-of-sight test every 0.2 s), so a monster behind a wall is a muffled presence you can still place. Sounds beyond about 32 m (55 for loud ones) are not started, and there is a cap of 34 voices.
- **The alarm** is synthesised in the browser (the library has no siren): a two-tone siren whose period shortens from 1.7 s to 0.7 s as the 60 s run out.
- **Controls:** music and effects sliders on the lobby screen (kept in the browser), `N` mutes. Sound starts on your first click or key press (browsers require a gesture). Bots (`?bot=1`) get no sound.

## Limits

- Opus in Ogg plays in Chrome, Firefox, Edge and Safari 18.4 or later; older Safari stays silent without errors.
- The first mapping of sounds to events was chosen by name, length and measurement, not by ear: expect to swap some. All of it is data in `audio/cues.json`.
- The first Railway build reads about 760 MB from GitHub; later builds reuse the cached stage.
