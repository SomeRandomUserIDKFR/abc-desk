import assert from "node:assert/strict";
import test from "node:test";
import { createDraftStore, createDraftAutosave, DRAFT_PREFIX } from "../src/deskDrafts.js";

class Storage {
  data = new Map();
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

function fixture(options = {}) {
  const storage = new Storage();
  let time = 1000, nextId = 0;
  const store = createDraftStore({
    storage, now: () => time, makeId: () => `version-${++nextId}`, ...options,
  });
  return { storage, store, advance: (milliseconds) => { time += milliseconds; } };
}

test("draft text round trips exactly, including empty text and Unicode", () => {
  const { store, storage } = fixture();
  for (const source of ["X:1\r\nT:Café\nK:D\nD F A|\n", ""]) {
    store.save(source);
    const reopened = createDraftStore({ storage });
    assert.equal(reopened.list()[0].source, source);
  }
});

test("edits coalesce for 30 seconds, with older checkpoints and forced versions preserved", () => {
  const { store, advance } = fixture();
  const a = store.save("a");
  advance(1000);
  const b = store.save("b");
  assert.equal(a.id, b.id);
  advance(30000);
  const c = store.save("c");
  assert.notEqual(c.id, b.id);
  assert.deepEqual(store.list().map((entry) => entry.source), ["c", "b"]);
  const d = store.save("d", { checkpoint: true });
  assert.notEqual(c.id, d.id);
  assert.ok(store.list().some((entry) => entry.source === "c"));
});

test("sample/clear/restore boundaries fork records instead of overwriting saved work", () => {
  const { store } = fixture();
  const original = store.save("my composition");
  store.fork();
  store.save("");
  store.fork();
  store.save("my composition");
  assert.equal(store.list().find((entry) => entry.id === original.id).source, "my composition");
  assert.equal(store.list().length, 3);
});

test("independent tabs and page reloads never claim each other's active record", () => {
  const { storage, store } = fixture();
  const a = store.save("tab A");
  let time = 2000;
  const other = createDraftStore({ storage, now: () => time, makeId: () => "tab-b" });
  const b = other.save("tab B");
  store.save("tab A edited");
  assert.equal(other.list().find((entry) => entry.id === b.id).source, "tab B");
  time++;
  other.save("tab B edited");
  assert.equal(store.list().find((entry) => entry.id === a.id).source, "tab A edited");
  const reloaded = createDraftStore({ storage, makeId: () => "new-page" });
  reloaded.save("tab A after reload");
  assert.ok(store.list().some((entry) => entry.source === "tab A edited"));
});

test("history is bounded without deleting unrelated settings or the just-saved version", () => {
  const { store, storage, advance } = fixture();
  storage.setItem("abc-desk-cursor-style", "serif");
  for (let i = 0; i < 20; i++) {
    store.save(String(i), { checkpoint: true });
    advance(1);
  }
  assert.equal(store.list().length, 12);
  assert.equal(store.list()[0].source, "19");
  assert.equal(storage.getItem("abc-desk-cursor-style"), "serif");
});

test("invalid saved data and write failures surface without removing prior recovery copies", () => {
  const { store, storage } = fixture();
  const original = store.save("important");
  storage.setItem(DRAFT_PREFIX + "bad", "{invalid");
  assert.throws(() => store.save("new"), /unreadable/);
  assert.ok(storage.getItem(DRAFT_PREFIX + original.id).includes("important"));
  storage.removeItem(DRAFT_PREFIX + "bad");
  storage.setItem(DRAFT_PREFIX + "wrong", JSON.stringify({ version: 2, source: "wrong" }));
  assert.throws(() => store.list(), /invalid format/);
  storage.removeItem(DRAFT_PREFIX + "wrong");
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.throws(() => store.save("new"), /Quota exceeded/);
  assert.equal(store.list()[0].source, "important");
});

function autosaveFixture() {
  const { storage, store } = fixture();
  let text = "";
  const tasks = new Map(), states = [], saved = [];
  let nextTask = 0;
  const autosave = createDraftAutosave({
    store, readSource: () => text,
    onState: (state) => states.push(state),
    onSaved: (entry) => saved.push(entry),
    schedule: (fn, delay) => { assert.equal(delay, 600); tasks.set(++nextTask, fn); return nextTask; },
    cancel: (id) => tasks.delete(id),
  });
  return { storage, store, tasks, states, saved, autosave,
    edit(value) { text = value; autosave.changed(); },
    tick() { for (const fn of [...tasks.values()]) fn(); } };
}

test("autosave debounces edits and reads the latest source, then lifecycle flush is idempotent", () => {
  const f = autosaveFixture();
  f.edit("first");
  f.edit("latest");
  assert.equal(f.tasks.size, 1);
  assert.equal(f.store.list().length, 0);
  f.tick();
  assert.equal(f.store.list()[0].source, "latest");
  assert.equal(f.states.at(-1).state, "saved");
  assert.equal(f.tasks.size, 0);
  assert.equal(f.autosave.flush(), true);
  assert.equal(f.saved.length, 1);
});

test("page-hide/refresh flush saves pending text immediately, including intentional clearing", () => {
  const f = autosaveFixture();
  f.edit("before refresh");
  assert.equal(f.autosave.flush(), true);
  assert.equal(f.tasks.size, 0);
  f.autosave.reset();
  f.edit("");
  assert.equal(f.autosave.flush(), true);
  assert.ok(f.store.list().some((entry) => entry.source === ""));
  assert.ok(f.store.list().some((entry) => entry.source === "before refresh"));
});

test("failed autosave remains retryable and never emits a saved state", () => {
  const f = autosaveFixture();
  const write = f.storage.setItem.bind(f.storage);
  f.storage.setItem = () => { throw new Error("Storage disabled"); };
  f.edit("unsaved work");
  assert.equal(f.autosave.flush(), false);
  assert.equal(f.states.at(-1).state, "error");
  assert.equal(f.saved.length, 0);
  f.storage.setItem = write;
  assert.equal(f.autosave.flush(), true);
  assert.equal(f.store.list()[0].source, "unsaved work");
});

test("a pristine sample is not saved automatically and an edited sample gets its own version", () => {
  const f = autosaveFixture();
  f.edit("my draft");
  f.autosave.flush();
  f.autosave.reset();
  assert.equal(f.autosave.flush(), true);
  assert.equal(f.store.list().length, 1);
  f.edit("edited sample");
  f.autosave.flush();
  assert.equal(f.store.list().length, 2);
  assert.ok(f.store.list().some((entry) => entry.source === "my draft"));
});

test("clean open text is saved again if another tab's history pruning removed its recovery copy", () => {
  const f = autosaveFixture();
  f.edit("keep this tab");
  f.autosave.flush();
  f.storage.data.clear();
  assert.equal(f.autosave.flush(), true);
  assert.equal(f.store.list()[0].source, "keep this tab");
});
