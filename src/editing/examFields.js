// examFields.js — plain-language labels for exam fields, and the diff that
// powers Preview ("what changed") and History ("who changed what").
//
// Every field belongs to one of two groups so History can say which saved
// changes affect live lookups and how:
//   'search'   — changes what the Find an exam search returns
//   'guidance' — changes what people read once they open a result

export const FACILITY_STATUS_LABEL = {
  yes: 'Performs',
  no: 'Does not perform',
  limited: 'Performs with limits',
};

export const KIND_LABEL = { orderable: 'Exam', protocol: 'Special protocol' };

export const EXAM_FIELDS = [
  { key: 'name', label: 'Exam name', affects: 'search' },
  { key: 'kind', label: 'Type', affects: 'search' },
  { key: 'parentId', label: 'Parent exam', affects: 'search' },
  { key: 'category', label: 'Category', affects: 'search' },
  { key: 'aliases', label: 'Search words (aliases)', affects: 'search' },
  { key: 'active', label: 'Shown in lookups', affects: 'search' },
  { key: 'orderables', label: 'Epic orderables', affects: 'guidance' },
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
export const examContent = (exam = {}) => ({
  name: (exam.name || '').trim(),
  kind: exam.kind === 'protocol' ? 'protocol' : 'orderable',
  parentId: exam.kind === 'protocol' ? exam.parentId || null : null,
  category: exam.category || '',
  aliases: cleanList(exam.aliases),
  active: exam.active !== false,
  orderables: cleanList(exam.orderables),
  scheduling: (exam.scheduling || '').trim(),
  clinicalReview: (exam.clinicalReview || '').trim(),
  facilities: (exam.facilities || []).map((f) => ({
    code: f.code,
    status: f.status || '',
    note: (f.note || '').trim(),
  })),
});

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

const describeFacilities = (before, after) => {
  const byCode = (list) => Object.fromEntries(list.map((f) => [f.code, f]));
  const b = byCode(before);
  const a = byCode(after);
  const codes = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  const parts = [];
  for (const code of codes) {
    const was = b[code];
    const now = a[code];
    if (!was) { parts.push(`${code}: added as ${FACILITY_STATUS_LABEL[now.status] || 'no status'}`); continue; }
    if (!now) { parts.push(`${code}: removed`); continue; }
    if (was.status !== now.status) {
      parts.push(`${code}: ${FACILITY_STATUS_LABEL[was.status] || 'no status'} → ${FACILITY_STATUS_LABEL[now.status] || 'no status'}`);
    }
    if (was.note !== now.note) {
      parts.push(now.note ? `${code} note: "${now.note}"` : `${code} note removed`);
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
  if (key === 'scheduling' || key === 'clinicalReview') {
    return [before ? 'Text updated' : 'Text added'];
  }
  return [`${show(before)} → ${show(after)}`];
};

// Field-by-field changes between two exam versions. `before` may be null for a
// brand-new exam. `names` maps exam ids to names so a parent reads as a name.
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
    else if (key === 'facilities') details = describeFacilities(was || [], now);
    else details = describeScalar(key, was, now, names);
    changes.push({ field: key, label, affects, details });
  }
  return changes;
}

// Which lookup effects a set of changes has, for the History tag.
export const affectsOf = (changes) => [...new Set(changes.map((c) => c.affects))].sort();
