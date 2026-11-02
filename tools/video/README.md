# Survival Node video pipeline

Scripts that made the Battery Health Test videos (Nov 2026): long version for `testing.html` (YouTube 3wSWWJK-iHs) and short version for social (YouTube Short Bzzoj4WEhsw, X, Facebook/Instagram Reels). Reuse them for the next videos (unboxing is next).

Everything runs in a Claude cloud session; paths are hard-coded to `/home/claude/sn/`. To start a new video, copy this folder there:

```bash
mkdir -p /home/claude/sn/music && cp /home/claude/eastern-shore-ai/tools/video/*.py /home/claude/sn/ && mv /home/claude/sn/synth_bed.py /home/claude/sn/music/
```

## Pieces

| File | What it does |
|---|---|
| `synth_bed.py` | Original music bed (D minor, 100 BPM, dark cinematic). Deterministic (seed 7), so the same track every time; no copyright claims possible. `synth_bed.py OUT.wav SECONDS [HIT_TIME] [ARP_START]`: drums/arp stop and a boom lands at `HIT_TIME`. Long version uses the first seconds (pad only) under the cards; short version gets a bed built to the exact cut. |
| `transcribe.py` | faster-whisper `small.en` word timings → `audio/<clip>.json`. Needs `pip install --break-system-packages faster-whisper`; audio extracted first as 16 kHz mono WAV. |
| `overlays.py` | Brand overlays as 1080×1920 PNGs: lower thirds (pink Orbitron kicker + Inter ExtraBold line on a dark clipped-corner panel with cyan rail), result card, callout badge, hook text, charging-ring frames, title / interstitial / end cards (EA icon from `survival-node-app/icon-512-app.png`). Orbitron comes from `fonts/orbitron-700-latin.woff2` converted to TTF with fontTools; body text uses system Inter (Hanken's web subset lacks · → ✓). |
| `build.py` | ffmpeg assembly. `clip_segment` (per-range input seeking, punch-in zoom per range, overlays with fade + slide-up), `card_segment`, `charge_segment` (freeze frame + animated HUD), `join` (cuts / xfades), `finish` (voice cleanup, music ducked under voice with sidechain, loudnorm −16 LUFS long / −14 short, H.264 + faststart). `build.py long|short`; `REUSE=1` skips segments already rendered. |
| `make_srt.py` | YouTube captions for the long version from the word timings, with spelling fixes (debloat, AccuBattery, 100%). |

The timelines (`build_long`, `build_short`, overlay text in `overlays.py __main__`) are specific to the battery video; write new ones for each video.

## Format we settled on

- Vertical 1080×1920, 30 fps. Long version embedded on `testing.html` in a `.video-embed-wrap.portrait` card; short versions in `.video-short-frame` on `node.html`.
- Long: title card → talking footage with step lower thirds and punch-ins at topic changes → callout on the key number → end card (EA icon, "SURVIVAL NODE GEN 2", easternshore.ai). No burned subtitles; upload the SRT to YouTube.
- Short (~30–40 s): hook text over the first 3 s, best 3–4 lines of VO, big karaoke captions (ASS, Inter ExtraBold, cyan fill as words are spoken), music bed with the boom on the payoff line, end card.
- No prices in videos (sale prices change). Use "Chris" on screen, never "Red".
- Gotchas: don't use many `trim` branches on one input (holds frames in memory, the encode gets killed); xfade after concat needs `settb=AVTB`; check overlays for missing glyphs in Orbitron (no ·, →, ✓).
