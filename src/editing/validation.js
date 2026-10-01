// validation.js — the checks that must pass before a draft can be published.
// Messages are written for supervisors: what is wrong and how to fix it, next
// to the field it belongs to. Nothing here blocks saving a draft.

import { examContent } from './examFields';
import { matchExam, tokenize } from '../lookup/search';

export const MIN_CHANGE_NOTE = 10;

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// draft: the exam being published. others: every other published exam.
// previous: the published version this draft replaces (null for a new exam).
// Returns [{ field, message }]; an empty list means it can be published.
export function validateExam(draft, others = [], { changeNote, facilityNames = {}, previous = null } = {}) {
  const exam = examContent(draft);
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  const rest = others.filter((o) => o.id !== draft.id).map((o) => ({ id: o.id, ...examContent(o) }));

  if (!exam.name) add('name', 'Enter the exam name.');
  else {
    const clash = rest.find((o) => norm(o.name) === norm(exam.name));
    if (clash) add('name', `Another exam is already called "${clash.name}". Use a different name.`);
  }

  if (!exam.category) add('category', 'Choose a category.');

  let parent = null;
  if (exam.kind === 'protocol') {
    parent = rest.find((o) => o.id === exam.parentId) || null;
    if (!exam.parentId) add('parentId', 'A special protocol needs a parent exam. Choose the exam it belongs to.');
    else if (!parent) add('parentId', 'The parent exam was not found. Choose it again.');
    else if (parent.kind === 'protocol') add('parentId', 'The parent must be a regular exam, not another special protocol.');
  }

  for (const alias of exam.aliases) {
    const a = norm(alias);
    if (a === norm(exam.name)) {
      add('aliases', `"${alias}" is the same as the exam name, so it isn't needed as a search word.`);
      continue;
    }
    const nameClash = rest.find((o) => norm(o.name) === a);
    if (nameClash) {
      add('aliases', `"${alias}" is the name of another exam ("${nameClash.name}"). Searches for it would land on the wrong exam.`);
      continue;
    }
    const aliasClash = rest.find((o) => o.aliases.some((x) => norm(x) === a));
    if (aliasClash) {
      add('aliases', `"${alias}" is already a search word for "${aliasClash.name}". Each search word can point to only one exam.`);
      continue;
    }
    // Keep generic wording from matching a specialized protocol: a protocol's
    // search words can't be its parent's orderable/transcription names.
    if (parent && parent.orderables.some((x) => norm(x) === a)) {
      add('aliases', `"${alias}" is an orderable for the parent exam "${parent.name}". A special protocol can't use it, or general orders would match this protocol.`);
    }
  }

  // The lookup only shows a protocol when the search has a word that sets it
  // apart from its parent. If none of its own words do, nobody can find it.
  if (parent && !errors.some((e) => e.field === 'aliases' || e.field === 'name')) {
    const byId = new Map([...rest, { ...exam, id: draft.id }].map((e) => [e.id, e]));
    const findable = [exam.name, ...exam.aliases].some((w) => matchExam({ ...exam, id: draft.id }, tokenize(w), byId));
    if (!findable) {
      add('aliases', `Searches can't tell this protocol apart from "${parent.name}". Add a search word only this protocol uses (for example "MAKO").`);
    }
  }

  // A regular exam is found by its order names, so each order name belongs to
  // one regular exam. Only a special protocol may share its parent's.
  const formerParent = previous?.kind === 'protocol' && exam.kind === 'exam'
    ? rest.find((o) => o.id === previous.parentId) || null
    : null;
  if (exam.kind === 'exam') {
    for (const o of exam.orderables) {
      const owner = rest.find(
        (x) => x.orderables.some((y) => norm(y) === norm(o)) && !(x.kind === 'protocol' && x.parentId === draft.id),
      );
      if (!owner) continue;
      add('orderables', owner.id === formerParent?.id
        ? `"${o}" is the order name for "${owner.name}". As a regular exam, every search for that order would also show this exam. Remove it, or keep this a special protocol.`
        : `"${o}" is already an order name for "${owner.name}". Searches for that order would show both exams. Remove it from one of them.`);
    }
  }

  // Turning a special protocol into a regular exam must not let the parent's
  // everyday searches start landing on it (for example "ct lower extremity"
  // showing MAKO).
  if (formerParent) {
    const self = { ...exam, id: draft.id };
    const byId = new Map([...rest, self].map((e) => [e.id, e]));
    const hijacked = [formerParent.name, ...formerParent.aliases]
      .filter((w) => matchExam(self, tokenize(w), byId));
    if (hijacked.length) {
      add('kind', `As a regular exam, searches meant for "${formerParent.name}" would also show this one (${hijacked.map((w) => `"${w}"`).join(', ')}). Keep it a special protocol, or rename it and remove the search words it shares with "${formerParent.name}".`);
    }
  }

  const label = (id) => facilityNames[id] || id;
  if (exam.facilities.length === 0) add('facilities', 'Add at least one facility and say whether it offers this exam.');
  const missing = exam.facilities.filter((f) => !f.availability).map((f) => label(f.facilityId));
  if (missing.length) add('facilities', `Choose Offered, Limited or Not offered for: ${missing.join(', ')}.`);
  const limitedNoNote = exam.facilities.filter((f) => f.availability === 'limited' && !f.note).map((f) => label(f.facilityId));
  if (limitedNoNote.length) add('facilities', `Explain the limits in the note for: ${limitedNoNote.join(', ')}.`);

  if (!exam.scheduling.length && !exam.clinicalReview.length) {
    add('scheduling', 'Add scheduling or clinical review guidance so people know what to do.');
  }

  if (changeNote !== undefined && String(changeNote).trim().length < MIN_CHANGE_NOTE) {
    add('changeNote', 'Add a short note explaining why you made this change (at least 10 characters).');
  }

  return errors;
}

export const errorsFor = (errors, field) => errors.filter((e) => e.field === field).map((e) => e.message);
