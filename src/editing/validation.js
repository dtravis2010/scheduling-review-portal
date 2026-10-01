// validation.js — the checks that must pass before a draft can be published.
// Messages are written for supervisors: what is wrong and how to fix it, next
// to the field it belongs to. Nothing here blocks saving a draft.

import { examContent } from './examFields';

export const MIN_CHANGE_NOTE = 10;

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// draft: the exam being published. others: every other published exam.
// Returns [{ field, message }]; an empty list means it can be published.
export function validateExam(draft, others = [], { changeNote } = {}) {
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

  if (exam.facilities.length === 0) add('facilities', 'Add at least one facility and say whether it performs this exam.');
  const missing = exam.facilities.filter((f) => !f.status).map((f) => f.code);
  if (missing.length) add('facilities', `Choose Performs, Does not perform or Performs with limits for: ${missing.join(', ')}.`);
  const limitedNoNote = exam.facilities.filter((f) => f.status === 'limited' && !f.note).map((f) => f.code);
  if (limitedNoNote.length) add('facilities', `Explain the limits in the note for: ${limitedNoNote.join(', ')}.`);

  if (!exam.scheduling && !exam.clinicalReview) {
    add('scheduling', 'Add scheduling or clinical review guidance so people know what to do.');
  }

  if (changeNote !== undefined && String(changeNote).trim().length < MIN_CHANGE_NOTE) {
    add('changeNote', 'Add a short note explaining why you made this change (at least 10 characters).');
  }

  return errors;
}

export const errorsFor = (errors, field) => errors.filter((e) => e.field === field).map((e) => e.message);
