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
        ensembleReplica: Boolean(event.ensembleReplica),
      })),
  );
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
