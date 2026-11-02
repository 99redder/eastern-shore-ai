#!/usr/bin/env python3
"""Segment renderer + joiner for the Survival Node battery videos.
Usage: build.py long|short"""
import subprocess, sys, os, json

SN = "/home/claude/sn/"
C1 = "/mnt/user-data/uploads/IMG_7108.MOV"
C2 = "/mnt/user-data/uploads/IMG_7111.MOV"
OV = SN + "ov/"
SEG = SN + "seg/"
os.makedirs(SEG, exist_ok=True)
FPS = 30
VENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(FPS)]
AENC = ["-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(" ".join(cmd)[:3000]); print(r.stderr[-3000:]); sys.exit(1)

def dur(f):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]))

def overlay_chain(base, ovs, n0, total):
    """ovs: list of (png, t0, t1) in output seconds. Returns filter text and final label."""
    parts, cur = [], base
    for i, (png, t0, t1) in enumerate(ovs):
        t0 = max(0.0, t0); t1 = min(total, t1)
        idx = n0 + i
        fo = max(t0, t1 - 0.3)
        parts.append(f"[{idx}:v]format=rgba,fade=t=in:st={t0:.3f}:d=0.3:alpha=1,fade=t=out:st={fo:.3f}:d=0.3:alpha=1[o{i}]")
        y = f"if(lt(t,{t0:.3f}),40,if(lt(t,{t0+0.35:.3f}),40*(1-(t-{t0:.3f})/0.35),0))"
        parts.append(f"[{cur}][o{i}]overlay=x=0:y='{y}':enable='between(t,{t0:.3f},{t1:.3f})'[b{i}]")
        cur = f"b{i}"
    return parts, cur

def clip_segment(name, src, ranges, ovs=(), center=(540, 965), afade=0.02, freeze=None, aranges=None):
    """ranges: [(a, b, zoom)] in source seconds, concatenated. ovs times in OUTPUT seconds.
    freeze: (src_time, seconds, zoom_from, zoom_to) appended as a slow-push still."""
    out = SEG + name + ".mov"
    if os.environ.get("REUSE") and os.path.exists(out): return out
    inputs = []
    fl, vl, al = [], [], []
    for i, (a, b, z) in enumerate(ranges):
        inputs += ["-ss", f"{a}", "-t", f"{b-a:.3f}", "-i", src]
        if aranges:
            inputs += ["-ss", f"{aranges[i][0]}", "-t", f"{aranges[i][1]-aranges[i][0]:.3f}", "-i", src]
        w, h = int(1080 / z) // 2 * 2, int(1920 / z) // 2 * 2
        x = (1080 - w) // 2
        y = max(0, min(1920 - h, center[1] - h // 2))
        vi = 2 * i if aranges else i
        ai = vi + 1 if aranges else i
        fl.append(f"[{vi}:v]setpts=PTS-STARTPTS,crop={w}:{h}:{x}:{y},scale=1080:1920:flags=lanczos,setsar=1,fps={FPS}[v{i}]")
        d = b - a
        fl.append(f"[{ai}:a]asetpts=PTS-STARTPTS,afade=t=in:d={afade},afade=t=out:st={d-afade:.3f}:d={afade}[a{i}]")
        vl.append(f"[v{i}]"); al.append(f"[a{i}]")
    total = sum(b - a for a, b, _ in ranges)
    n = len(ranges)
    if freeze:
        ft, fd, z0, z1 = freeze
        fi = len(inputs) // 2 if False else sum(1 for x in inputs if x == "-i")
        inputs += ["-ss", str(ft), "-i", src]
        frames = int(fd * FPS)
        zexpr = f"{z0}+({z1}-{z0})*on/{frames}"
        fl.append(f"[{fi}:v]trim=end_frame=1,scale=2160:3840,zoompan=z='{zexpr}':x='iw/2-(iw/zoom/2)':y='{center[1]*2}-(ih/zoom/2)':d={frames}:s=1080x1920:fps={FPS},setsar=1[vf]")
        fl.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{fd}[af]")
        vl.append("[vf]"); al.append("[af]")
        total += fd; n += 1
    fl.append("".join(v + a for v, a in zip(vl, al)) + f"concat=n={n}:v=1:a=1[cv][ca]")
    n0 = sum(1 for x in inputs if x == "-i")
    for png, *_ in ovs:
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", OV + png + ".png"]
    parts, last = overlay_chain("cv", ovs, n0, total)
    fl += parts
    fl.append(f"[{last}]null[vo]")
    fc = ";".join(fl)
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc, "-map", "[vo]", "-map", "[ca]", *VENC, *AENC, "-t", f"{total:.3f}", out])
    return out

