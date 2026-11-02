import json, sys
from faster_whisper import WhisperModel
m = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=2)
for n in sys.argv[1:]:
    import numpy as np; from scipy.io import wavfile; sr, a = wavfile.read(f"/home/claude/sn/audio/{n}.wav"); segs, _ = m.transcribe(a.astype(np.float32)/32768.0, word_timestamps=True, vad_filter=True, beam_size=5)
    out = []
    for s in segs:
        out.append({"start": s.start, "end": s.end, "text": s.text.strip(),
                    "words": [{"w": w.word, "s": w.start, "e": w.end} for w in s.words]})
        print(f"[{s.start:6.2f}-{s.end:6.2f}] {s.text.strip()}", flush=True)
    json.dump(out, open(f"/home/claude/sn/audio/{n}.json", "w"), indent=1)
