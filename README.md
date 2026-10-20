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

## Autosave and draft recovery

Source edits are saved locally after 600 ms of inactivity, including formatting,
graphical edits, undo/redo and Studio preview changes. Pending changes are also
saved when the page becomes hidden or is left. On reload, the editor restores
this tab's saved draft, or the most recent local draft when opening a new tab.
Empty drafts are restored as empty rather than replaced by the default sample.

The Source panel shows save status and provides **Recover drafts**, **Retry save**
when needed, and **Download ABC** for an independent text-file copy. Recovery
keeps up to 12 recent versions across tabs. Continuous editing updates a
checkpoint for up to 30 seconds before starting another; opening a sample,
clearing, or restoring a version preserves the current draft first.
Restoring a version is undoable and does not delete the version being restored.

Unedited samples and newly opened shared links do not replace your saved work.
Edits to them become a new draft; refreshing an edited shared link in the same
tab restores those edits. Separate tabs save to distinct draft records rather
than overwriting one shared text value. Recovery lists refresh across tabs
without replacing the open editor's contents.

Drafts live in this browser's local storage, not in an account or the cloud.
Storage is specific to the site's origin/browser profile and can be lost when
site data is cleared. Storage/corrupt-data errors are shown explicitly; failed
saves leave the editor intact and offer retry/download rather than reporting
success. Keep downloaded backups for important work.

## Player backends

The experimental player is now the default route. Use `#oldframework` to load the
legacy abcjs controller as a fallback, or `#testingframework` to explicitly enter
the experimental major-expansion route:

```text
http://localhost:5173/
http://localhost:5173/#oldframework
http://localhost:5173/#testingframework
http://localhost:5173/#violin
http://localhost:5173/#studio
```

This route uses the real abcjs soundfont renderer with a small experimental test clock,
so instrument, tone, and Human settings remain audible while event counts and duration
are exposed. The legacy player remains available under `#oldframework`. WAV export
uses the same experimental Human/performance processing; the live Web Audio Room effect
and user equalizer settings are also rendered into WAV exports.

`#violin` loads the default tune with `Inst: violin` preselected. It is a convenience
preset and does not overwrite shared tunes.
`#violin` uses the experimental player with the native violin instrument preset.
With Humanization enabled, the experimental path adds violin-specific bow-cycle
variation, register-aware response, contextual intonation drift, and softer slur
re-attacks while retaining the underlying abcjs violin soundfont.

`#musescore` is an opt-in comparison route that loads the MuseScore-oriented
GeneralUser GS SF2 through a FluidSynth WebAssembly backend. It requires
downloading the soundfont on first use and is separate from the normal
experimental player. The browser FluidSynth build does not support SF3
compression, so this uses an SF2-compatible MuseScore-oriented bank.

`#studio` opens the instrumental score manager preview. It keeps the main ABC
score in a large shared source panel, lets players select `V:` / `Part:` blocks
or paste local ABC, and provides a drag-and-drop room for players, podiums,
the conductor placeholder, and microphones. Player parameters and scene
objects are stored internally in the browser; the first route slice previews
the selected player's ABC through the existing player while the independent
room routing is developed.

The sample picker includes **Tears in the Rain**, a violin-led expressive
arrangement with chamber room, light humanization, light vibrato, dynamics,
slides, and layered treble/bass voices.

## High-quality violin

**Customize -> Use high quality violin** is an opt-in, persisted setting, off
by default. It replaces violin/fiddle notes in the default and experimental
players with the University of Iowa solo violin auditioned as candidate #4.
Other instruments, the legacy player, and the MuseScore comparison backend
retain their existing sources; the checkbox is disabled on unsupported backends.

The bank has quiet, medium, and loud recordings, selected using pre-mix dynamics
(MIDI 1-62, 63-96, and 97-127). It preserves processed timing, volume, cents,
voice pan, Human settings, room, and equalizer processing. The same source is
used for live playback, passive replays, glissando preparation, and WAV export.
The extra default violin vibrato effect is disabled for this source so it does
not stack on the recordings.

Samples are served with the app and fetched only when needed, with a 32 MiB
decoded LRU cache and explicit loading/errors (no silent standard-violin fallback).
Notes use the nearest sampled pitch (G3-E7 for quiet/medium, G3-C7 for loud) and
transpose the endpoints outside those ranges. The loud E7 take failed source
pitch verification and is deliberately excluded rather than mislabeled.
Long notes use crossfaded sustain loops. This is not recorded legato,
continuous within-note dynamic crossfading, or a full bowing simulation. MIDI
exports contain notation/instrument data, not these audio samples.

