// editingService.js — the draft → preview → publish flow, version history,
// restore and conflict acknowledgement, on top of a pluggable store:
//   memoryStore    — in-browser, used by the preview and unit tests
//   firestoreStore — Firebase (emulator / non-production project only)
//
// Rules this file enforces (Firestore security rules enforce the same ones on
// the server, see firestore.rules):
//   - only an active supervisor can save drafts, publish, restore or manage
//     supervisors; anyone can look things up
//   - a draft is private to its author and never affects lookups
//   - publishing makes the draft live at once and appends a version; versions
//     are never changed or deleted
//   - no second approver

import { examContent, diffExam, affectsOf } from './examFields';
import { validateExam, MIN_CHANGE_NOTE } from './validation';

export class EditingError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'EditingError';
    this.code = code;
    Object.assign(this, extra);
  }
}

export const supervisorKey = (email) => String(email || '').trim().toLowerCase();

const who = (user) => ({ uid: user.uid, email: supervisorKey(user.email), name: user.name || user.email });

const slug = (s) => String(s || 'exam').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'exam';

// facilities: [{ id, name }] — the facility list new exams start with, and
// the names used in change descriptions and messages.
export function createEditingService(store, { now = () => new Date().toISOString(), facilities = [] } = {}) {
  const facilityNames = Object.fromEntries(facilities.map((f) => [f.id, f.name]));

  const getSupervisorFor = async (user) => {
    if (!user?.uid || !user?.email) return null;
    const s = await store.getSupervisor(supervisorKey(user.email));
    return s && s.active !== false ? s : null;
  };

  const requireSupervisor = async (user) => {
    if (!user?.uid) throw new EditingError('signed-out', 'Sign in as a supervisor to make changes.');
    const s = await getSupervisorFor(user);
    if (!s) throw new EditingError('not-supervisor', 'Your account is not on the supervisor list, so you can look things up but not edit. Ask a supervisor who manages the list to add you.');
    return s;
  };

  const requireDraft = async (user, examId) => {
    const draft = await store.getDraft(examId, user.uid);
    if (!draft) throw new EditingError('no-draft', 'There is no draft for this exam. Select Edit to start one.');
    return draft;
  };

  const namesById = (exams) => ({ ...facilityNames, ...Object.fromEntries(exams.map((e) => [e.id, e.name])) });
  const check = (exam, exams, opts = {}) => validateExam(exam, exams, { ...opts, facilityNames });

  // Write a new published version. `content` is the full exam content.
  const commit = async (user, { examId, current, content, changeNote, extra = {}, allowNoChange = false }) => {
    // History shows the name on the supervisor list, not whatever the sign-in
    // provider reports (the security rules check the same thing).
    const sup = await getSupervisorFor(user);
    const exams = await store.listExams();
    const changes = diffExam(current, content, namesById(exams));
    if (!changes.length && !allowNoChange) {
      throw new EditingError('no-changes', 'Nothing has changed compared with the published version.');
    }
    const version = (current?.version || 0) + 1;
    const at = now();
    const by = { ...who(user), name: sup?.name || who(user).name };
    const exam = {
      ...examContent(content),
      id: examId,
      acknowledged: extra.acknowledged ?? current?.acknowledged ?? {},
      // Shown on the lookup as "Guidance last reviewed". Marking a conflict as
      // intended is not a review of the guidance, so it keeps the old date.
      lastReviewed: extra.acknowledged ? current?.lastReviewed ?? at.slice(0, 10) : at.slice(0, 10),
      version,
      updatedAt: at,
      updatedBy: by,
    };
    const record = {
      examId,
      version,
      snapshot: examContent(content),
      changeNote: String(changeNote).trim(),
      changes,
      affects: affectsOf(changes),
      publishedBy: by,
      publishedAt: at,
      restoredFrom: extra.restoredFrom ?? null,
      acknowledgedConflict: extra.acknowledgedConflict ?? null,
    };
    await store.commitPublish({ exam, version: record, expectedVersion: current?.version || 0 });
    return { exam, version: record };
  };

  return {
    // --- who can edit -----------------------------------------------------
    async canEdit(user) {
      return Boolean(await getSupervisorFor(user));
    },
    async canManageSupervisors(user) {
      const s = await getSupervisorFor(user);
      return Boolean(s?.canManageSupervisors);
    },
    async listSupervisors(user) {
      await requireSupervisor(user);
      return store.listSupervisors();
    },
    async saveSupervisor(user, { email, name, active = true, canManageSupervisors = false }) {
      const me = await requireSupervisor(user);
      if (!me.canManageSupervisors) {
        throw new EditingError('not-manager', 'Only supervisors who manage the list can add or remove supervisors.');
      }
      const key = supervisorKey(email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) throw new EditingError('bad-email', 'Enter a valid email address.');
      if (key === supervisorKey(user.email) && (!active || !canManageSupervisors)) {
        throw new EditingError('self-lockout', "You can't remove your own access. Ask another supervisor who manages the list.");
      }
      const rec = { email: key, name: String(name || '').trim() || key, active, canManageSupervisors, updatedAt: now(), updatedBy: who(user) };
      await store.saveSupervisor(rec);
      return rec;
    },

    // --- drafts (private, never live) -------------------------------------
    async startDraft(user, examId) {
      await requireSupervisor(user);
      const existing = await store.getDraft(examId, user.uid);
      if (existing) return existing;
      const current = await store.getExam(examId);
      if (!current) throw new EditingError('not-found', 'That exam was not found.');
      const draft = {
        examId,
        owner: who(user),
        isNew: false,
        baseVersion: current.version,
        base: examContent(current),
        content: examContent(current),
        updatedAt: now(),
      };
      await store.saveDraft(draft);
      return draft;
    },

    async startNewExamDraft(user, { name = '', kind = 'exam', parentId = null } = {}) {
      await requireSupervisor(user);
      const taken = new Set((await store.listExams()).map((e) => e.id));
      let examId = slug(name || (kind === 'protocol' ? 'new-protocol' : 'new-exam'));
      for (let i = 2; taken.has(examId); i++) examId = `${slug(name)}-${i}`;
      const parent = parentId ? await store.getExam(parentId) : null;
      const content = examContent({
        name, kind, parentId,
        category: parent?.category || '',
        // A new protocol starts from its parent's facility list, so availability
        // differences are deliberate choices, not omissions.
        facilities: (parent ? parent.facilities.map((f) => f.facilityId) : facilities.map((f) => f.id))
          .map((facilityId) => ({ facilityId, availability: '', note: '' })),
      });
      const draft = { examId, owner: who(user), isNew: true, baseVersion: 0, base: null, content, updatedAt: now() };
      await store.saveDraft(draft);
      return draft;
    },

    async getDraft(user, examId) {
      if (!user?.uid) return null;
      return store.getDraft(examId, user.uid);
    },

    async listMyDrafts(user) {
      if (!user?.uid) return [];
      return store.listDraftsBy(user.uid);
    },

    async saveDraft(user, examId, content) {
      await requireSupervisor(user);
      const draft = await requireDraft(user, examId);
      const next = { ...draft, content: { ...draft.content, ...content }, updatedAt: now() };
      await store.saveDraft(next);
      return next;
    },

    async discardDraft(user, examId) {
      await requireSupervisor(user);
      await store.deleteDraft(examId, user.uid);
    },

    // What Preview shows: the draft, what changed, problems to fix, and
    // whether someone published a newer version since the draft started.
    async previewDraft(user, examId) {
      const draft = await requireDraft(user, examId);
      const exams = await store.listExams();
      const current = exams.find((e) => e.id === examId) || null;
      const changes = diffExam(current && draft.isNew ? null : current, draft.content, namesById(exams));
      const errors = check({ ...draft.content, id: examId }, exams, { previous: draft.isNew ? null : current });
      const stale = Boolean(current && current.version !== draft.baseVersion) || Boolean(draft.isNew && current);
      let newer = [];
      if (stale) newer = (await store.listVersions(examId)).filter((v) => v.version > draft.baseVersion);
      return { draft, current, changes, affects: affectsOf(changes), errors, stale, newer };
    },

    // Someone published while this draft was open: keep the fields this
    // supervisor changed, take everything else from the latest version, and
    // report fields both people changed so they can double-check them.
    async updateDraftToLatest(user, examId) {
      await requireSupervisor(user);
      const draft = await requireDraft(user, examId);
      const current = await store.getExam(examId);
      if (!current) throw new EditingError('not-found', 'That exam was not found.');
      if (draft.isNew) throw new EditingError('id-taken', 'Another exam was published with this id. Discard this draft and start again.');
      const latest = examContent(current);
      const merged = { ...latest };
      const overlapping = [];
      for (const key of Object.keys(latest)) {
        const mine = JSON.stringify(draft.content[key]) !== JSON.stringify(draft.base[key]);
        const theirs = JSON.stringify(latest[key]) !== JSON.stringify(draft.base[key]);
        if (mine) {
          merged[key] = draft.content[key];
          if (theirs && JSON.stringify(latest[key]) !== JSON.stringify(draft.content[key])) overlapping.push(key);
        }
      }
      const next = { ...draft, baseVersion: current.version, base: latest, content: merged, updatedAt: now() };
      await store.saveDraft(next);
      return { draft: next, overlapping };
    },

    // Make the draft live. Requires a change note and passing validation.
    async publish(user, examId, changeNote) {
      await requireSupervisor(user);
      const draft = await requireDraft(user, examId);
      const exams = await store.listExams();
      const current = exams.find((e) => e.id === examId) || null;
      if ((current && current.version !== draft.baseVersion) || (draft.isNew && current)) {
        const newer = current ? (await store.listVersions(examId)).filter((v) => v.version > draft.baseVersion) : [];
        throw new EditingError('stale', 'Someone published a newer version of this exam after you started editing. Review their change, then update your draft to the latest before publishing.', { newer });
      }
      const errors = check({ ...draft.content, id: examId }, exams, { changeNote, previous: current });
      if (errors.length) throw new EditingError('invalid', 'Some things need fixing before you can publish.', { errors });
      try {
        const result = await commit(user, { examId, current, content: draft.content, changeNote });
        await store.deleteDraft(examId, user.uid);
        return result;
      } catch (e) {
        if (e.code === 'version-moved') {
          throw new EditingError('stale', 'Someone published a newer version of this exam a moment ago. Update your draft to the latest, then publish again.', { newer: [] });
        }
        throw e;
      }
    },

    // --- history ------------------------------------------------------------
    async history(examId) {
      return store.listVersions(examId);
    },

    // Put an earlier version back by publishing it as a new version.
    async restoreVersion(user, examId, versionNumber, changeNote) {
      await requireSupervisor(user);
      const versions = await store.listVersions(examId);
      const target = versions.find((v) => v.version === versionNumber);
      if (!target) throw new EditingError('not-found', 'That version was not found.');
      const exams = await store.listExams();
      const current = exams.find((e) => e.id === examId) || null;
      const note = changeNote || `Restored version ${versionNumber}`;
      const errors = check({ ...target.snapshot, id: examId }, exams, { changeNote: note, previous: current });
      if (errors.length) throw new EditingError('invalid', 'This version can\'t be restored as-is because it would clash with other exams. Edit the exam instead.', { errors });
      return commit(user, { examId, current, content: target.snapshot, changeNote: note, extra: { restoredFrom: versionNumber } });
    },

    // --- conflicts ------------------------------------------------------------
    async acknowledgeConflict(user, examId, conflict, reason) {
      await requireSupervisor(user);
      const why = String(reason || '').trim();
      if (why.length < MIN_CHANGE_NOTE) {
        throw new EditingError('invalid', 'Explain why this is intended (at least 10 characters).', { errors: [{ field: 'reason', message: 'Explain why this is intended (at least 10 characters).' }] });
      }
      const current = await store.getExam(examId);
      if (!current) throw new EditingError('not-found', 'That exam was not found.');
      const acknowledged = { ...(current.acknowledged || {}), [conflict.key]: { by: who(user), at: now(), reason: why } };
      return commit(user, {
        examId, current, content: current,
        changeNote: `Marked as intended: ${conflict.message} Reason: ${why}`,
        extra: { acknowledged, acknowledgedConflict: conflict.key },
        allowNoChange: true,
      });
    },
  };
}
