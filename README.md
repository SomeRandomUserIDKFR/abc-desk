# ABC Desk

Vite-hosted ABC notation interpreter with a loose **Desk dialect** on top of [abcjs](https://www.abcjs.net/).

## Run

```bash
npm install
npm run dev
```

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

- **Inst:** maps to a GM MIDI program for playback (`flute`, `violin`, `fiddle`, `piano`, … or a number `0`–`127`)
- **Tone:** playback character — `neutral`, `warm`, `bright`, `soft`, `swing`

Use **Copy strict** to strip Desk tags and keep an injected `%%MIDI program` line for plain ABC tools.
