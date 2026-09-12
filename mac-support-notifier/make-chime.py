"""Generate an original bunker-style warning alarm without external assets.

It is deliberately a little harsh: a clipped two-tone siren in repeating
bursts is easier to notice than a pleasant notification chime. No copyrighted
game or film recording is used.
"""
import math
import struct
import sys
import wave

rate = 44100
duration = 3.25
samples = []
burst_length = 0.58
gap_length = 0.12
cycle_length = burst_length + gap_length

for i in range(int(rate * duration)):
    t = i / rate
    cycle_position = t % cycle_length
    if cycle_position >= burst_length:
        samples.append(0)
        continue

    # Sweep up and back down in each burst: the familiar two-tone civil
    # defense / bunker warning shape, rendered with a deliberately clipped
    # square-wave edge and low undertone for small speakers.
    sweep_position = cycle_position / burst_length
    sweep = sweep_position * 2 if sweep_position < 0.5 else (1 - sweep_position) * 2
    frequency = 430 + 360 * sweep
    angular = 2 * math.pi * frequency * t
    raw = (
        0.62 * math.sin(angular)
        + 0.28 * math.sin(2 * angular)
        + 0.16 * math.sin(3 * angular)
        + 0.10 * math.copysign(1, math.sin(angular))
        + 0.16 * math.sin(2 * math.pi * 92 * t)
    )
    # Very short attack keeps each burst punchy; soft tail avoids a click at
    # the end of the burst while preserving the hard, alarming character.
    envelope = min(cycle_position / 0.006, 1) * min((burst_length - cycle_position) / 0.018, 1)
    clipped = math.tanh(raw * 1.8)
    samples.append(int(28500 * envelope * clipped))

with wave.open(sys.argv[1], "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(struct.pack(f"<{len(samples)}h", *samples))
