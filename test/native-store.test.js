"use strict";

/* The editor's store (public/native/app/store.js) under node: the browser
   files are plain scripts, so they run in a vm context with a fake window,
   a fake clock and timers, and a fake API. No DOM needed. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PUBLIC = path.join(__dirname, "..", "public", "native");

function harness() {
  let clock = 1700000000000;
  let timers = [];
  const handlers = {};
  const calls = [];
  // Each saveProject call waits for the test to answer it.
  const pending = [];
  class FakeDate extends Date {
    static now() {
      return clock;
    }
  }
  const ctx = {
    console,
    Date: FakeDate,
    JSON,
    Math,
    Promise,
    Uint8Array,
    crypto: globalThis.crypto,
    setTimeout: (fn, ms) => {
      const t = { fn, at: clock + (ms || 0), id: timers.length + 1 };
      timers.push(t);
      return t.id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  // The UI leave.js uses: dialogs are recorded, buttons are { label, onClick }.
  const dialogs = [];
  const toasts = [];
  ctx.NP = {
    ui: {
      h: (tag, attrs, ...kids) => ({ tag, kids }),
      button: (label, o) => ({ label, onClick: o.onClick }),
      modal: (o) => {
        const d = { opts: o, closed: false, close: () => { if (!d.closed) { d.closed = true; if (o.onClose) o.onClose(); } } };
        dialogs.push(d);
        return d;
      },
      toast: (text, kind) => toasts.push({ text, kind }),
    },
    api: {
      saveProject(id, project, rev) {
        calls.push({ kind: "save", id, project, rev });
        return new Promise((resolve, reject) => pending.push({ resolve, reject, rev }));
      },
      createProject(body) {
        calls.push({ kind: "create", body });
        return Promise.resolve({ project: Object.assign({}, body.copyOf, { id: "np_copy1234" }) });
      },
    },
  };
  vm.createContext(ctx);
  ["schema.js", "doc.js", "app/store.js", "app/leave.js"].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(PUBLIC, f), "utf8"), ctx, { filename: f });
  });
  const D = ctx.NativeDoc;
  const store = ctx.NP.store;
  const project = Object.assign(D.createProject({ name: "Test" }), { rev: 1, status: "draft", review: null, owner: "kari" });
  store.load(project);
  return {
    store,
    leave: ctx.NP.leave,
    dialogs,
    toasts,
    D,
    calls,
    pending,
    handlers,
    tick(ms) {
      clock += ms;
      const due = timers.filter((t) => t.at <= clock);
      timers = timers.filter((t) => t.at > clock);
      due.forEach((t) => t.fn());
    },
    timers: () => timers.length,
    answer(i, res) {
      pending[i].resolve(Object.assign({ status: "draft" }, res));
      return flush();
    },
    fail(i, status, message) {
      const err = new Error(message || "nei");
      err.status = status;
      pending[i].reject(err);
      return flush();
    },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

function heroId(t) {
  return t.store.page().sections[0].id;
}

function edit(t, text) {
  t.store.setField(heroId(t), "title", text);
}

test("save() resolves once the server has the project", async () => {
  const t = harness();
  edit(t, "Ny tittel");
  assert.equal(t.store.get().save, "dirty");
  const p = t.store.save();
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].rev, 1);
  await t.answer(0, { rev: 2 });
  await p;
  assert.equal(t.store.get().save, "saved");
  assert.equal(t.store.get().rev, 2);
  await t.store.save(); // nothing to do: no request
  assert.equal(t.calls.length, 1);
});

test("save() rejects on a network error, so actions on the server copy stop", async () => {
  const t = harness();
  edit(t, "Ny tittel");
  const p = assert.rejects(t.store.save(), /kunne ikke lagres/);
  await t.fail(0, 500, "Kunne ikke lagre");
  await p;
  assert.equal(t.store.get().save, "error");
  assert.ok(t.timers() > 0, "a retry is scheduled");
  // The retry runs on a timer that nobody awaits: it must not throw.
  t.tick(9000);
  assert.equal(t.calls.length, 2);
  await t.fail(1, 500);
  assert.equal(t.store.get().save, "error");
});

test("save() waits for edits made before it was called, even with a save in flight", async () => {
  const t = harness();
  edit(t, "Først");
  const first = t.store.save();
  edit(t, "Så");
  const second = t.store.save();
  let done = [];
  first.then(() => done.push("first"));
  second.then(() => done.push("second"));
  await t.answer(0, { rev: 2 });
  assert.deepEqual(plain(done), ["first"], "«Først» is saved; «Så» is not yet");
  assert.equal(t.calls.length, 2, "the caller who asked after «Så» gets it sent right away");
  assert.equal(t.calls[1].rev, 2);
  assert.equal(t.calls[1].project.pages[0].sections[0].props.title, "Så");
  await t.answer(1, { rev: 3 });
  await second;
  assert.equal(t.store.get().save, "saved");
});

test("typing during a save does not fire saves back to back: the timer takes the rest", async () => {
  const t = harness();
  edit(t, "En");
  t.tick(1300); // the autosave goes out
  assert.equal(t.calls.length, 1);
  edit(t, "En to");
  t.tick(1300); // its timer fires while the first save is still in flight
  assert.equal(t.calls.length, 1, "no second request while one is in flight");
  await t.answer(0, { rev: 2 });
  assert.equal(t.calls.length, 1, "not immediately after it either");
  assert.equal(t.store.get().save, "dirty");
  t.tick(1300);
  assert.equal(t.calls.length, 2, "the next save goes on the timer");
  await t.answer(1, { rev: 3 });
  assert.equal(t.store.get().save, "saved");
});

test("after a conflict nothing is saved, every save rejects, and leaving warns", async () => {
  const t = harness();
  edit(t, "Min tekst");
  const p = assert.rejects(t.store.save(), /endret av noen andre/);
  await t.fail(0, 409, "Endret av andre");
  await p;
  assert.equal(t.store.get().save, "conflict");

  // "Bli her" and keep typing: still nothing goes to the server.
  edit(t, "Mer tekst");
  t.tick(5000);
  assert.equal(t.calls.length, 1);
  await assert.rejects(t.store.save(), /endret av noen andre/);
  assert.equal(t.store.hasUnsaved(), true);

  let prevented = false;
  const e = { preventDefault: () => (prevented = true), returnValue: undefined };
  t.handlers.beforeunload(e);
  assert.equal(prevented, true, "the browser asks before the page is left");
  assert.equal(t.calls.length, 1, "leaving does not try to overwrite either");

  const copy = await t.store.saveAsCopy();
  assert.equal(copy.id, "np_copy1234");
  const sent = t.calls[1].body.copyOf;
  assert.equal(sent.pages[0].sections[0].props.title, "Mer tekst", "the copy is the editor's latest state");
});

test("a saved project does not warn on leaving", async () => {
  const t = harness();
  let prevented = false;
  t.handlers.beforeunload({ preventDefault: () => (prevented = true) });
  assert.equal(prevented, false);
  assert.equal(t.store.hasUnsaved(), false);
});

test("undo and redo keep the review round, status, revision and AI state", async () => {
  const t = harness();
  edit(t, "Endret");
  t.store.adopt({ review: { round: 2, token: "t".repeat(24) }, status: "review", rev: 7 });
  t.store.update((p) => Object.assign({}, p, { ai: { chat: [{ role: "user", text: "hei" }] } }), { history: false });
  t.store.undo();
  const p = t.store.get().project;
  assert.equal(p.pages[0].sections[0].props.title, "Tittel på saken", "the page went back");
  assert.equal(p.review.round, 2);
  assert.equal(p.status, "review");
  assert.equal(p.rev, 7);
  assert.equal(p.owner, "kari");
  assert.equal(p.ai.chat.length, 1);
  t.store.redo();
  const q = t.store.get().project;
  assert.equal(q.pages[0].sections[0].props.title, "Endret");
  assert.equal(q.review.round, 2);
  assert.equal(q.status, "review");
});

test("typing is grouped into undo steps of a few seconds, not minutes", () => {
  const t = harness();
  const id = heroId(t);
  let text = "";
  for (let i = 0; i < 40; i++) {
    text += "a";
    t.store.setField(id, "title", text);
    t.tick(400); // steady typing, never a 1 s pause
  }
  let steps = 0;
  while (t.store.canUndo()) {
    t.store.undo();
    steps++;
  }
  assert.ok(steps >= 3, "16 s of typing is several steps, got " + steps);
  assert.ok(steps <= 6, "but not one per key, got " + steps);
});

// ---- several sections at once ---------------------------------------------------------
// Arrays made inside the vm have another realm's prototype: compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));

function types(t) {
  return plain(t.store.page().sections.map((s) => s.type));
}

test("a picked group moves, duplicates and is deleted as one undo step each", () => {
  const t = harness();
  const ids = t.store.page().sections.map((s) => s.id); // hero, richText, factBox, cta
  t.store.pick([ids[2], ids[1]]);
  assert.deepEqual(plain(t.store.picked()), [ids[1], ids[2]], "in page order");

  t.store.moveSections(t.store.picked(), -1);
  assert.deepEqual(types(t), ["richText", "factBox", "hero", "cta"]);
  t.store.moveSections(t.store.picked(), -1); // already at the top: nothing moves
  assert.deepEqual(types(t), ["richText", "factBox", "hero", "cta"]);
  t.store.undo();
  assert.deepEqual(types(t), ["hero", "richText", "factBox", "cta"], "one step back");

  t.store.duplicateSections(t.store.picked());
  assert.deepEqual(types(t), ["hero", "richText", "factBox", "richText", "factBox", "cta"]);
  const copies = t.store.picked();
  assert.equal(copies.length, 2);
  assert.ok(copies.every((id) => !ids.includes(id)), "the copies are now the selection");

  t.store.removeSections(copies);
  assert.deepEqual(types(t), ["hero", "richText", "factBox", "cta"]);
  assert.deepEqual(plain(t.store.picked()), []);
  t.store.undo();
  assert.equal(t.store.page().sections.length, 6, "the delete is one step");
});

test("a plain select ends the group; picking one section is a plain select", () => {
  const t = harness();
  const ids = t.store.page().sections.map((s) => s.id);
  t.store.pick([ids[0], ids[3]]);
  assert.equal(t.store.picked().length, 2);
  t.store.select(ids[1]);
  assert.deepEqual(plain(t.store.picked()), [ids[1]]);
  t.store.pick([ids[2]]);
  assert.equal(t.store.get().selected, ids[2]);
  assert.deepEqual(plain(t.store.get().picked), []);
});

// ---- leaving the editor inside the app ---------------------------------------------------
const click = (dialog, label) => dialog.opts.actions.find((b) => b.label === label).onClick();

test("leaving with nothing unsaved goes straight on; unsaved edits are saved first", async () => {
  const t = harness();
  assert.equal(await t.leave.confirm(), true);
  edit(t, "Ny tittel");
  const p = t.leave.confirm();
  await t.answer(0, { rev: 2 });
  assert.equal(await p, true);
  assert.equal(t.dialogs.length, 0, "no question when the save worked");
});

test("leaving after a conflict asks; «Bli her» stays, the copy keeps the edits and then leaves", async () => {
  const t = harness();
  edit(t, "Min tekst");
  const s = assert.rejects(t.store.save());
  await t.fail(0, 409);
  await s;

  const stay = t.leave.confirm();
  await flush();
  assert.equal(t.dialogs.length, 1);
  assert.match(t.dialogs[0].opts.title, /ikke lagret/);
  click(t.dialogs[0], "Bli her");
  assert.equal(await stay, false);

  const copy = t.leave.confirm();
  await flush();
  click(t.dialogs[1], "Lagre min versjon som kopi");
  assert.equal(await copy, true);
  assert.equal(t.calls[t.calls.length - 1].kind, "create");
  assert.equal(t.calls[t.calls.length - 1].body.copyOf.pages[0].sections[0].props.title, "Min tekst");

  const drop = t.leave.confirm();
  await flush();
  click(t.dialogs[2], "Forlat uten å lagre");
  assert.equal(await drop, true);
});

test("leaving while offline asks instead of dropping the edits", async () => {
  const t = harness();
  edit(t, "Uten nett");
  const p = t.leave.confirm();
  await t.fail(0, 500, "Ingen forbindelse");
  await flush();
  assert.equal(t.dialogs.length, 1);
  t.dialogs[0].close(); // Esc / the close button = stay
  assert.equal(await p, false);
});