def card_segment(name, png, seconds, music=None, mstart=0.0, mgain=-20, ovs=(), z0=1.0, z1=1.06):
    out = SEG + name + ".mov"
    if os.environ.get("REUSE") and os.path.exists(out): return out
    frames = int(seconds * FPS)
    inputs = ["-loop", "1", "-framerate", str(FPS), "-t", f"{seconds}", "-i", OV + png + ".png"]
    fl = [f"[0:v]scale=2160:3840,zoompan=z='{z0}+({z1}-{z0})*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps={FPS},setsar=1,trim=end_frame={frames}[cv]"]
    if music:
        inputs += ["-ss", str(mstart), "-t", str(seconds), "-i", music]
        fl.append(f"[1:a]volume={mgain}dB,afade=t=in:d=0.4,afade=t=out:st={seconds-0.8}:d=0.8,aresample=48000[ca]")
    else:
        fl.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{seconds}[ca]")
    n0 = sum(1 for x in inputs if x == "-i")
    for p, *_ in ovs:
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{seconds}", "-i", OV + p + ".png"]
    parts, last = overlay_chain("cv", ovs, n0, seconds)
    fl += parts + [f"[{last}]null[vo]"]
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(fl), "-map", "[vo]", "-map", "[ca]", *VENC, *AENC, "-t", f"{seconds}", out])
    return out

def join(segs, transitions, out_v, out_a_extra=None):
    """segs: list of files; transitions: list of (type, duration) between them (duration 0 = hard cut)."""
    inputs = []
    for s in segs: inputs += ["-i", s]
    fl = [f"[{i}:v]settb=AVTB,setpts=PTS-STARTPTS[n{i}]" for i in range(len(segs))]
    v, a = "[n0]", "[0:a]"
    t = dur(segs[0])
    for i in range(1, len(segs)):
        kind, d = transitions[i - 1]
        if d == 0:
            fl.append(f"{v}[n{i}]concat=n=2:v=1:a=0,settb=AVTB[vx{i}]")
            fl.append(f"{a}[{i}:a]concat=n=2:v=0:a=1[ax{i}]")
            t += dur(segs[i])
        else:
            off = t - d
            fl.append(f"{v}[n{i}]xfade=transition={kind}:duration={d}:offset={off:.3f}[vx{i}]")
            fl.append(f"{a}[{i}:a]acrossfade=d={d}:c1=tri:c2=tri[ax{i}]")
            t += dur(segs[i]) - d
        v, a = f"[vx{i}]", f"[ax{i}]"
    return inputs, fl, v, a, t

def finish(inputs, fl, v, a, out, extra_audio=None, voice_filter=True):
    """Final encode: voice cleanup + loudness; optional music bed ducked under voice."""
    af = "highpass=f=80,afftdn=nr=8:nf=-45,acompressor=threshold=-20dB:ratio=3:attack=10:release=200" if voice_filter else "anull"
    fl = list(fl)
    if extra_audio:
        mi = len(inputs) // 2
        inputs = inputs + ["-i", extra_audio["file"]]
        fl.append(f"{a}{af},asplit=2[vox][key]")
        fl.append(f"[{mi}:a]volume={extra_audio['gain']}dB,aresample=48000[mus]")
        fl.append("[mus][key]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=450:makeup=1[duck]")
        fl.append("[vox][duck]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=9[ao]")
    else:
        fl.append(f"{a}{af},loudnorm=I=-16:TP=-1.5:LRA=9[ao]")
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(fl), "-map", v, "-map", "[ao]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(FPS),
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out])
    print("wrote", out, f"{dur(out):.1f}s")

