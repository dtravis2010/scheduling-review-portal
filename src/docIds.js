// docIds.js — Firestore document-id helpers shared by the pages that turn a
// user-supplied procedure name into a doc id.
//
// Ids in `procedures`, `reviews` and `oosProcedures` are the procedure name
// with `/` swapped for `-` (a slash would make Firestore treat the name as a
// subcollection path). That is the only rewrite we do, so an id can still be
// one of the few strings Firestore rejects server-side — the JS SDK does not
// validate these client-side, so the write fails late with a raw
// INVALID_ARGUMENT error unless we check first.

export const toDocId = (name) => String(name ?? '').replace(/\//g, '-');

// True when Firestore will accept `id` as a document id. The 1,500 limit is
// in UTF-8 bytes, not characters.
const utf8Bytes = (s) => new TextEncoder().encode(s).length;
export const isValidDocId = (id) =>
  typeof id === 'string' &&
  id.length > 0 &&
  utf8Bytes(id) <= 1500 &&
  id !== '.' &&
  id !== '..' &&
  !/^__.*__$/.test(id);