The standalone HTML export embeds the violin bank, increasing its file size but
avoiding a dependency on sibling sample files. The recordings and existing
unrestricted-use terms are credited in `public/iowa-violin-credits.txt`.
`public/iowa-violin/provenance.json` records source/extraction/file hashes.
Developers can regenerate the bank with `python scripts/prepare-iowa-violin.py
<source-zip>` using NumPy and soundfile; the source URL is in the provenance.

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
- **Vibrato:** string vibrato style — `none`/`nonvibrato`, `light`, `normal`, or `wide`; for example `Vibrato: none` disables Desk's generated vibrato while keeping the same instrument. Some soundfont patches contain baked-in vibrato that cannot be removed without a separate dry sample.
- **Inline Tone:** change tone from a specific point in the music with `[Tone:sorrow]`. The header `Tone:` remains the initial tone; inline markers are removed before abcjs parsing and affect following notes in the experimental renderer.
- **Room:** experimental Web Audio acoustics — `dry`, `studio`, `chamber`, `concert`, `cathedral` (active in `#testingframework`). Concert models hall-like pre-delay, asymmetric early reflections, stereo width, and a frequency-damped late field; WAV export uses the same room model.
- **Players:** experimental ensemble size, `1`–`32`; creates layered performers with independent phrase timing, gain, pitch drift, and stereo placement
- **Distance:** experimental player spacing, `0`–`1`; increases stereo spread and room send
- **Equalizer:** experimental 9-band master EQ with Flat, Warm, Bright, Piano clarity, and Bass reduction presets; custom settings affect live playback and WAV export
- **Human: / Imperfect:** optional stacking humanization amount from `0` to `1` (`Human: 0.35`, `Imperfect: 0.7`, `%%desk-human 0.45`). The value is internally doubled and capped at full strength, so `0.5` is approximately the former maximum. It adds repeatable rubato, sound/volume variation, violin and bowed-string pressure/release imperfections, and slight cents drift for tunable instruments such as strings, woodwinds, brass, and bass. The intensity gently breathes over phrases instead of staying perfectly flat, and crescendo/diminuendo ramps receive small non-linear dynamic deviations. `0.1`–`0.2` is subtle; `0.2`–`0.35` is more expressive.
- **Drum1: / Drum2:** drum sounds for `o` / `p` note-attached hits (also `!o!` / `!p!`; `acoustic-snare`, `bass-drum-1`, `closed-hi-hat`, or `35`–`81`)

### Timeline passives (experimental player)

Place these markers in the music body, between measures or inline before a bar
line. They are removed before standard ABC parsing and exposed as timeline
metadata:

```text
Echo: 1/4
Flashback: 1-2
Foreshadow: 3-4
ReverseFlashback: 5-6
Resolution: 7-8
```

`Echo:` accepts a musical delay in whole-note units (for example `1/4` or
`0.25`) and creates shifted, tagged replay events. The other passives replay
their tagged notes with the experimental player and use distinct cursor and
highlight colors. These markers are intentionally ignored by the legacy player
and have no effect on ordinary ABC notation.

The **Ensemble stress test** sample is available in the editor sample menu. It
uses an eight-player concert violin section, two-part counterpoint, long slurs,
detached attacks, rests, an accent, and a sustained ending. Use it on
`#testingframework`, then compare `Players: 1`, `2`, `4`, and `8` plus WAV
export.

The **Expansion pack** sample is a guided showcase of the new performance
graph: rustic-to-warm-to-emotional tone changes, a sorrowful counterline,
slurs, hairpin dynamics, rests, concert acoustics, and four independent
players.

The **Articulation lab** sample compares `!staccato!`, `!tenuto!`,
`!marcato!`, and `!tremolo!` markers in the experimental player. Their
normalized counts appear in the player diagnostics.

String instruments include `violin`, `viola`, `cello`, `contrabass` (also
`double bass`), and `string`. `string` uses the exact native violin playback path as its shared bowed-string
base, preserving the original violin character for violin-range notes while
the shared string profile provides the common bowed response.
All four named instruments use the same intonation/humanization pipeline, while
their soundfont identities remain distinct. The **Four strings showcase**
sample demonstrates the shared base across a wide range.

Double bass uses abcjs's native `contrabass` soundfont (program 43), preserving
a bowed orchestral-bass character. It does not use the plucked `acoustic_bass`
bank (program 32).

The four bowed-string instruments share one ABC Desk base mix profile and the
same selected `Tone:` response. Their individual soundfonts remain distinct,
so violin, viola, cello, and double bass retain their natural register colors
without becoming differently normalized instruments.

