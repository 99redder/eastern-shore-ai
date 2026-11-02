#!/usr/bin/env python3
"""Original instrumental bed for Survival Node short: dark cinematic tension, 100 BPM, D minor.
Usage: synth_bed.py OUT.wav [seconds]"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
BPM = 100
BEAT = 60 / BPM
out = sys.argv[1]
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 40.0
HIT = float(sys.argv[3]) if len(sys.argv) > 3 else DUR - 3.0
ARP0 = float(sys.argv[4]) if len(sys.argv) > 4 else 32 * BEAT
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

def hz(m): return 440 * 2 ** ((m - 69) / 12)
def lp(x, fc): return sosfilt(butter(2, fc, 'low', fs=SR, output='sos'), x)
def hp(x, fc): return sosfilt(butter(2, fc, 'high', fs=SR, output='sos'), x)
def env_ar(n, a, r):
    e = np.ones(n); a = min(int(a * SR), n); r = min(int(r * SR), n)
    e[:a] = np.linspace(0, 1, a)
    if r: e[n - r:] = np.minimum(e[n - r:], np.linspace(1, 0, r))
    return e

L = np.zeros(N); R = np.zeros(N)

# --- Pad: Dm - Bb - F - C, 2 bars each (8 beats)
chords = [[50, 57, 62, 65], [46, 53, 58, 62], [41, 48, 53, 57], [48, 55, 60, 64]]
bar2 = 8 * BEAT
i = 0; start = 0.0
while start < DUR:
    ch = chords[i % 4]
    s = int(start * SR); n = min(int(bar2 * SR) + int(0.6 * SR), N - s)
    tt = np.arange(n) / SR
    for k, m in enumerate(ch):
        for det, pan in ((-0.08, 0.3), (0.08, 0.7)):
            f = hz(m) * 2 ** (det / 12)
            saw = 2 * ((tt * f + rng.random()) % 1) - 1
            w = saw * env_ar(n, 1.2, 0.8) * 0.045
            L[s:s + n] += w * (1 - pan); R[s:s + n] += w * pan
    start += bar2; i += 1
L = lp(L, 1400); R = lp(R, 1400)

# --- Sub pulse on every beat (enters bar 3), brighter kick from bar 9
beat = 0
while beat * BEAT < DUR:
    s = int(beat * BEAT * SR); n = min(int(0.45 * SR), N - s); tt = np.arange(n) / SR
    if beat >= 8 and beat * BEAT < HIT - 0.05:
        f = 45 + 70 * np.exp(-tt * 30)
        k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7) * 0.5
        L[s:s + n] += k; R[s:s + n] += k
    beat += 1

# --- Hi-hat ticks on 8ths (enter at bar 5), offbeat accent
noise_len = int(0.05 * SR)
step = 0
while step * BEAT / 2 < DUR:
    tsec = step * BEAT / 2
    if 16 * BEAT <= tsec < HIT - 0.05:
        s = int(tsec * SR); n = min(noise_len, N - s)
        h = hp(rng.standard_normal(n), 7000) * np.exp(-np.arange(n) / SR * 80)
        g = 0.09 if step % 2 else 0.05
        L[s:s + n] += h * g * 0.8; R[s:s + n] += h * g
    step += 1

# --- Pulsing arp (D minor) from bar 9, 16ths, filtered
arp = [62, 65, 69, 74, 69, 65]
step = 0
while step * BEAT / 4 < DUR:
    tsec = step * BEAT / 4
    if ARP0 <= tsec < HIT - 0.05:
        s = int(tsec * SR); n = min(int(BEAT / 4 * SR), N - s); tt = np.arange(n) / SR
        f = hz(arp[step % len(arp)])
        sq = np.sign(np.sin(2 * np.pi * f * tt)) * np.exp(-tt * 18) * 0.035
        pan = 0.3 if step % 2 else 0.7
        L[s:s + n] += sq * (1 - pan); R[s:s + n] += sq * pan
    step += 1

# --- Riser into the end hit (last 4 s before final 3 s)
hit_t = HIT
rs, re_ = int((hit_t - 4) * SR), int(hit_t * SR)
tt = np.arange(re_ - rs) / SR
riser = hp(rng.standard_normal(re_ - rs), 2000) * (tt / tt[-1]) ** 2 * 0.12
L[rs:re_] += riser; R[rs:re_] += riser
# Impact + low boom
s = int(hit_t * SR); n = min(N - s, int(4 * SR)); tt = np.arange(n) / SR
boom = np.sin(2 * np.pi * (40 * tt + 30 / 8 * (1 - np.exp(-tt * 8)))) * np.exp(-tt * 1.5) * 0.7
L[s:s+n] += boom; R[s:s+n] += boom

# Simple stereo delay for space
d = int(BEAT * 0.75 * SR)
L2 = L.copy(); R2 = R.copy()
L2[d:] += R[:-d] * 0.18; R2[d:] += L[:-d] * 0.18
mix = np.stack([L2, R2], 1)
mix *= env_ar(N, 0.5, 1.5)[:, None]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write(out, SR, (mix * 32767).astype(np.int16))
print(f"wrote {out} {DUR:.1f}s")
