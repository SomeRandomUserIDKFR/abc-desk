# ABC Desk

Vite-hosted ABC notation interpreter with a loose **Desk dialect** on top of [abcjs](https://www.abcjs.net/).

## Run

```bash
npm install
npm run dev
```

## Live site

https://somerandomuseridkfr.github.io/abc-desk/

Deploy: push to `master` (GitHub Actions → Pages), or `npm run build` locally.

## Desk headers

Friendly and encoded forms are equivalent (last wins):

```
Inst: flute
Tone: warm
```

```
%%desk-instrument flute
%%desk-tone warm
```

```
I:desk-instrument flute
I:desk-tone warm
```

**Instrument** can also be the standard abcmidi form (same meaning as `Inst:`):

```
%%MIDI program 73
%%MIDI program 99
```

Put `%%MIDI program` **before** `K:` (in the header). After `K:` / mid-body it can stick to voice 1 only, so `&` overlay voices fall back to piano. ABC Desk hoists it into the header automatically.

`Inst: flute` compiles to `%%MIDI program 73`. If both are present, `%%MIDI program` wins.

- **Inst: / %%MIDI program** — GM instrument for playback (`flute`, `violin`, `atmosphere`, or `0`–`127`)
- **Tone:** playback character — `neutral`, `warm`, `bright`, `soft`, `swing`

### Note / expression marks

| Write | Meaning |
| --- | --- |
| `!gimplus!` | climactic hit — label `gim+` + sfz |
| `!ascent!` | rising approach — label + slide |
| `!cluster!c` / `!cluster5!e` | expand to a chord cluster around the note |
| `!xhead!` `!harmonic!` `!triangle!` `!rhythmhead!` | notehead styles |
| `!crescendo(!` … `!crescendo)!` | hairpin up (Desk reshapes the volume ramp) |
| `!diminuendo(!` … `!diminuendo)!` | hairpin down (same) |
| `!descendo(!` / `!decrescendo(!` | friendly aliases → diminuendo |
| `!cresc(!` / `!dim(!` | short aliases |

Use **Copy strict** to strip Desk-only tags and keep `%%MIDI program` for plain ABC tools.
