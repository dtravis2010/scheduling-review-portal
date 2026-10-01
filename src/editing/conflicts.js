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

export function findConflicts(exams) {
  const list = exams.filter((e) => e.active !== false).map((e) => ({ raw: e, id: e.id, ...examContent(e) }));
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const conflicts = [];

  for (const exam of list) {
    // Protocol offered somewhere its parent exam is not.
    if (exam.kind === 'protocol' && byId[exam.parentId]) {
      const parent = byId[exam.parentId];
      const parentStatus = Object.fromEntries(parent.facilities.map((f) => [f.code, f.status]));
      for (const f of exam.facilities) {
        if ((f.status === 'yes' || f.status === 'limited') && parentStatus[f.code] === 'no') {
          conflicts.push({
            key: `protocol-parent:${exam.id}:${parent.id}:${f.code}`,
            type: 'protocol-parent',
            examIds: [exam.id, parent.id],
            facility: f.code,
            message: `${exam.name} is marked "${FACILITY_STATUS_LABEL[f.status]}" at ${f.code}, but its parent exam ${parent.name} is marked "Does not perform" there.`,
          });
        }
      }
    }

    // A facility's status and its note say opposite things.
    for (const f of exam.facilities) {
      if (!f.note) continue;
      const saysNo = SAYS_NOT_PERFORMED.test(f.note);
      const saysYes = !saysNo && SAYS_PERFORMED.test(f.note);
      if ((f.status === 'yes' && saysNo) || (f.status === 'no' && saysYes)) {
        conflicts.push({
          key: `status-note:${exam.id}:${f.code}:${f.status}:${norm(f.note)}`,
          type: 'status-note',
          examIds: [exam.id],
          facility: f.code,
          message: `${exam.name} at ${f.code} is marked "${FACILITY_STATUS_LABEL[f.status]}", but the note says: "${f.note}".`,
        });
      }
    }
  }

  // Two exams list the same Epic orderable, so transcription is ambiguous.
  const owners = new Map();
  for (const exam of list) {
    for (const o of exam.orderables) {
      const k = norm(o);
      if (!owners.has(k)) owners.set(k, { label: o, ids: [] });
      owners.get(k).ids.push(exam.id);
    }
  }
  for (const [k, { label, ids }] of owners) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort();
    conflicts.push({
      key: `shared-orderable:${k}:${sorted.join(',')}`,
      type: 'shared-orderable',
      examIds: sorted,
      message: `The orderable "${label}" is listed on more than one exam: ${sorted.map((id) => byId[id].name).join(' and ')}.`,
    });
  }

  // Hide the ones a supervisor has marked as intended on any involved exam.
  return conflicts.filter((c) => !c.examIds.some((id) => byId[id]?.raw.acknowledged?.[c.key]));
}

export const conflictsForExam = (conflicts, examId) => conflicts.filter((c) => c.examIds.includes(examId));
