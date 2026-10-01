// conflicts.js — finds guidance that disagrees across published exams, so it
// can be flagged on the exam and in the "Needs attention" list.
//
// A conflict never blocks a lookup or a publish. A supervisor either fixes it
// (edit the exam) or marks it as intended with a reason. A conflict's key
// includes the values involved, so an acknowledgement stops applying once
// those values change and the flag comes back.

import { examContent, FACILITY_STATUS_LABEL } from './examFields';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

const SAYS_NOT_PERFORMED = /\b(does\s*n[o']t|do\s*not|not)\s+(perform|offer|do)|\bnot\s+(available|offered|performed)\b|\bno\s+longer\b/i;
const SAYS_PERFORMED = /\b(performs|available|offered)\b/i;

const label = (names, id) => names?.[id] || id;

// facilityNames: { facilityId: 'Display name' } for readable messages.
export function findConflicts(exams, facilityNames = {}) {
  const list = exams.filter((e) => e.active !== false).map((e) => ({ raw: e, id: e.id, ...examContent(e) }));
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const conflicts = [];

  for (const exam of list) {
    // Protocol offered somewhere its parent exam is not.
    if (exam.kind === 'protocol' && byId[exam.parentId]) {
      const parent = byId[exam.parentId];
      const parentStatus = Object.fromEntries(parent.facilities.map((f) => [f.facilityId, f.availability]));
      for (const f of exam.facilities) {
        if ((f.availability === 'yes' || f.availability === 'limited') && parentStatus[f.facilityId] === 'no') {
          conflicts.push({
            key: `protocol-parent:${exam.id}:${parent.id}:${f.facilityId}`,
            type: 'protocol-parent',
            examIds: [exam.id, parent.id],
            facility: f.facilityId,
            message: `${exam.name} is marked "${FACILITY_STATUS_LABEL[f.availability]}" at ${label(facilityNames, f.facilityId)}, but its parent exam ${parent.name} is marked "Not offered" there.`,
          });
        }
      }
    }

    // A facility's status and its note say opposite things.
    for (const f of exam.facilities) {
      if (!f.note) continue;
      const saysNo = SAYS_NOT_PERFORMED.test(f.note);
      const saysYes = !saysNo && SAYS_PERFORMED.test(f.note);
      if ((f.availability === 'yes' && saysNo) || (f.availability === 'no' && saysYes)) {
        conflicts.push({
          key: `status-note:${exam.id}:${f.facilityId}:${f.availability}:${norm(f.note)}`,
          type: 'status-note',
          examIds: [exam.id],
          facility: f.facilityId,
          message: `${exam.name} at ${label(facilityNames, f.facilityId)} is marked "${FACILITY_STATUS_LABEL[f.availability]}", but the note says: "${f.note}".`,
        });
      }
    }
  }

  // Two unrelated exams list the same order name, so transcription is
  // ambiguous. A protocol sharing its parent's order names is expected: that is
  // how special protocols are ordered.
  const family = (e) => (e.kind === 'protocol' && byId[e.parentId] ? e.parentId : e.id);
  const owners = new Map();
  for (const exam of list) {
    for (const o of exam.orderables) {
      const k = norm(o);
      if (!owners.has(k)) owners.set(k, { text: o, ids: [], families: new Set() });
      const entry = owners.get(k);
      entry.ids.push(exam.id);
      entry.families.add(family(exam));
    }
  }
  for (const [k, { text, ids, families }] of owners) {
    if (families.size < 2) continue;
    const sorted = [...ids].sort();
    conflicts.push({
      key: `shared-orderable:${k}:${sorted.join(',')}`,
      type: 'shared-orderable',
      examIds: sorted,
      message: `The order name "${text}" is listed on more than one exam: ${sorted.map((id) => byId[id].name).join(' and ')}.`,
    });
  }

  // Hide the ones a supervisor has marked as intended on any involved exam.
  return conflicts.filter((c) => !c.examIds.some((id) => byId[id]?.raw.acknowledged?.[c.key]));
}

export const conflictsForExam = (conflicts, examId) => conflicts.filter((c) => c.examIds.includes(examId));
