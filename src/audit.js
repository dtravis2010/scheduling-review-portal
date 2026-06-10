// audit.js — central change-logging for the Scheduling Review Portal.
//
// Every mutating Firestore write funnels through auditedSet / auditedDelete so
// a record of the change lands in the top-level `auditLog` collection:
//   { coll, docId, label, action, before, after, ts }
// `before`/`after` hold only the changed fields (the full doc for deletes), so
// the History page can show what a value was and offer a one-click restore.
//
// NOTE: there is no auth in this app, so changes are recorded with what + when
// but not who. Add Firebase Auth later if attribution is needed.

import { db } from './firebase';
import {
  doc, getDoc, setDoc, deleteDoc, deleteField,
  collection, addDoc, serverTimestamp,
} from 'firebase/firestore';

// Firestore rejects `undefined`; a JSON round-trip drops undefined keys and
// yields plain, storable data. All our values are HTML strings, numbers,
// arrays and plain objects — no class instances or cycles — so this is safe.
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// Append one record to auditLog. Never throws: a logging failure must not roll
// back or mask the primary write that already succeeded.
export async function logEvent(entry) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      coll: entry.coll,
      docId: entry.docId,
      label: entry.label || entry.docId,
      action: entry.action,
      before: plain(entry.before ?? null),
      after: plain(entry.after ?? null),
      ts: serverTimestamp(),
    });
  } catch (e) {
    console.error('auditLog write failed (primary write still applied):', e);
  }
}

// setDoc(merge) + audit. Captures the prior value of just the keys in `patch`
// so the log shows a precise field-level before/after. Only keys that actually
// existed are captured — a missing field stays missing in `before` (never a
// fabricated null), so a later restore doesn't materialize phantom nulls.
//
// opts.before lets a caller that already holds the current doc (via onSnapshot)
// skip the pre-read entirely: pass the current doc data, or null if the doc is
// known not to exist. This keeps hot-path writes at a single round-trip so
// Firestore's latency compensation updates the UI instantly.
export async function auditedSet(coll, docId, patch, opts = {}) {
  const ref = doc(db, coll, docId);
  let existed = false;
  let preReadOk = true;
  const before = {};

  const captureFrom = (cur) => {
    existed = true;
    for (const k of Object.keys(patch)) {
      if (k in cur) before[k] = cur[k];
    }
  };

  if (opts.before !== undefined) {
    if (opts.before !== null) captureFrom(opts.before);
  } else {
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) captureFrom(snap.data());
    } catch (e) {
      preReadOk = false;
      console.warn('audit pre-read failed; logging without before:', e);
    }
  }

  await setDoc(ref, patch, { merge: true });
  // Fire-and-forget: logEvent never throws, and awaiting it here would hold
  // every caller's saved/spinner feedback hostage to the audit write.
  // When the pre-read failed we don't know if the doc existed; call it an
  // 'update' (the common case) rather than fabricating a 'create'.
  void logEvent({
    coll, docId,
    label: opts.label,
    action: opts.action || (existed || !preReadOk ? 'update' : 'create'),
    before: existed ? before : null,
    after: patch,
  });
}

// deleteDoc + audit. Captures the full doc as `before` so it can be undeleted.
// If the pre-read shows the doc never existed, the delete is a no-op and is
// NOT logged — otherwise History would assert deletions that never happened.
export async function auditedDelete(coll, docId, opts = {}) {
  const ref = doc(db, coll, docId);
  let before = null;
  let preReadOk = true;
  try {
    const snap = await getDoc(ref);
    before = snap.exists() ? snap.data() : null;
  } catch (e) {
    preReadOk = false;
    console.warn('audit pre-read failed; logging delete without before:', e);
  }
  await deleteDoc(ref);
  if (before !== null || !preReadOk) {
    void logEvent({ coll, docId, label: opts.label, action: 'delete', before, after: null });
  }
}

// Log a bulk operation as a single summary record (batch upload, regenerate-
// all-cards) so we don't emit hundreds of per-doc rows.
export async function logBulk(coll, label, summary) {
  await logEvent({ coll, docId: label, label, action: 'bulk', before: null, after: summary });
}

// Apply a history record's `before` back onto the live doc, then log the
// reversal as its own 'restore' record (restores are themselves audited).
export async function restoreAudit(record) {
  const { coll, docId, before, after, action, label } = record;
  const ref = doc(db, coll, docId);

  if (action === 'delete') {
    // Undelete: `before` holds the full doc.
    if (!before || Object.keys(before).length === 0) {
      throw new Error('Nothing to restore — the deleted snapshot is empty.');
    }
    // If something now lives at this id (e.g. it was re-added after the
    // delete), snapshot it so the undelete itself is reversible.
    let cur = null;
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) cur = snap.data();
    } catch { /* best effort — restore still proceeds */ }
    await setDoc(ref, before, { merge: true });
    void logEvent({ coll, docId, label, action: 'restore', before: cur, after: before });
    return;
  }

  if (!before || Object.keys(before).length === 0) {
    throw new Error('Nothing to restore — no prior value was recorded for this change.');
  }

  // Field-level restore only makes sense on a doc that still exists. Writing
  // onto a deleted doc would resurrect a partial "ghost" (only the patched
  // fields, no Procedure/ModalityId), invisible to every page and export.
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (e) {
    throw new Error(`Could not verify the item still exists: ${e.message || 'read failed'}`);
  }
  if (!snap.exists()) {
    throw new Error('This item was deleted after this change. Restore its "Deleted" row first to bring the whole item back.');
  }

  // Snapshot the current value of those fields for the restore record's before.
  const d = snap.data();
  const cur = {};
  for (const k of Object.keys(before)) {
    if (k in d) cur[k] = d[k];
  }

  // True inverse: put back the old values, and remove fields the original
  // change ADDED (present in `after`, absent from `before`). Skip legacy
  // records where before[k] === null stood in for "absent" — null is already
  // what they recorded, and deleting based on it could drop a real null.
  const patch = { ...before };
  for (const k of Object.keys(after || {})) {
    if (!(k in before)) patch[k] = deleteField();
  }

  await setDoc(ref, patch, { merge: true });
  void logEvent({ coll, docId, label, action: 'restore', before: cur, after: before });
}
