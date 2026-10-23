"""Kokoro TTS: python say.py <voice> <out.wav> "<text>" -> writes a 24 kHz mono wav, prints its duration."""
import sys, soundfile as sf, numpy as np
from kokoro import KPipeline
voice, out, text = sys.argv[1], sys.argv[2], sys.argv[3]
audio = np.concatenate([a for _, _, a in KPipeline(lang_code="a")(text, voice=voice)])
sf.write(out, audio, 24000)
print(out, round(len(audio) / 24000, 3), "s")
