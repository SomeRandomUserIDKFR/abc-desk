export const DRAFT_PREFIX = "abc-desk-draft-v1:";
export const DRAFT_TAB_KEY = "abc-desk-active-draft";

export function createDraftStore({
  storage,
  now = Date.now,
  makeId = () => globalThis.crypto.randomUUID(),
  limit = 12,
  checkpointMs = 30000,
}) {
  let currentId = null;
  const getStorage = () => typeof storage === "function" ? storage() : storage;
  function list() {
    const target = getStorage();
    const entries = [];
    for (let index = 0; index < target.length; index++) {
      const key = target.key(index);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const raw = target.getItem(key);
      if (raw == null) continue;
      let entry;
      try {
        entry = JSON.parse(raw);
      } catch (error) {
        throw new Error(`Saved draft ${key.slice(DRAFT_PREFIX.length)} is unreadable.`, { cause: error });
      }
      if (!entry || entry.version !== 1 || typeof entry.id !== "string" ||
          key !== DRAFT_PREFIX + entry.id || typeof entry.source !== "string" ||
          !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt)) {
        throw new Error(`Saved draft ${key.slice(DRAFT_PREFIX.length)} has an invalid format.`);
      }
      entries.push(entry);
    }
    return entries.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt ||
      b.id.localeCompare(a.id));
  }
  return {
    list,
    fork() { currentId = null; },
    save(source, { checkpoint = false } = {}) {
      if (typeof source !== "string") throw new Error("A draft must contain text.");
      const entries = list();
      const previous = entries.find((entry) => entry.id === currentId);
      if (previous?.source === source) return previous;
      const time = now();
      const reuse = previous && !checkpoint && time - previous.createdAt < checkpointMs;
      const id = reuse ? previous.id : makeId();
      const entry = { version: 1, id, source,
        createdAt: reuse ? previous.createdAt : time, updatedAt: time };
      const target = getStorage();
      target.setItem(DRAFT_PREFIX + id, JSON.stringify(entry));
      currentId = id;
      const retained = [entry, ...entries.filter((item) => item.id !== id)];
      for (const old of retained.slice(limit)) target.removeItem(DRAFT_PREFIX + old.id);
      return entry;
    },
  };
}

export function createDraftAutosave({
  store, readSource, onState, onSaved = () => {}, initialSource = null,
  delay = 600, schedule = setTimeout, cancel = clearTimeout,
}) {
  let timer = null;
  let dirty = false;
  let savedSource = initialSource;
  function stopTimer() {
    if (timer != null) cancel(timer);
    timer = null;
  }
  function flush(options) {
    stopTimer();
    try {
      if (!dirty) {
        if (savedSource === null ||
            store.list().some((entry) => entry.source === readSource())) return true;
        dirty = true;
      }
      const source = readSource();
      const entry = store.save(source, options);
      onSaved(entry);
      savedSource = source;
      dirty = false;
      onState({ state: "saved", entry });
      return true;
    } catch (error) {
      onState({ state: "error", error });
      return false;
    }
  }
  return {
    flush,
    changed() {
      stopTimer();
      dirty = readSource() !== savedSource;
      if (!dirty) {
        onState({ state: "unchanged" });
        return;
      }
      onState({ state: "pending" });
      timer = schedule(() => flush(), delay);
    },
    reset(source = null) {
      stopTimer();
      store.fork();
      savedSource = source;
      dirty = false;
    },
  };
}
