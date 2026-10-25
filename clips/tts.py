"""One WAV per scene of clips/proposal_cut_script.md, using Kokoro (open weights, Apache 2.0).

Needs espeak-ng (apt install espeak-ng) and, if the bundled one fails, PHONEMIZER_ESPEAK_LIBRARY=/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1.
Usage: python clips/tts.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin [--voice am_michael] [--speed 1.0]
Writes clips/.tmp/vo/scene<N>.wav and prints each duration.
"""
import argparse
import pathlib
import re

import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = pathlib.Path(__file__).resolve().parent
p = argparse.ArgumentParser()
p.add_argument("--model", required=True)
p.add_argument("--voices", required=True)
p.add_argument("--voice", default="am_michael")
p.add_argument("--speed", type=float, default=1.0)
a = p.parse_args()

rows = re.findall(r"^\| (\d+) \| [^|]+ \| (.+?) \|$", (ROOT / "proposal_cut_script.md").read_text(), re.M)
out = ROOT / ".tmp" / "vo"
out.mkdir(parents=True, exist_ok=True)
kokoro = Kokoro(a.model, a.voices)
for n, text in rows:
    samples, rate = kokoro.create(text, voice=a.voice, speed=a.speed, lang="en-us")
    sf.write(out / f"scene{n}.wav", samples, rate)
    print(f"scene {n}: {len(samples) / rate:.2f} s")