# ------------------------------------------------------------------ LONG
def build_long():
    bed = SN + "music/bed.wav"
    segs = []
    segs.append(card_segment("L0_title", "title", 4.0, music=bed, mstart=0.0, mgain=-14))
    # Clip 1, part A: intro (cut the pause at 34.95-38.95)
    A = [(2.30, 14.50, 1.0), (14.50, 34.95, 1.16)]
    segs.append(clip_segment("L1", C1, A, ovs=[("lt_name", 0.7, 6.2), ("lt_phone", 17.2 - 2.3, 34.95 - 2.3 - 0.2)]))
    # Clip 1, part B (source 38.95 -> 191.0); overlay times converted to output seconds (minus 38.95)
    B = [(38.95, 67.20, 1.12), (67.20, 94.40, 1.0), (94.40, 113.80, 1.14), (113.80, 128.40, 1.0),
         (128.40, 141.20, 1.0), (141.20, 148.00, 1.0), (148.00, 173.70, 1.0), (173.70, 191.00, 1.12)]
    o = lambda s: s - 38.95
    segs.append(clip_segment("L2", C1, B, ovs=[
        ("lt_step1", o(40.2), o(66.6)), ("lt_why", o(68.0), o(93.8)), ("lt_step2", o(95.0), o(113.2)),
        ("lt_step3", o(114.3), o(127.9)), ("lt_app", o(128.6), o(140.6)), ("badge13", o(143.4), o(158.4)),
        ("lt_cycle", o(158.6), o(173.3)), ("lt_cutoff", o(173.9), o(182.5))]))
    segs.append(card_segment("L3_inter", "inter", 3.2, music=bed, mstart=0.0, mgain=-16))
    C = [(1.70, 51.10, 1.0)]
    segs.append(clip_segment("L4", C2, C, center=(540, 960), ovs=[
        ("result", 6.1, 12.6), ("lt_email", 13.5 - 1.7, 29.4 - 1.7), ("lt_ship", 29.7 - 1.7, 41.0 - 1.7),
        ("lt_cutoff", 48.7 - 1.7, 49.4)]))
    segs.append(card_segment("L5_end", "end", 5.0, music=bed, mstart=0.0, mgain=-14))
    tr = [("fade", 0.5), ("fade", 0.25), ("fadeblack", 0.5), ("fadeblack", 0.5), ("fade", 0.6)]
    inputs, fl, v, a, t = join(segs, tr, None)
    finish(inputs, fl, v, a, SN + "out/survival_node_battery_test_long.mp4")

def charge_segment(name, src, t_frame, seconds, atrim, center=(540, 965)):
    """Frozen 13% frame + animated charging HUD (13->80) + VO snippet then silence."""
    out = SEG + name + ".mov"
    if os.environ.get("REUSE") and os.path.exists(out): return out
    a, b = atrim
    rate = 68 / (seconds - 0.9)
    fl = [f"[0:v]trim=end_frame=1,scale=2160:3840,zoompan=z='1.0+0.08*on/{int(seconds*FPS)}':x='iw/2-(iw/zoom/2)':y='{center[1]*2}-(ih/zoom/2)':d={int(seconds*FPS)}:s=1080x1920:fps={FPS},setsar=1[bg]",
          f"[2:v]fps={FPS},tpad=stop_mode=clone:stop_duration={seconds},format=rgba,fade=t=in:d=0.25:alpha=1[hud]",
          f"[bg][hud]overlay=0:0:shortest=0,trim=duration={seconds}[vo]",
          f"[1:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b-a-0.03:.3f}:d=0.03,apad,atrim=0:{seconds}[ao]"]
    run(["ffmpeg", "-y", "-v", "error", "-ss", str(t_frame), "-i", src, "-i", src,
         "-framerate", f"{rate:.4f}", "-start_number", "13", "-i", OV + "chg_%03d.png",
         "-filter_complex", ";".join(fl), "-map", "[vo]", "-map", "[ao]", *VENC, *AENC, "-t", str(seconds), out])
    return out

FIX = {"active battery battery": "AccuBattery", "accu-battery": "AccuBattery"}

def words_for(src_json, a, b, off):
    ws = [w for s in json.load(open(src_json)) for w in s["words"]]
    out = []
    for w in ws:
        if w["w"].strip() == "%" and out and w["s"] <= b + 0.1:
            out[-1]["w"] += "%"; continue
        if w["s"] >= a - 0.05 and w["e"] <= b + 0.15:
            t = w["w"].strip()
            if t in ("%",) and out:
                out[-1]["w"] += "%"; out[-1]["e"] = w["e"] - a + off; continue
            out.append({"w": t, "s": w["s"] - a + off, "e": min(w["e"], b) - a + off})
    # merge "active battery battery" -> AccuBattery
    i = 0
    while i < len(out) - 2:
        if [x["w"].lower().strip(",.") for x in out[i:i+3]] == ["active", "battery", "battery"]:
            out[i:i+3] = [{"w": "AccuBattery,", "s": out[i]["s"], "e": out[i+2]["e"]}]
        i += 1
    out = [x for i, x in enumerate(out) if not (x["w"].lower() == "a" and i + 1 < len(out) and out[i+1]["w"].lower() == "hundred")]
    for x in out:
        if x["w"].lower() == "hundred": x["w"] = "100"
    i = 0
    while i < len(out) - 1:
        if out[i]["w"] == "100" and out[i+1]["w"].lower().startswith("percent"):
            out[i] = {"w": "100%" + out[i+1]["w"][7:], "s": out[i]["s"], "e": out[i+1]["e"]}; del out[i+1]
        i += 1
    return out

