// memoryStore.js — an in-browser store for the editing flow. The preview and
// unit tests use it, so neither can reach any Firebase project. With a
// `storageKey` it remembers edits in this browser's localStorage only.

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function createMemoryStore({ exams = [], supervisors = [], storageKey = null } = {}) {
  const fresh = () => ({
    exams: Object.fromEntries(exams.map((e) => [e.id, { version: 1, acknowledged: {}, ...clone(e) }])),
    versions: {},
    drafts: {},
    supervisors: Object.fromEntries(supervisors.map((s) => [s.email.toLowerCase(), clone(s)])),
  });

  let state = null;
  if (storageKey) {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) state = JSON.parse(saved);
    } catch { /* storage blocked: fall back to the sample data */ }
  }
  if (!state) state = fresh();

  // Seed version 1 for sample exams so History is never empty.
  for (const e of Object.values(state.exams)) {
    if (!state.versions[e.id]) {
      state.versions[e.id] = [{
        examId: e.id, version: e.version, snapshot: clone(e), changeNote: 'Sample data loaded',
        changes: [], affects: [], publishedBy: e.updatedBy || { name: 'Sample data' },
        publishedAt: e.updatedAt || null, restoredFrom: null, acknowledgedConflict: null,
      }];
    }
  }

  const listeners = new Set();
  const changed = () => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore */ }
    }
    for (const fn of listeners) fn();
  };
  const draftKey = (examId, uid) => `${examId}__${uid}`;

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reset() { state = fresh(); changed(); },

    async listExams() { return Object.values(state.exams).map(clone); },
    async getExam(id) { return clone(state.exams[id]) || null; },

    async getDraft(examId, uid) { return clone(state.drafts[draftKey(examId, uid)]) || null; },
    async listDraftsBy(uid) { return Object.values(state.drafts).filter((d) => d.owner.uid === uid).map(clone); },
    async saveDraft(draft) { state.drafts[draftKey(draft.examId, draft.owner.uid)] = clone(draft); changed(); },
    async deleteDraft(examId, uid) { delete state.drafts[draftKey(examId, uid)]; changed(); },

    async listVersions(examId) {
      return clone([...(state.versions[examId] || [])].sort((a, b) => b.version - a.version));
    },

    // Atomic: fails if someone else published since `expectedVersion`.
    async commitPublish({ exam, version, expectedVersion }) {
      const cur = state.exams[exam.id];
      if ((cur?.version || 0) !== expectedVersion) {
        const e = new Error('The published version moved.');
        e.code = 'version-moved';
        throw e;
      }
      state.exams[exam.id] = clone(exam);
      (state.versions[exam.id] ||= []).push(clone(version));
      changed();
    },

    async getSupervisor(email) { return clone(state.supervisors[email]) || null; },
    async listSupervisors() { return Object.values(state.supervisors).map(clone); },
    async saveSupervisor(rec) { state.supervisors[rec.email] = clone(rec); changed(); },
  };
}
