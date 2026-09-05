/**
 * ABC Desk's stable performance event boundary.
 *
 * abcjs remains responsible for producing the sequence, but the experimental
 * player consumes this smaller, owned event shape instead of abcjs objects.
 */

export function normalizePerformanceTracks(tracks) {
  return tracks.map((track, trackIndex) =>
    track
      .filter((event) => event?.cmd === "note")
      .map((event, eventIndex) => ({
        id: `track-${trackIndex}-event-${eventIndex}`,
        trackIndex,
        cmd: "note",
        pitch: finiteNumber(event.pitch),
        volume: finiteNumber(event.volume),
        cents: finiteNumber(event.cents) ?? 0,
        start: finiteNumber(event.start) ?? 0,
        duration: Math.max(
          0,
          finiteNumber(event.duration) ??
            ((finiteNumber(event.end) ?? finiteNumber(event.start) ?? 0) -
              (finiteNumber(event.start) ?? 0)),
        ),
        end: finiteNumber(event.end),
        startChar: finiteNumber(event.startChar),
        endChar: finiteNumber(event.endChar),
        gap: finiteNumber(event.gap),
        endType: event.endType,
        articulation: normalizeArticulation(event.articulation ?? event.endType),
        envelope: {
          attack: event.endType === "tenuto" ? 0.02 : 0.008,
          release: event.endType === "tenuto" ? 0.08 : 0.035,
        },
        player: {
          trackIndex,
          replica: Boolean(event.ensembleReplica),
        },
        ensembleReplica: Boolean(event.ensembleReplica),
      })),
  );
}

export function buildPerformanceGraph(tracks, context = {}) {
  const notes = tracks.flat();
  const articulations = notes.reduce((counts, note) => {
    const key = note.articulation ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const phrases = [];
  const expression = [];
  for (const track of tracks) {
    let phrase = [];
    for (const note of track) {
      if (phrase.length && note.start - phrase[phrase.length - 1].end > 0.08) {
        phrases.push(createPhrase(phrase));
        phrase = [];
      }
      phrase.push(note);
    }
    if (phrase.length) phrases.push(createPhrase(phrase));
  }
  for (const phrase of phrases) {
    expression.push({
      type: "expression",
      target: "volume",
      start: phrase.start,
      end: phrase.end,
      curve: "phrase-arch",
      intensity: phrase.intensity,
    });
  }
  const room = context.room
    ? [{ type: "room", start: 0, room: context.room.name }]
    : [];
  const tone = (context.inlineToneChanges ?? []).map((change) => ({
    type: "tone",
    startChar: change.at,
    tone: change.tone.name,
  }));
  const tempo = context.experimentalPerformance
    ? phrases.map((phrase) => ({
        type: "tempo",
        start: phrase.start,
        end: phrase.end,
        curve: "phrase-breath",
        amount: 0.06,
      }))
    : [];
  return {
    events: [
      ...notes,
      ...expression,
      ...tone,
      ...room,
      ...tempo,
    ],
    phrases,
    expression,
    tone,
    room,
    tempo,
    articulations,
    player: {
      count: Math.max(1, Number(context.players) || 1),
      metadata: tracks.map((_, trackIndex) => ({
        trackIndex,
        section: trackIndex < 2 ? "upper-strings" : "ensemble",
      })),
    },
  };
}

function normalizeArticulation(value) {
  const name = String(value ?? "").toLowerCase();
  if (name.includes("staccato")) return "staccato";
  if (name.includes("tremolo")) return "tremolo";
  if (name.includes("marcato")) return "marcato";
  if (name === "tenuto" || name === "legato") return "legato";
  return name || "detache";
}

function createPhrase(notes) {
  return {
    type: "phrase",
    start: notes[0].start,
    end: Math.max(...notes.map((note) => note.end ?? note.start)),
    intensity: Math.min(
      1,
      Math.max(...notes.map((note) => Number(note.volume) || 0), 1) / 127,
    ),
    noteIds: notes.map((note) => note.id),
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
