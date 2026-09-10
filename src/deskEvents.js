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
        instrument: event.instrument,
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
        legatoBlend: finiteNumber(event.legatoBlend),
        bowEngagement: finiteNumber(event.bowEngagement),
        bowContact: finiteNumber(event.bowContact),
        bowFriction: finiteNumber(event.bowFriction),
        bowEnvelope: event.bowEnvelope
          ? {
              attack: finiteNumber(event.bowEnvelope.attack),
              sustain: finiteNumber(event.bowEnvelope.sustain),
              release: finiteNumber(event.bowEnvelope.release),
            }
          : null,
        vibratoRate: finiteNumber(event.vibratoRate),
        vibratoDepth: finiteNumber(event.vibratoDepth),
        vibratoCurve: Array.isArray(event.vibratoCurve)
          ? event.vibratoCurve.map((point) => ({
              time: finiteNumber(point.time) ?? 0,
              depth: finiteNumber(point.depth) ?? 0,
            }))
          : null,
        expressionCurve: finiteNumber(event.expressionCurve),
        portamento: event.portamento
          ? {
              interval: finiteNumber(event.portamento.interval),
              weight: finiteNumber(event.portamento.weight),
              direction: finiteNumber(event.portamento.direction),
            }
          : null,
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
  const timelinePassives = buildTimelinePassiveRanges(
    notes,
    context.timelinePassives ?? context.passives,
  );
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
    timelinePassives,
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

/**
 * Create visual replay events for timeline passives. Echoes are shifted by
 * their musical delay; the other passives remain visual-only annotations.
 */
export function createTimelinePassiveEvents(events, passives = []) {
  const sourceEvents = events.filter(
    (event) => event?.cmd === "note" && !event.timelinePassive,
  );
  const replicas = [];
  for (const passive of passives) {
    const type = String(passive?.type ?? "").toLowerCase();
    if (!type || !sourceEvents.length) continue;
    const delay =
      type === "echo"
        ? Math.max(0, finiteNumber(passive.delay) ?? 0.25)
        : Math.max(0, finiteNumber(passive.delay) ?? 0);
    for (const [index, event] of sourceEvents.entries()) {
      const start = (finiteNumber(event.start) ?? 0) + delay;
      const duration = eventDuration(event);
      replicas.push({
        ...event,
        id: `${event.id}-passive-${type}-${index}`,
        start,
        end: start + duration,
        duration,
        timelinePassive: type,
        passiveReplica: true,
        visualOnly: type !== "echo",
        ensembleReplica: false,
      });
    }
  }
  return replicas;
}

function buildTimelinePassiveRanges(notes, passives = []) {
  const baseNotes = notes.filter((event) => event?.cmd === "note");
  if (!baseNotes.length) return [];
  const duration = Math.max(...baseNotes.map(eventEnd), 0);
  return passives
    .map((passive) => {
      const type = String(passive?.type ?? "").toLowerCase();
      if (!type) return null;
      const delay =
        type === "echo"
          ? Math.max(0, finiteNumber(passive.delay) ?? 0.25)
          : Math.max(0, finiteNumber(passive.delay) ?? 0);
      return {
        type,
        label: passive.label ?? type,
        value: passive.value ?? "",
        delay,
        start: delay,
        end: duration + delay,
        visualOnly: type !== "echo",
      };
    })
    .filter(Boolean);
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

function eventDuration(event) {
  return Math.max(
    0.04,
    finiteNumber(event?.duration) ??
      (finiteNumber(event?.end) ?? 0) - (finiteNumber(event?.start) ?? 0),
  );
}

function eventEnd(event) {
  return (finiteNumber(event?.start) ?? 0) + eventDuration(event);
}
