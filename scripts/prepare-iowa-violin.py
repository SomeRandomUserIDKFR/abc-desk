"""Rebuild the Iowa violin assets: Python with NumPy and soundfile; pass the source ZIP."""
from pathlib import Path
from zipfile import ZipFile
import argparse
import hashlib
import json
import math
import numpy as np
import soundfile as sf
from io import BytesIO

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
output = root / "public" / "iowa-violin"
output.mkdir(exist_ok=True)
source_url = "https://theremin.music.uiowa.edu/sound%20files/MIS/Strings/violin2012/Violin.arco.stereo.1644.1.zip"
with args.archive.open("rb") as source:
    digest = hashlib.file_digest(source, "sha256").hexdigest()
if digest != "401901da27d00643284256b58d59c92644145872013aab624121e5dac1f3450a":
    raise ValueError("The source archive differs from the auditioned Iowa revision.")


def pitch_hz(samples, offset, pitch):
    mono = samples[round(offset * 44100):round(offset * 44100) + 4496].mean(axis=1)
    if len(mono) != 4496:
        raise ValueError("Source note is too short for pitch verification.")
    spectrum = np.fft.rfft(mono)
    spectrum[np.fft.rfftfreq(len(mono), 1 / 44100) < 80] = 0
    cleaned = np.fft.irfft(spectrum, n=len(mono))
    down = cleaned if pitch >= 84 else cleaned.reshape(-1, 4).mean(axis=1)
    window, limit, rate = (4096, 399, 44100) if pitch >= 84 else (1024, 100, 11025)
    differences = np.array([np.sum((down[:window] - down[k:k + window]) ** 2) for k in range(1, limit)])
    normalized = differences * np.arange(1, limit) / np.cumsum(differences)
    for i in range(2, limit - 4):
        if normalized[i] < .2 and normalized[i] <= normalized[i - 1] and normalized[i] < normalized[i + 1]:
            a, b, c = normalized[i - 1:i + 2]
            return rate / (i + 1 + .5 * (a - c) / (a - 2 * b + c))
    return None


samples = {}
provenance = []
with ZipFile(args.archive) as archive:
    for layer in ("pp", "mf", "ff"):
        # Some published filenames have incorrect end pitches, including pp A4-B4.
        sources = [
            ("G", "G3B3", 55, (55, 58), 10),
            ("D", "D4B4", 62, (62, 64, 66, 67), 25),
            ("A", "A4B4", 69, (69, 71, 73, 74) if layer == "pp" else (69, 71), 18),
            ("E", "E5B5", 76, (76, 79, 82), 18),
            ("A", "C5B5" if layer == "pp" else "C6Bb6" if layer == "mf" else "C6Ab6",
             84, (86, 89, 92), 18),
            # The ff E7 take fails pitch verification; transpose C7 for that extreme.
            ("E", "C7E7", 96, (96,) if layer == "ff" else (96, 100), 18),
        ]
        if layer != "pp":
            sources.append(("A", "C5B5", 72, (73, 74), 18))
        for string, span, first, pitches, gap in sources:
            name = f"Violin.arco.{layer}.sul{string}.{span}.stereo.aif"
            audio, rate = sf.read(BytesIO(archive.read(name)), dtype="float64", always_2d=True)
            if rate != 44100 or audio.shape[1] != 2:
                raise ValueError(f"Unsupported source format: {name}")
            n = len(audio) // 441
            energy = np.sqrt(np.mean(audio[:n * 441].reshape(n, 441, 2) ** 2, axis=(1, 2)))
            active = np.flatnonzero(energy >= np.percentile(energy, 75) * .035)
            groups = np.split(active, np.flatnonzero(np.diff(active) > gap) + 1)
            spans = [(max(0, int(g[0]) * 441 - 882), min(len(audio), (int(g[-1]) + 1) * 441 + 882))
                     for g in groups if len(g) and g[-1] - g[0] >= 150]
            for pitch in pitches:
                if pitch - first >= len(spans):
                    raise ValueError(f"Missing source region: {name}, MIDI {pitch}; {len(spans)} regions")
                start, end = spans[pitch - first]
                note = audio[start:end]
                windows = [pitch_hz(note, t, pitch) for t in (.1, .2, .3, .4, .7, 1.0, 1.3, 1.6)]
                voiced = [value for value in windows if value is not None]
                if len(voiced) < 2:
                    raise ValueError(f"Too few voiced pitch checks: {name}, MIDI {pitch}: {windows}")
                measured = float(np.median(voiced))
                cents = 1200 * math.log2(measured / (440 * 2 ** ((pitch - 69) / 12)))
                if abs(cents) > 60:
                    raise ValueError(f"Wrong source pitch: {name}, MIDI {pitch}: {cents:.1f} cents")
                note = note[:round(2.4 * rate)]
                if len(note) < rate * 1.8:
                    raise ValueError(f"Source note too short: {name}, MIDI {pitch}")
                filename = f"{layer}-{pitch}.flac"
                sf.write(output / filename, note, rate, format="FLAC", subtype="PCM_16")
                duration = len(note) / rate
                loop_end = min(duration - .06, 2.15)
                descriptor = {
                    "root": pitch, "layer": layer, "name": filename,
                    "loopStart": min(1.25, loop_end - .35),
                    "loopEnd": loop_end, "crossfade": .025,
                }
                samples[f"{layer}-{pitch}"] = descriptor
                provenance.append({
                    **descriptor, "source": name, "startSeconds": start / rate,
                    "endSeconds": end / rate, "packagedSeconds": duration,
                    "measuredHz": round(measured, 3), "cents": round(cents, 2),
                    "voicedWindows": len(voiced),
                    "sha256": hashlib.sha256((output / filename).read_bytes()).hexdigest(),
                })
                print(f"{filename}: {duration:.2f}s, source tuning {cents:+.1f} cents")

if len(samples) != 53:
    raise ValueError(f"Expected 53 packaged samples, got {len(samples)}")
module = "export const IOWA_VIOLIN_SAMPLES = " + json.dumps(samples, indent=2) + ";\n"
(root / "src" / "iowaViolinSamples.js").write_text(module, encoding="utf-8")
(output / "provenance.json").write_text(json.dumps({
    "creator": "Lawrence Fritts / University of Iowa Electronic Music Studios",
    "source": source_url, "archiveSha256": digest,
    "terms": "https://theremin.music.uiowa.edu/MIS.html",
    "processing": "Silence trimmed with 20 ms margins; first 2.4 seconds encoded losslessly as 16-bit FLAC. No normalization, EQ, noise reduction or tuning correction. Loop coordinates are playback crossfade regions, not recorded legato.",
    "samples": provenance,
}, indent=2), encoding="utf-8")