def ass_time(t):
    t = max(0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def write_ass(words, path, hide=(), cap_end=1e9):
    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter ExtraBold,86,&H00FFE500,&H00FFFFFF,&H00100B0A,&H96000000,0,0,0,0,100,100,0,0,1,7,4,2,60,60,430,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    groups, cur = [], []
    for w in words:
        if cur and (len(cur) >= 3 or w["s"] - cur[-1]["e"] > 0.45 or cur[-1]["w"][-1] in ".,?!"):
            groups.append(cur); cur = []
        cur.append(w)
    if cur: groups.append(cur)
    lines = []
    for gi, g in enumerate(groups):
        st = g[0]["s"]; en = g[-1]["e"] + 0.15
        if gi + 1 < len(groups): en = min(en + 0.25, groups[gi + 1][0]["s"])
        en = min(en, cap_end)
        if any(h0 <= st < h1 for h0, h1 in hide): continue
        txt = ""
        for w in g:
            k = max(1, int(round((w["e"] - w["s"]) * 100)))
            pre = max(0, int(round((w["s"] - st) * 100)) - sum(int(x) for x in []))
            txt += "{\\k%d}%s " % (k, w["w"].upper().rstrip(",."))
        # rebuild with gaps as \k on spaces
        txt = ""; t = st
        for w in g:
            gap = int(round((w["s"] - t) * 100))
            if gap > 0: txt += "{\\k%d}" % gap
            txt += "{\\kf%d}%s " % (max(1, int(round((w["e"] - w["s"]) * 100))), w["w"].upper().rstrip(",."))
            t = w["e"]
        lines.append(f"Dialogue: 0,{ass_time(st)},{ass_time(en)},Cap,,0,0,0,,{{\\fad(60,60)}}{txt.strip()}")
    open(path, "w").write(head + "\n".join(lines) + "\n")

# ------------------------------------------------------------------ SHORT
def build_short():
    J1, J2 = SN + "audio/7108.json", SN + "audio/7111.json"
    d1, d2, d3, d4, d5 = 9.6, 5.2, 11.15, 5.6, 3.5
    hit = d1 + d2 + (8.13 - 1.95)
    total = d1 + d2 + d3 + d4 + d5 - 0.4
    subprocess.run(["python3", SN + "music/synth_bed.py", SN + "music/short_bed.wav", f"{total+0.5:.2f}", f"{hit:.3f}", f"{d1:.2f}"], check=True)
    segs = []
    segs.append(clip_segment("S1", C1, [(136.0, 145.6, 1.0)], aranges=[(144.80, 154.40)],
                             ovs=[("hook", 0.0, 3.8), ("badge13", 7.3, 9.6)]))
    segs.append(charge_segment("S2", C1, 145.55, d2, (162.70, 166.55)))
    segs.append(clip_segment("S3", C2, [(1.95, 13.10, 1.0)], center=(540, 960), ovs=[("result", hit - d1 - d2, d3)]))
    segs.append(clip_segment("S4", C2, [(45.25, 50.85, 1.06)], center=(540, 960), ovs=[("lt_every", 0.3, d4)]))
    segs.append(card_segment("S5", "end", d5, z0=1.0, z1=1.05))
    words = (words_for(J1, 144.80, 154.40, 0) + words_for(J1, 162.70, 166.55, d1) +
             words_for(J2, 1.95, 13.10, d1 + d2) + words_for(J2, 45.25, 50.85, d1 + d2 + d3))
    write_ass(words, SN + "short_caps.ass", cap_end=d1 + d2 + d3 + d4 - 0.45)
    tr = [("fade", 0), ("fade", 0), ("fade", 0), ("fade", 0.4)]
    inputs, fl, v, a, t = join(segs, tr, None)
    fl.append(f"{v}subtitles={SN}short_caps.ass:fontsdir=/usr/share/fonts/opentype/inter[vsub]")
    finish(inputs, fl, "[vsub]", a, SN + "out/survival_node_battery_test_short.mp4",
           extra_audio={"file": SN + "music/short_bed.wav", "gain": -9})

if __name__ == "__main__":
    os.makedirs(SN + "out", exist_ok=True)
    {"long": build_long, "short": build_short}[sys.argv[1]]()
