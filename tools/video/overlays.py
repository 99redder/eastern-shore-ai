#!/usr/bin/env python3
"""Render brand overlay PNGs (1080x1920 RGBA) for the Survival Node battery videos."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
F = "/home/claude/sn/fonts/"
OUT = "/home/claude/sn/ov/"
os.makedirs(OUT, exist_ok=True)
CYAN = (0, 229, 255)
PINK = (255, 79, 216)
VIOLET = (200, 80, 255)
BG = (10, 11, 16)
WHITE = (240, 244, 252)
MUTED = (160, 168, 190)

def font(name, size): return ImageFont.truetype(F + name, size)
ORB = lambda s: font("orbitron-700-latin.ttf", s)
I="/usr/share/fonts/opentype/inter/"
HXB = lambda s: ImageFont.truetype(I+"Inter-ExtraBold.otf", s)
HSB = lambda s: ImageFont.truetype(I+"Inter-SemiBold.otf", s)
HMD = lambda s: ImageFont.truetype(I+"Inter-Medium.otf", s)

def glow_text(img, xy, text, f, fill, glow, radius=14, anchor="la", strength=2):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text(xy, text, font=f, fill=glow + (255,), anchor=anchor)
    g = layer.filter(ImageFilter.GaussianBlur(radius))
    for _ in range(strength):
        img.alpha_composite(g)
    ImageDraw.Draw(img).text(xy, text, font=f, fill=fill, anchor=anchor)

def hull(d, box, cut, fill, outline=None, width=0):
    """Panel with clipped ('battle-damaged') top-left and bottom-right corners, like the site's cards."""
    x0, y0, x1, y1 = box
    pts = [(x0 + cut, y0), (x1, y0), (x1, y1 - cut), (x1 - cut, y1), (x0, y1), (x0, y0 + cut)]
    d.polygon(pts, fill=fill)
    if outline:
        d.line(pts + [pts[0]], fill=outline, width=width, joint="curve")

def text_w(f, t): return f.getlength(t)

