// examFields.js — plain-language labels for exam fields, and the diff that
// powers Preview ("what changed") and History ("who changed what").
//
// Every field belongs to one of two groups so History can say which saved
// changes affect live lookups and how:
//   'search'   — changes what the Find an exam search returns
//   'guidance' — changes what people read once they open a result

// Same words the lookup's availability badges use (src/lookup/Availability.jsx).
export const FACILITY_STATUS_LABEL = {
  yes: 'Offered',
  no: 'Not offered',
  limited: 'Limited',
};

export const KIND_LABEL = { exam: 'Exam', protocol: 'Special protocol' };

export const EXAM_FIELDS = [
  { key: 'name', label: 'Exam name', affects: 'search' },
  { key: 'kind', label: 'Type', affects: 'search' },
  { key: 'parentId', label: 'Parent exam', affects: 'search' },
  { key: 'category', label: 'Category', affects: 'search' },
  { key: 'aliases', label: 'Search words (aliases)', affects: 'search' },
  { key: 'active', label: 'Shown in lookups', affects: 'search' },
  // Search uses a regular exam's order names; a protocol's are reference only.
  { key: 'orderables', label: 'Order names', affects: 'search-if-exam' },
  { key: 'scheduling', label: 'Scheduling guidance', affects: 'guidance' },
  { key: 'clinicalReview', label: 'Clinical review guidance', affects: 'guidance' },
  { key: 'facilities', label: 'Facility availability', affects: 'guidance' },
];

export const AFFECTS_LABEL = {
  search: 'Changes search results',
  guidance: 'Changes guidance shown',
};

const FIELD_BY_KEY = Object.fromEntries(EXAM_FIELDS.map((f) => [f.key, f]));
export const fieldLabel = (key) => FIELD_BY_KEY[key]?.label || key;

// The editable content of an exam, with every field present and normalized,
// so a draft and its published version always compare like for like.
// Uses the lookup's record shape (src/lookup/sampleExams.js).
export const examContent = (exam = {}) => ({
  name: (exam.name || '').trim(),
  kind: exam.kind === 'protocol' ? 'protocol' : 'exam',
  parentId: exam.kind === 'protocol' ? exam.parentId || null : null,
  category: exam.category || '',
  aliases: cleanList(exam.aliases),
  active: exam.active !== false,
  orderables: cleanList(exam.orderables),
  scheduling: cleanLines(exam.scheduling),
  clinicalReview: cleanLines(exam.clinicalReview),
  facilities: (exam.facilities || []).map((f) => ({
    facilityId: f.facilityId,
    availability: f.availability || '',
    note: (f.note || '').trim(),
  })),
});

// Guidance is a list of short instructions, shown as bullets.
export const cleanLines = (lines) =>
  (Array.isArray(lines) ? lines : String(lines || '').split('\n'))
    .map((l) => String(l || '').trim())
    .filter(Boolean);

export function cleanList(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const v = String(raw || '').trim().replace(/\s+/g, ' ');
    const k = v.toLowerCase();
    if (v && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const describeList = (before, after) => {
  const b = new Set(before.map((s) => s.toLowerCase()));
  const a = new Set(after.map((s) => s.toLowerCase()));
  const parts = [];
  const added = after.filter((s) => !b.has(s.toLowerCase()));
  const removed = before.filter((s) => !a.has(s.toLowerCase()));
  if (added.length) parts.push(`Added ${added.map((s) => `"${s}"`).join(', ')}`);
  if (removed.length) parts.push(`Removed ${removed.map((s) => `"${s}"`).join(', ')}`);
  return parts.length ? parts : ['Reordered'];
};

const describeLines = (before, after) => {
  const added = after.filter((l) => !before.includes(l));
  const removed = before.filter((l) => !after.includes(l));
  const parts = [...added.map((l) => `Added: "${l}"`), ...removed.map((l) => `Removed: "${l}"`)];
  return parts.length ? parts : ['Reordered'];
};

const describeFacilities = (before, after, names) => {
  const byCode = (list) => Object.fromEntries(list.map((f) => [f.facilityId, f]));
  const label = (code) => names?.[code] || code;
  const b = byCode(before);
  const a = byCode(after);
  const codes = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  const parts = [];
  for (const code of codes) {
    const was = b[code];
    const now = a[code];
    const st = (f) => FACILITY_STATUS_LABEL[f.availability] || 'not set';
    if (!was) { parts.push(`${label(code)}: added as ${st(now)}`); continue; }
    if (!now) { parts.push(`${label(code)}: removed`); continue; }
    if (was.availability !== now.availability) parts.push(`${label(code)}: ${st(was)} → ${st(now)}`);
    if (was.note !== now.note) {
      parts.push(now.note ? `${label(code)} note: "${now.note}"` : `${label(code)} note removed`);
    }
  }
  return parts;
};

const describeScalar = (key, before, after, names) => {
  const show = (v) => {
    if (key === 'kind') return KIND_LABEL[v];
    if (key === 'active') return v ? 'Yes' : 'No (retired)';
    if (key === 'parentId') return v ? names?.[v] || v : 'None';
    return v ? `"${v}"` : '(empty)';
  };
  return [`${show(before)} → ${show(after)}`];
};

// Field-by-field changes between two exam versions. `before` may be null for a
// brand-new exam. `names` maps exam and facility ids to display names.
export function diffExam(before, after, names = {}) {
  const b = before ? examContent(before) : null;
  const a = examContent(after);
  const changes = [];
  for (const { key, label, affects } of EXAM_FIELDS) {
    const was = b ? b[key] : undefined;
    const now = a[key];
    if (b && same(was, now)) continue;
    if (!b) {
      const empty = now == null || now === '' || (Array.isArray(now) && now.length === 0);
      if (empty) continue;
    }
    let details;
    if (key === 'aliases' || key === 'orderables') details = describeList(was || [], now);
    else if (key === 'scheduling' || key === 'clinicalReview') details = describeLines(was || [], now);
    else if (key === 'facilities') details = describeFacilities(was || [], now, names);
    else details = describeScalar(key, was, now, names);
    const effect = affects === 'search-if-exam'
      ? (a.kind === 'exam' || b?.kind === 'exam' ? 'search' : 'guidance')
      : affects;
    changes.push({ field: key, label, affects: effect, details });
  }
  return changes;
}

// Which lookup effects a set of changes has, for the History tag.
export const affectsOf = (changes) => [...new Set(changes.map((c) => c.affects))].sort();
