#!/usr/bin/env python3
"""YouTube captions (SRT) for the long version, from whisper word timings mapped onto the edit."""
import json, re

SN = "/home/claude/sn/"
# (json, src_start, src_end, output_offset) — must match build_long timeline
L1 = 3.5
L2 = L1 + (34.95 - 2.30) - 0.25
L4 = L2 + (191.0 - 38.95) - 0.5 + 3.2 - 0.5
PIECES = [("7108", 2.30, 34.95, L1), ("7108", 38.95, 191.0, L2), ("7111", 1.70, 51.10, L4)]
FIXES = [(r"\bdeep loading\b", "debloating"), (r"\bde-load(ed)?\b", r"debloat\1"), (r"\bde-load\b", "debloat"),
         (r"\bAccu-battery\b", "AccuBattery"), (r"\bactive battery battery health\b", "AccuBattery. Battery health"),
         (r"\ba hundred percent\b", "100%"), (r"\bdoing a lot to just start\b", "about to start"),
         (r"\bAI LLMs\b", "AI LLMs"), (r" %", "%"), (r"\bour entire charge cycle\b", "an entire charge cycle")]

def ts(t):
    t = max(0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s - int(s)) * 1000)) % 1000:03d}"

cues = []
for name, a, b, off in PIECES:
    ws = [w for s in json.load(open(f"{SN}audio/{name}.json")) for w in s["words"] if a - 0.05 <= w["s"] and w["e"] <= b + 0.2]
    cur = []
    for w in ws:
        text = "".join(x["w"] for x in cur + [w]).strip()
        if cur and (len(text) > 74 or w["s"] - cur[-1]["e"] > 0.7 or cur[-1]["w"].strip()[-1] in ".?!"):
            cues.append((cur[0]["s"] - a + off, cur[-1]["e"] - a + off, "".join(x["w"] for x in cur).strip()))
            cur = []
        cur.append(w)
    if cur:
        cues.append((cur[0]["s"] - a + off, min(cur[-1]["e"], b) - a + off, "".join(x["w"] for x in cur).strip()))

out = []
for i, (s, e, t) in enumerate(cues, 1):
    for pat, rep in FIXES:
        t = re.sub(pat, rep, t, flags=re.I)
    if len(t) > 42:  # two lines, split near the middle on a space
        mid = len(t) // 2
        cut = min((abs(m.start() - mid), m.start()) for m in re.finditer(" ", t))[1]
        t = t[:cut] + "\n" + t[cut + 1:]
    nxt = cues[i][0] if i < len(cues) else e + 1
    out.append(f"{i}\n{ts(s)} --> {ts(min(e + 0.3, nxt))}\n{t}\n")
open(SN + "out/survival_node_battery_test_long.srt", "w").write("\n".join(out))
print(len(out), "cues")