def lower_third(name, kicker, main, y=1590):
    """Kicker (pink, small caps) + main line, on a dark hull panel with a cyan rail."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fk, fm = ORB(30), HXB(52)
    # wrap main if wide
    maxw = W - 50 - 50 - 110
    lines, cur = [], ""
    for word in ([] if "\n" in main else main.split()):
        t = (cur + " " + word).strip()
        if text_w(fm, t) > maxw and cur:
            lines.append(cur); cur = word
        else:
            cur = t
    lines.append(cur)
    if "\n" in main: lines = main.split("\n")
    pw = max(max(text_w(fm, l) for l in lines), text_w(fk, kicker)) + 110
    ph = 70 + 66 * len(lines) + 34
    x0, y0 = 50, y
    box = (x0, y0, x0 + pw, y0 + ph)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle((box[0] + 6, box[1] + 10, box[2] + 6, box[3] + 10), fill=(0, 0, 0, 150))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hull(ImageDraw.Draw(glow), box, 22, None, outline=CYAN + (255,), width=4)
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(img)
    hull(d, box, 22, BG + (232,), outline=CYAN + (230,), width=2)
    d.rectangle((x0 + 26, y0 + 30, x0 + 34, box[3] - 30), fill=PINK + (255,))
    d.text((x0 + 60, y0 + 28), kicker, font=fk, fill=PINK + (255,))
    for i, l in enumerate(lines):
        d.text((x0 + 60, y0 + 72 + 66 * i), l, font=fm, fill=WHITE + (255,))
    img.save(OUT + name + ".png")

def result_card(name, y=110):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    box = (90, y, W - 90, y + 330)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle(box, fill=(0, 0, 0, 170))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(24)))
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hull(ImageDraw.Draw(gl), box, 30, None, outline=CYAN + (255,), width=6)
    img.alpha_composite(gl.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(img)
    hull(d, box, 30, BG + (238,), outline=CYAN + (255,), width=3)
    d.text((W // 2, y + 52), "BATTERY HEALTH", font=ORB(38), fill=PINK + (255,), anchor="mm")
    glow_text(img, (W // 2, y + 160), "100%", ORB(150), WHITE + (255,), CYAN, radius=18, anchor="mm")
    d = ImageDraw.Draw(img)
    d.text((W // 2, y + 278), "4,981 of 5,000 mAh  ·  Cleared to ship", font=HSB(44), fill=WHITE + (255,), anchor="mm")
    img.save(OUT + name + ".png")

def badge_13(name):
    """Callout pinned near the 13% ring in clip 1 (~frame 145s)."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    box = (240, 150, W - 240, 330)
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hull(ImageDraw.Draw(gl), box, 24, None, outline=PINK + (255,), width=6)
    img.alpha_composite(gl.filter(ImageFilter.GaussianBlur(12)))
    d = ImageDraw.Draw(img)
    hull(d, box, 24, BG + (236,), outline=PINK + (255,), width=3)
    d.text((W // 2, 205), "DRAINED TO 13%", font=ORB(50), fill=WHITE + (255,), anchor="mm")
    d.text((W // 2, 280), "Test starts below 15%  ✓", font=HSB(44), fill=CYAN + (255,), anchor="mm")
    img.save(OUT + name + ".png")

def hook(name, l1, l2):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    grad = Image.new("RGBA", (W, 520), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for yy in range(520):
        gd.line((0, yy, W, yy), fill=(5, 6, 10, int(215 * (1 - yy / 520) ** 1.2)))
    img.alpha_composite(grad, (0, 0))
    glow_text(img, (W // 2, 170), l1, ORB(64), WHITE + (255,), CYAN, radius=12, anchor="mm")
    glow_text(img, (W // 2, 262), l2, ORB(64), WHITE + (255,), PINK, radius=12, anchor="mm")
    img.save(OUT + name + ".png")

def charging_frame(name, pct):
    """Charging HUD drawn over the frozen 13% shot; one PNG per step."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    veil = Image.new("RGBA", (W, H), (5, 6, 10, 150))
    img.alpha_composite(veil)
    cx, cy = W // 2, 860
    d = ImageDraw.Draw(img)
    r = 250
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(60, 64, 80, 255), width=22)
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(gl).arc((cx - r, cy - r, cx + r, cy + r), -90, -90 + 360 * pct / 100, fill=CYAN + (255,), width=30)
    img.alpha_composite(gl.filter(ImageFilter.GaussianBlur(16)))
    img.alpha_composite(gl)
    glow_text(img, (cx, cy - 10), f"{pct}%", ORB(130), WHITE + (255,), CYAN, radius=14, anchor="mm")
    d = ImageDraw.Draw(img)
    d.text((cx, cy + 120), "CHARGING", font=ORB(40), fill=PINK + (255,), anchor="mm")
    d.text((cx, cy + r + 110), "Full charge cycle: 13% → 80%", font=HSB(52), fill=WHITE + (255,), anchor="mm")
    img.save(OUT + name + ".png")

def bolt(img, cx, cy, s, color):
    pts = [(0.15, -0.5), (-0.25, 0.08), (0.02, 0.08), (-0.12, 0.5), (0.28, -0.1), (0.0, -0.1), (0.15, -0.5)]
    pts = [(cx + x * s, cy + y * s) for x, y in pts]
    gl = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(gl).polygon(pts, fill=color + (255,))
    img.alpha_composite(gl.filter(ImageFilter.GaussianBlur(s * 0.08)))
    ImageDraw.Draw(img).polygon(pts, fill=color + (255,))

def card_bg(src_frame):
    bg = Image.open(src_frame).convert("RGB").resize((W, H)).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new("RGB", (W, H), BG), 0.72).convert("RGBA")
    # faint scanlines
    sl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sl)
    for yy in range(0, H, 6):
        sd.line((0, yy, W, yy), fill=(0, 0, 0, 40))
    bg.alpha_composite(sl)
    return bg

def title_card(name, frame):
    img = card_bg(frame)
    d = ImageDraw.Draw(img)
    glow_text(img, (W // 2, 760), "SURVIVAL NODE", ORB(92), WHITE + (255,), CYAN, radius=18, anchor="mm")
    glow_text(img, (W // 2, 870), "GEN 2", ORB(70), PINK + (255,), PINK, radius=16, anchor="mm", strength=1)
    d = ImageDraw.Draw(img)
    d.line((240, 960, W - 240, 960), fill=CYAN + (200,), width=3)
    d.text((W // 2, 1040), "Battery Health Test", font=HXB(76), fill=WHITE + (255,), anchor="mm")
    d.text((W // 2, 1130), "How every phone is checked before it ships", font=HMD(42), fill=MUTED + (255,), anchor="mm")
    img.convert("RGB").save(OUT + name + ".png")

def inter_card(name, frame):
    img = card_bg(frame)
    bolt(img, W // 2, 820, 170, CYAN)
    glow_text(img, (W // 2, 990), "CHARGING", ORB(84), WHITE + (255,), CYAN, radius=16, anchor="mm")
    glow_text(img, (W // 2, 1100), "13%  TO  80%", ORB(70), PINK + (255,), PINK, radius=14, anchor="mm", strength=1)
    d = ImageDraw.Draw(img)
    d.text((W // 2, 1220), "A few hours later…", font=HMD(46), fill=MUTED + (255,), anchor="mm")
    img.convert("RGB").save(OUT + name + ".png")

def end_card(name, frame):
    img = card_bg(frame)
    icon = Image.open("/home/claude/eastern-shore-ai/survival-node-app/icon-512-app.png").convert("RGBA").resize((380, 380))
    m = Image.new("L", icon.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, 379, 379), 70, fill=255)
    icon.putalpha(m)
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(gl).rounded_rectangle((350, 470, 730, 850), 70, outline=CYAN + (255,), width=8)
    img.alpha_composite(gl.filter(ImageFilter.GaussianBlur(20)))
    img.alpha_composite(icon, (350, 470))
    glow_text(img, (W // 2, 1000), "SURVIVAL NODE GEN 2", ORB(66), WHITE + (255,), CYAN, radius=14, anchor="mm")
    d = ImageDraw.Draw(img)
    d.text((W // 2, 1090), "Tested before it ships.", font=HXB(58), fill=WHITE + (255,), anchor="mm")
    glow_text(img, (W // 2, 1230), "easternshore.ai", ORB(60), PINK + (255,), PINK, radius=12, anchor="mm", strength=1)
    d = ImageDraw.Draw(img)
    d.text((W // 2, 1320), "Veteran-owned  ·  Maryland's Eastern Shore", font=HMD(40), fill=MUTED + (255,), anchor="mm")
    img.convert("RGB").save(OUT + name + ".png")

if __name__ == "__main__":
    fr = "/home/claude/sn/frames/"
    lower_third("lt_name", "CHRIS", "Eastern Shore AI")
    lower_third("lt_phone", "THE PHONE", "Moto G Power 2024 · 8 GB RAM")
    lower_third("lt_step1", "STEP 1  |  ON ARRIVAL", "Factory reset + debloat")
    lower_third("lt_why", "WHY DEBLOAT", "Background apps drain battery")
    lower_third("lt_step2", "STEP 2  |  STORAGE", "Charged to 60%, powered off")
    lower_third("lt_step3", "STEP 3  |  WHEN IT SELLS", "Update apps, run the test")
    lower_third("lt_app", "THE TEST", "AccuBattery capacity test")
    lower_third("lt_cycle", "THE CYCLE", "Under 15%  →  80%  →  result")
    lower_third("lt_cutoff", "THE CUTOFF", "Under 90% health = not used")
    lower_third("lt_email", "PROOF FOR YOU", "This result is linked\nin your shipping email")
    lower_third("lt_ship", "BEFORE IT SHIPS", "Drained below 30%\nfor lithium shipping rules")
    lower_third("lt_every", "EVERY PHONE", "Tested before it ships")
    result_card("result")
    badge_13("badge13")
    hook("hook", "EVERY BATTERY", "TESTED BEFORE IT SHIPS")
    for p in range(13, 81):
        charging_frame(f"chg_{p:03d}", p)
    title_card("title", fr + "bg_home.jpg")
    inter_card("inter", fr + "bg_home.jpg")
    end_card("end", fr + "bg_home.jpg")
    print("overlays done")