Ensembles now receive perceptual loudness compensation: layered sections scale
approximately by the inverse square root of player count, preserving width and
variation without making `Players: 8` overwhelm the solo balance.

Ensemble replicas also share a small section-level timing and pitch tendency
while retaining individual deviations. Sources are seated in a narrower
section cluster and receive tiny tonal differences, which produces a more
cohesive orchestra-like section instead of many identical voices spread across
the whole stereo field.

The experimental route also shows a live **Performance map** beneath the
playback controls. Phrase spans, expression curves, and phrase-breath tempo
shaping are shown as separate layers, with the playhead following the audible
performance. Experimental phrasing now applies a small, deterministic
ritardando toward phrase endings in addition to the existing dynamic arcs.
The map also includes a logarithmic **Polyphony** control. Its center (`1x`) is
the normal voice budget, the left edge (`0.01x`) keeps only the strongest
overlapping voices, and the right edge disables the budget entirely (`∞`).
Reduced settings use soft voice stealing based on note volume rather than
changing note timing.

The experimental player now converts abcjs audio output into an ABC Desk-owned
performance event model before scheduling and highlighting. This keeps abcjs
as the parser/soundfont provider while allowing timing, expression, players,
articulation, and audio routing to evolve independently.

That model now includes typed tone and room events, phrase objects, volume
expression curves, per-note articulation envelopes, and player metadata. These
are currently used for diagnostics and as extension points; the existing
soundfont playback remains unchanged.

Piano playback applies a modest register-aware mix: very low piano notes are
attenuated and their release is shortened slightly so repeated notes such as
`C,,` do not overpower the middle register.
Acoustic and bright piano chords use a single density adjustment instead of
stacking the general chord and short-note penalties. Single notes and octaves
retain their existing density gain; larger chords scale by `sqrt(2 / noteCount)`
across simultaneous piano notes in all voices. This preserves existing note
balance rather than guessing which pitch is the melody, and applies to both
live playback and WAV export through the shared performance callback.
Different velocities within a simultaneous piano chord are not interpreted as
a crescendo or diminuendo; their written balance is retained.
The default/experimental player also gives acoustic and bright piano notes
five strike-dependent tone levels. Gentle strikes receive up to 6 dB of
high-shelf attenuation above 2.4 kHz; the strongest strikes retain the original
sample brightness. Tone follows the note velocity before chord and register
mix compensation, so a full chord is not mistaken for a softer touch.
The levels are rendered independently before mixing, allowing a quiet note and
a strong note to keep different tones even when they overlap. This processing
is shared by live playback, passive replays, glissando runs, and WAV export.
It approximates touch with the existing samples, not recorded velocity layers,
and adds preparation time for piano playback. The legacy `#oldframework` and
separate `#musescore` backends are unchanged.

### Optional high-quality piano

In **Customize**, enable **High-quality piano (Salamander)** to use Alexander
Holm's recorded Yamaha C5 instead of the standard acoustic/bright piano samples.
It is off by default and the preference is saved in this browser. It applies
to the default/experimental player's playback, passive replays, glissando runs,
and WAV export, but not the separate legacy or MuseScore backends.
Other instruments retain their existing samples.

The renderer selects among all 16 recorded strike layers using velocity before
chord/register mix attenuation. Unlike the standard piano's five filtered tone
bands, these are different recordings; the high-quality piano does not receive
that extra strike-tone filter. Written dynamics, mix balance, Human/Imperfect,
timing, pan, key releases and explicit sustain pedal remain active.

