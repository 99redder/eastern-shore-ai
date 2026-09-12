"""Generate a short, distinctive three-note alert without external assets."""
import math
import struct
import sys
import wave

rate = 44100
samples = []
for frequency in (880, 1174.66, 1567.98):
    duration = 0.23
    for i in range(int(rate * duration)):
        t = i / rate
        envelope = min(t / 0.008, 1) * max(0, 1 - t / duration) ** 1.6
        tone = math.sin(2 * math.pi * frequency * t) + 0.2 * math.sin(4 * math.pi * frequency * t)
        samples.append(int(22000 * envelope * tone / 1.2))
    samples.extend([0] * int(rate * 0.06))
with wave.open(sys.argv[1], "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(struct.pack(f"<{len(samples)}h", *samples))
