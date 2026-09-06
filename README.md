# ABC Desk

Vite-hosted ABC notation interpreter with a loose **Desk dialect** on top of [abcjs](https://www.abcjs.net/).

## Run

```bash
npm install
npm run dev
```

Export a single self-contained HTML file that can be moved anywhere and opened directly from disk:

```bash
npm run export-html
```

The generated file is `abc-desk.standalone.html`. It bundles the app CSS and JS inline, so it does not require a sibling `assets/` folder or a local web server.

## Player backends

The experimental player is now the default route. Use `#oldframework` to load the
legacy abcjs controller as a fallback, or `#testingframework` to explicitly enter
the experimental major-expansion route:

```text
http://localhost:5173/
http://localhost:5173/#oldframework
http://localhost:5173/#testingframework
http://localhost:5173/#violin
```

This route uses the real abcjs soundfont renderer with a small experimental test clock,
so instrument, tone, and Human settings remain audible while event counts and duration
are exposed. The legacy player remains available under `#oldframework`. WAV export
uses the same experimental Human/performance processing; the live Web Audio Room effect
is playback-only.

`#violin` uses the experimental player with the native violin instrument preset.
With Humanization enabled, the experimental path adds violin-specific bow-cycle
variation, register-aware response, contextual intonation drift, and softer slur
re-attacks while retaining the underlying abcjs violin soundfont.

`#musescore` is an opt-in comparison route that loads MuseScore General SF3
through a FluidSynth WebAssembly backend. It requires downloading the soundfont
on first use and is separate from the normal experimental player.

## Live site

https://somerandomuseridkfr.github.io/abc-desk/

Deploy: push to `master` (GitHub Actions → Pages), or `npm run build` locally.

## Desk headers

Friendly and encoded forms are equivalent (last wins):

```
Inst: flute
Tone: warm
Human: 0.45
Room: concert
Players: 4
Distance: 0.65
```

```
%%desk-instrument flute
%%desk-tone warm
%%desk-human 0.45
```

```
I:desk-instrument flute
I:desk-tone warm
I:desk-imperfect 0.45
```

**Instrument** can also be the standard abcmidi form (same meaning as `Inst:`):

```
%%MIDI program 73
%%MIDI program 99
```

Put `%%MIDI program` **before** `K:` (in the header). After `K:` / mid-body it can stick to voice 1 only, so `&` overlay voices fall back to piano. ABC Desk hoists it into the header automatically.

`Inst: flute` compiles to `%%MIDI program 73`. If both are present, `%%MIDI program` wins.

- **Inst: / %%MIDI program** — GM instrument for playback (`flute`, `violin`, `atmosphere`, or `0`–`127`)
- **Tone:** playback character — `neutral`, `warm`, `bright`, `soft`, `rustic`, `upbeat`, `sorrow`, `emotional`, `aggressive`, `swing`
- **Room:** experimental Web Audio acoustics — `dry`, `studio`, `chamber`, `concert`, `cathedral` (active in `#testingframework`). Concert models hall-like pre-delay, asymmetric early reflections, stereo width, and a frequency-damped late field; WAV export uses the same room model.
- **Players:** experimental ensemble size, `1`–`32`; creates layered performers with independent phrase timing, gain, pitch drift, and stereo placement
- **Distance:** experimental player spacing, `0`–`1`; increases stereo spread and room send
- **Human: / Imperfect:** optional stacking humanization amount from `0` to `1` (`Human: 0.35`, `Imperfect: 0.7`, `%%desk-human 0.45`). The value is internally doubled and capped at full strength, so `0.5` is approximately the former maximum. It adds repeatable rubato, sound/volume variation, violin and bowed-string pressure/release imperfections, and slight cents drift for tunable instruments such as strings, woodwinds, brass, and bass. The intensity gently breathes over phrases instead of staying perfectly flat, and crescendo/diminuendo ramps receive small non-linear dynamic deviations. `0.1`–`0.2` is subtle; `0.2`–`0.35` is more expressive.
- **Drum1: / Drum2:** drum sounds for `o` / `p` note-attached hits (also `!o!` / `!p!`; `acoustic-snare`, `bass-drum-1`, `closed-hi-hat`, or `35`–`81`)

The **Ensemble stress test** sample is available in the editor sample menu. It
uses an eight-player concert violin section, two-part counterpoint, long slurs,
detached attacks, rests, an accent, and a sustained ending. Use it on
`#testingframework`, then compare `Players: 1`, `2`, `4`, and `8` plus WAV
export.

### Note / expression marks

| Write | Meaning |
| --- | --- |
| `!gimplus!` | climactic hit — `gim+` + sfz |
| `!grit!` `!whisper!` `!snap!` `!smear!` `!choke!` | attack / color marks |
| `!ascent!` | rising approach — label + slide |
| `!cluster!c` / `!cluster5!e` | chord cluster around the note |

ABC slurs such as `(ABc` use dedicated experimental violin articulation: notes
inside the slur receive a tiny bow-continuity overlap and softened re-attacks,
while detached notes retain their normal bow changes and attacks.
| `!xhead!` `!harmonic!` `!triangle!` `!rhythmhead!` | notehead styles |
| `!crescendo(!` … `!crescendo)!` | hairpin up (Desk reshapes the ramp) |
| `!diminuendo(!` … / `!descendo(!` | hairpin down (alias ok) |
| `o` `O` / `!o!` `!O!` | drum hit 1 on the preceding note |
| `p` `P` / `!p!` `!P!` | drum hit 2 on the preceding note |

### Multi-part scores

```
Part: flute
Inst: flute
Trans: 0
X:1
M:4/4
L:1/8
K:C
cdef|

Part: clarinet
Inst: clarinet
Trans: -2
...
```

Desk assembles voices into one conductor score. Lint flags meter mismatches.

### Share

**Share** copies a URL with the tune in the hash (`#d=...`). Open the link to reload that source.