Samples are fetched on demand from a pinned revision of the
[Salamander Grand Piano repository](https://github.com/sfzinstruments/SalamanderGrandPiano).
Expect roughly 1-3 MB per sample in the middle register, and potentially
hundreds of MB for large scores with many pitches/strike strengths.
There is no automatic full-bank download. Browser HTTP caching can reuse
downloads, while the decoded-audio cache is limited to 32 MiB. Internet access
is required for uncached samples. Preparation reports sample progress; failed
downloads/decoding stop with an error rather than silently substituting the
standard piano. Turn the setting off to return to the lightweight source.

Glissando samples are prepared before the main voices start. Cursor events and
glissando targets use the processed note timings and the main audio clock, so
sample-loading time does not put the main voices ahead of the cursor or runs.

This is a sample-based adaptation, not the full SFZ/ARIA instrument: recorded
release/pedal noises, sympathetic resonance and SFZ controller curves are not
implemented. Samples outside the recorded A0-C8 keyboard range use transposition
from the nearest available recording.
Samples are licensed **CC BY 3.0**; see
[Salamander credits](public/salamander-credits.txt).

### Piano release and sustain pedal

The default/experimental piano renderer uses short damping tails for staccato
notes, moderate tails for ordinary key releases, and gentler damping for tenuto
and long-held notes. These tails are independent of strike-tone levels and do
not change note attacks. Non-piano instruments keep their existing releases.
The modeled staccato damper is temporarily disabled for listening comparisons;
playback and WAV export currently use the ordinary linear release instead.
The model remains available in the renderer.

Piano staccato uses a tempo-independent 60% key-hold portion before mix and
humanization adjustments. Without pedal, its release uses a two-stage damper
approximation instead of a linear cutoff: a gently engaging, quick reduction followed
by a quiet residual ring-off from the same sample. High partials damp faster
than the remaining low-frequency body, only after the key releases; the
attack retains its normal strike tone and volume. The residual tail lasts
about 140 ms, mostly at low level, with a 32 ms final fade that flattens
smoothly into silence. Each note is
processed independently, so its release cannot damp another held note.
Higher Human settings deterministically vary the damper speed and ring-off
length. This models a release using sustained samples, not recorded key-up
samples or a complete physical piano model.

Place `!ped!` before a note or rest to press the sustain pedal and `!ped-up!`
before a note or rest to lift it. The score displays `Ped.` and `*` below the
staff. The pedal is shared across piano voices; its timing follows rests,
repeats, and Desk tempo gestures:

```abc
X:1
Inst: piano
Human: 0.25
M:4/4
L:1/4
Q:120
K:C
!ped!C E G c | !ped-up!z C .D !tenuto!E |
```

Keys released while the pedal is down continue their sampled decay until the
pedal lifts. Already-damped notes are not revived, and keys still held are not
cut off by pedal-up. Repeated strikes of the same pitch damp the previous
sample to avoid accumulating identical sustained voices. An unclosed pedal
automatically lifts at the end of the score. This is a sustain approximation,
not sympathetic-string resonance or half-pedaling.

`Human:` and `Imperfect:` add deterministic finger-release offsets (up to
18 ms), small damping-tail variations, and shared pedal timing offsets (up to
25 ms). They use the existing doubled, capped humanization scale, so `0`
disables the variation and `0.5` reaches full strength. Pedal timing variation
is constrained near adjacent markings to preserve their order. The same score
and settings produce the same deviations in playback and WAV export.
These release/pedal changes apply to the default/experimental renderer;
legacy playback and MIDI export do not interpret the pedal annotations.

Glissando replay runs allow a small amount of additional gain headroom for
accented notes without removing the output safety ceiling.

Glissando runs inherit the active audio settings, including tone, humanization,
room, distance, player count, voice placement, and soundfont volume, rather
than using a separate dry instrument-only path.

Violin-family slurs use the customized performance engine's legato metadata:
following-note attacks are softened and a quiet continuous bow-contact layer is
added across connected slur groups when humanization is enabled.

Tone profiles also apply modest body, presence, and air EQ in the shared
playback chain. This keeps tone changes audible across regular notes,
glissando runs, and violin slur layers without making them primarily volume
presets.

Generated glissando runs also receive an explicit `%%MIDI program` directive,
so they retain the selected instrument instead of falling back to piano in
abcjs's temporary synth.

### Note / expression marks

| Write | Meaning |
| --- | --- |
| `!gimplus!` | climactic hit — `gim+` + sfz |
| `!grit!` `!whisper!` `!snap!` `!smear!` `!choke!` | attack / color marks |
| `!ascent!` | rising approach — label + slide |
| `!glissando!` / `!glisendo!` | glissando between adjacent notes — label + slide |

In the experimental player, `!glissando!` (or the `!glisendo!` alias) adds an
audible, quick pitch sweep from the marked note to the following note. The
score draws a wavy connector and uses a `gliss.` marking, and the notes keep
their separate attacks; the sweep does not turn them into a slur. Its musical
span is locked to the gap between those notes, so soundfont release tails are
trimmed instead of shifting the following material.
| `!cluster!c` / `!cluster5!e` | chord cluster around the note |

ABC slurs such as `(ABc` use dedicated experimental violin articulation: notes
inside the slur receive a tiny bow-continuity overlap and softened re-attacks,
while detached notes retain their normal bow changes and attacks.

ABC Desk also accepts grace-note chords as either `{[A,C]}` or
`[{A,C}]`. The pitches in the grace chord are scheduled together before the
following note instead of as sequential grace notes. This is a Desk extension
for chord-in-grace syntax that abcjs does not parse natively.
| `!xhead!` `!harmonic!` `!triangle!` `!rhythmhead!` | notehead styles |
| `!crescendo(!` … `!crescendo)!` | hairpin up (Desk reshapes the ramp) |
| `!diminuendo(!` … / `!descendo(!` | hairpin down (alias ok) |
| `!accelerando(!` … `!accelerando)!` | tempo ramp up; single `!accelerando!` uses a short default ramp |
| `!ritardando(!` … `!ritardando)!` | tempo ramp down; `!rallentando!`, `!rit!`, and `!rall!` are aliases |
| `o` `O` / `!o!` `!O!` | drum hit 1 on the preceding note |
| `p` `P` / `!p!` `!P!` | drum hit 2 on the preceding note |

Tempo gestures are performance directives applied to the generated audio event
timeline. The opening marker also becomes a small `accel.` or `rit.` text
annotation in the score; the closing marker is timing-only. Paired markers
ramp between their matching points. A single marker ramps over the next two
whole-note units. Accelerando reaches approximately 35% faster and ritardando
approximately 30% slower by the end of its default/paired span.

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

The **Format for ABC Desk** button also expands condensed ABC overlays such as
`A2 A2& B4& C8|` into separate `Part:` voices. Shorter overlay lines receive
rests so all generated parts remain aligned, and the source instrument is
shared by the generated voices.

The **Format to standard** button performs the reverse conversion: it groups
`Part:` blocks by clef, emits standard `V:` declarations, and merges parts
with the same clef using ABC overlay syntax (`&`). Clefs are read from a
`Clef:` field when present; otherwise bass-family part names use `bass` and
other names use `treble`.

When a score uses `Part:` blocks, the **Parts** editor provides editable names
and instrument selectors. Apply changes to rewrite only each part's metadata;
the music body remains unchanged.

The same editor includes per-part **Mute**, **Solo**, and volume sliders for
quickly isolating or balancing generated voices during playback. When source
ABC uses `%%MIDI program`, formatting preserves that directive and does not
add a conflicting `Inst:` line.

### Source formatting tools

The source toolbar includes two small reflow helpers:

- **Format measures** wraps contiguous music at a selected number of
  measures per line while preserving ABC fields, voice declarations,
  comments, and blank lines.
- **Remove extra spaces** reduces each run of three or more literal spaces to
  two spaces. Single and double spaces are preserved, as are tabs and line
  breaks.
- **Add padding** applies the same overlay alignment used at runtime, adding
  rests only when one `&` segment is shorter than another.

### Motif callbacks

ABC Desk can define a reusable one-line motif and call it with transformations:

```text
Motif: rain-theme = E2.E.D E2.C.D .E.B.G.F2.E.D.C
Call: rain-theme
Call: rain-theme transpose=-2 octave=1 dynamics=mf
```

Motif calls are expanded before abcjs parses the tune, so playback, MIDI/WAV
exports, and the normal score use ordinary generated ABC. The Score toolbar's
**View** selector can switch to **Motif callbacks**, which adds a non-standard
annotation strip to the rendered score and image/PDF exports without changing
the played music.

Supported call parameters:

- `transpose=N` shifts every note by `N` semitones (`-24` to `24`).
- `octave=N` shifts every note by `N` octaves (`-4` to `4`).
- `repeat=N` repeats the expanded motif (`1` to `16` times).
- `dynamics=ppp|pp|p|mp|mf|f|ff|fff|sfz` inserts that dynamic at the call.
- `fragment=first:N` or `fragment=last:N` keeps only that many whitespace
  tokens from the motif body.

Parameters are explicit `key=value` tokens, and invalid or unknown parameters
appear as render warnings rather than being silently ignored.

### Share

**Share** copies a URL with the tune in the hash (`#d=...`). Open the link to reload that source.

### Graphical editor preview

Open `#graphicaleditor` for a score-first editing layout. In this first
iteration, plain single-voice ABC can be edited without changing to the
source panel:

- Double-click or right-click empty score space to append a new `C` note.
- Right-click a rendered note to add a third, fifth, or octave above it.
- Right-click a rendered note and choose **Move to aligned voice (&)** to
  replace it with an aligned overlay and generate the required padding rests.

Graphical edits are source-backed and rerender the score. Desk tags, motif
calls, multipart scores, chords, and other transformed sources remain
source-only until their source-to-render mapping can be edited safely.

The rendered-score toolbar also includes a **Technique** palette. Select a
note in the source editor or click a rendered note, choose an articulation or
ornament, and press **Apply**. The palette inserts standard ABC decorations for
trills, mordents, turns, fermatas, staccato, accents, tenuto, and marcato.
