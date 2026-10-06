"use strict";

/* =========================================================================
 * polls.js — vote counts for the "Avstemning" block and the "Likte du
 * saken?" buttons on pages ABC design hosts itself (/n/<slug>/).
 *
 * One small JSON file per published slug: { "<sectionId>": { "<option>": n } }.
 * A vote is accepted only for a poll section (or the feedback buttons) that
 * really exists in the published version, and only for one of its options,
 * so the file can never grow with junk keys. Counting is anonymous: no IP,
 * no cookie is stored — the browser remembers its own vote in localStorage.
 * ========================================================================= */

const path = require("path");
const { readJson, writeJsonAtomic, createLocks, UserError, NotFoundError } = require("./fsutil");

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const FEEDBACK = ["ja", "nei"];

function createPollStore(dataDir) {
  const dir = path.join(dataDir, "polls");
  const withLock = createLocks();
  const file = (slug) => path.join(dir, slug + ".json");

  /** Options a section accepts, or null if it is not a poll on this page. */
  function optionsFor(project, sectionId) {
    if (sectionId === "feedback") return project.extras && project.extras.feedback ? FEEDBACK : null;
    for (const page of project.pages) {
      const s = page.sections.find((x) => x.id === sectionId);
      if (s && s.type === "poll") return s.props.options.map((o) => o.id);
    }
    return null;
  }

  async function counts(slug) {
    if (!SLUG_RE.test(slug)) throw new NotFoundError("Ukjent side");
    return readJson(file(slug), {});
  }

  async function vote(slug, project, sectionId, option) {
    if (!SLUG_RE.test(slug)) throw new NotFoundError("Ukjent side");
    const allowed = optionsFor(project, String(sectionId || ""));
    if (!allowed) throw new NotFoundError("Ukjent avstemning");
    if (allowed.indexOf(option) === -1) throw new UserError("Ukjent svar");
    return withLock(slug, async () => {
      const data = await readJson(file(slug), {});
      const sec = Object.assign({}, data[sectionId]);
      sec[option] = (sec[option] || 0) + 1;
      const next = Object.assign({}, data, { [sectionId]: sec });
      await writeJsonAtomic(file(slug), next);
      return sec;
    });
  }

  return { counts, vote, optionsFor };
}

module.exports = { createPollStore };
