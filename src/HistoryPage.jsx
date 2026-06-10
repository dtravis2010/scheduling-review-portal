// HistoryPage — a plain-language audit trail of every change made through the
// portal. Reads the top-level `auditLog` collection (written by audit.js) and
// presents each change so a non-technical reviewer can see, at a glance, WHAT
// changed: a one-line summary per row, readable (de-HTML'd) text, and the exact
// words removed (red) / added (green) highlighted inline.
//
// No Firestore composite index is required — a single orderBy('ts') query.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { restoreAudit } from './audit';
import { stripOOSPreserved } from './cardBuilder';
import { MODALITY_NAME, OOS_MODALITY_NAME } from './modalities';

const COLL_LABELS = {
  procedures: 'Procedure',
  reviews: 'Review',
  entityLinks: 'Entity Link',
  oosProcedures: 'Out of Scope',
};
const COLL_NOUN = {
  procedures: 'procedure',
  reviews: 'review',
  entityLinks: 'entity link',
  oosProcedures: 'out-of-scope procedure',
};
const FIELD_LABELS = {
  Scheduling_x0020_Instructions: 'Scheduling Instructions',
  Clinical_x0020_Review_x0020_Notes: 'Clinical Review Notes',
  comment: 'Reviewer Comment',
  isFinished: 'Review Status',
  sch: 'Scheduling Reference Link',
  cr: 'Clinical Review Reference Link',
  modalityId: 'Modality',
  name: 'Name',
  Procedure: 'Procedure Name',
  ModalityId: 'Modality',
  Entity0Id: 'Entity',
};
const ACTION_META = {
  create:  { bg: 'rgba(34,197,94,0.18)',  fg: '#86efac', label: 'Added' },
  update:  { bg: 'rgba(96,165,250,0.18)', fg: '#93c5fd', label: 'Changed' },
  delete:  { bg: 'rgba(248,113,113,0.18)',fg: '#fca5a5', label: 'Deleted' },
  restore: { bg: 'rgba(168,85,247,0.18)', fg: '#d8b4fe', label: 'Restored' },
  bulk:    { bg: 'rgba(234,179,8,0.18)',  fg: '#fde68a', label: 'Bulk update' },
};

const CONTENT_FIELDS = new Set(['Scheduling_x0020_Instructions', 'Clinical_x0020_Review_x0020_Notes']);
const fieldLabel = (k) => FIELD_LABELS[k] || k;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const fmtTime = (ts) => {
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
  if (!d) return 'just now';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

// Turn stored HTML into readable plain text: block tags become line breaks,
// table cells get separated, list items get bullets, then tags are stripped and
// entities decoded. Rendered later as escaped text (never as live HTML).
const htmlToText = (html) => {
  if (html == null) return '';
  if (typeof html !== 'string') return String(html);
  // Drop the hidden OOS data island first — its escaped-JSON body is text to
  // a tag-stripper but is never visible on the card.
  let s = stripOOSPreserved(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|h[1-6]|tr|li|ul|ol|table|thead|tbody|section|header)\s*>/gi, '\n')
    .replace(/<\/\s*(td|th)\s*>/gi, '   ')
    .replace(/<[^>]+>/g, '');
  // Decode entities safely (textarea content is text, not executed).
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  s = ta.value;
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const scalarText = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

// Any stored value → readable multi-line text (for diffing / display).
const valueToText = (key, value) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return CONTENT_FIELDS.has(key) ? htmlToText(value) : value;
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item && typeof item === 'object'
          ? Object.entries(item).map(([k, v]) => `${k}: ${scalarText(v)}`).join(', ')
          : scalarText(item)
      )
      .join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([k, v]) => `${fieldLabel(k)}: ${scalarText(v)}`).join('\n');
  }
  return String(value);
};

// Friendly one-liners for short/simple fields.
const prettyScalar = (key, v, coll) => {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (key === 'isFinished') return v ? 'Finished' : 'Not finished';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (key === 'modalityId' || key === 'ModalityId') {
    // Show the label the user actually picked: the OOS page relabels ID 1.
    const map = coll === 'oosProcedures' ? OOS_MODALITY_NAME : MODALITY_NAME;
    return map[v] || `Modality ${v}`;
  }
  if (typeof v === 'object') return valueToText(key, v);
  return String(v);
};

// Word-level diff via LCS. Returns segments [{type:'same'|'add'|'del', text}]
// or null when the inputs are too large to diff cheaply.
const tokenize = (s) => s.match(/\S+|\s+/g) || [];
const diffTokens = (aStr, bStr) => {
  const a = tokenize(aStr);
  const b = tokenize(bStr);
  const n = a.length, m = b.length;
  // One side empty: the diff is trivially all-del / all-add. (Also keeps a
  // huge n from slipping past the n*m cap as n*0 and allocating n+1 arrays.)
  if (n === 0 || m === 0) {
    const out = [];
    if (n) out.push({ type: 'del', text: a.join('') });
    if (m) out.push({ type: 'add', text: b.join('') });
    return out;
  }
  if (n * m > 1500000) return null; // too big — caller falls back to side-by-side
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  const push = (type, text) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', a[i]); i++; }
    else { push('add', b[j]); j++; }
  }
  while (i < n) { push('del', a[i++]); }
  while (j < m) { push('add', b[j++]); }
  return out;
};

const allKeys = (r) =>
  [...new Set([...Object.keys(r.before || {}), ...Object.keys(r.after || {})])];

const valEq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Keys whose value ACTUALLY changed. A single Save often writes several fields
// at once (e.g. comment + status together), so we hide the ones that stayed the
// same to keep the view honest. Create/delete show every field.
const changedKeys = (r) => {
  const keys = allKeys(r);
  if (r.action === 'create' || r.action === 'delete' || !r.before || !r.after) return keys;
  // A genuinely no-op save returns [] — summarize() says 'Updated' and the
  // expanded view shows 'No further detail recorded' rather than pretending
  // identical values changed.
  return keys.filter((k) => !valEq(r.before[k], r.after[k]));
};

// One-line, plain-language description of a whole change.
const summarize = (r) => {
  const noun = COLL_NOUN[r.coll] || 'item';
  if (r.action === 'bulk') return r.label;
  if (r.action === 'create') return `New ${noun} added`;
  if (r.action === 'delete') return `${cap(noun)} deleted`;
  const keys = changedKeys(r);
  if (keys.length === 1 && keys[0] === 'isFinished') {
    return r.after?.isFinished ? 'Marked as finished' : 'Marked as not finished';
  }
  if (r.action === 'restore') return `Restored ${keys.length ? keys.map(fieldLabel).join(', ') : 'previous version'}`;
  if (keys.length === 0) return 'Updated';
  return `Edited ${keys.map(fieldLabel).join(', ')}`;
};

// ─── presentational pieces ────────────────────────────────────────────────
const textBoxStyle = (tone) => {
  const palette = tone === 'before'
    ? { border: 'rgba(248,113,113,0.3)', bg: 'rgba(248,113,113,0.05)' }
    : tone === 'after'
      ? { border: 'rgba(34,197,94,0.3)', bg: 'rgba(34,197,94,0.05)' }
      : { border: 'rgba(255,255,255,0.12)', bg: 'rgba(255,255,255,0.03)' };
  return {
    margin: 0, padding: '10px 12px', maxHeight: '300px', overflow: 'auto',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    fontSize: '13px', lineHeight: 1.55, color: '#e2e8f0',
    background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: '6px',
  };
};

const Legend = () => (
  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginBottom: '6px' }}>
    <span><span style={{ background: 'rgba(248,113,113,0.25)', color: '#fecaca', textDecoration: 'line-through', padding: '1px 5px', borderRadius: '3px' }}>removed</span></span>
    <span><span style={{ background: 'rgba(34,197,94,0.28)', color: '#bbf7d0', padding: '1px 5px', borderRadius: '3px' }}>added</span></span>
  </div>
);

const DiffText = ({ before, after }) => {
  // Memoized: the LCS can fill ~1.5M dp cells — without this it reruns on
  // every parent re-render (each search keystroke, each incoming log write).
  const segs = useMemo(() => diffTokens(before || '', after || ''), [before, after]);
  if (!segs) {
    // Too large to diff — show readable before/after stacked.
    return (
      <div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted, #94a3b8)', margin: '2px 0' }}>BEFORE</div>
        <div style={textBoxStyle('before')}>{before || '(empty)'}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted, #94a3b8)', margin: '6px 0 2px' }}>AFTER</div>
        <div style={textBoxStyle('after')}>{after || '(empty)'}</div>
      </div>
    );
  }
  return (
    <div>
      <Legend />
      <div style={textBoxStyle('plain')}>
        {segs.map((seg, i) =>
          seg.type === 'same' ? (
            <span key={i}>{seg.text}</span>
          ) : seg.type === 'add' ? (
            <span key={i} style={{ background: 'rgba(34,197,94,0.28)', color: '#bbf7d0', borderRadius: '3px' }}>{seg.text}</span>
          ) : (
            <span key={i} style={{ background: 'rgba(248,113,113,0.22)', color: '#fecaca', textDecoration: 'line-through', borderRadius: '3px' }}>{seg.text}</span>
          )
        )}
      </div>
    </div>
  );
};

const FieldChange = ({ fieldKey, record }) => {
  const beforeRaw = record.before ? record.before[fieldKey] : undefined;
  const afterRaw = record.after ? record.after[fieldKey] : undefined;
  // Memoized: htmlToText runs several regex passes plus a DOM entity-decode
  // over card HTML that can be tens of KB.
  const [beforeText, afterText] = useMemo(
    () => [valueToText(fieldKey, beforeRaw), valueToText(fieldKey, afterRaw)],
    [fieldKey, beforeRaw, afterRaw]
  );

  const labelEl = (
    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#60a5fa', fontWeight: 700, marginBottom: '6px' }}>
      {fieldLabel(fieldKey)}
    </div>
  );

  // Brand-new (create / undelete): just show what it was set to.
  if (!record.before) {
    return (
      <div style={{ marginTop: '14px' }}>
        {labelEl}
        <div style={textBoxStyle('after')}>{afterText || '(empty)'}</div>
      </div>
    );
  }
  // Deleted: show what was removed.
  if (!record.after) {
    return (
      <div style={{ marginTop: '14px' }}>
        {labelEl}
        <div style={textBoxStyle('before')}>{beforeText || '(empty)'}</div>
      </div>
    );
  }

  // Short, single-line scalar → friendly "before → after".
  const isShort =
    beforeText.length <= 80 && afterText.length <= 80 &&
    !beforeText.includes('\n') && !afterText.includes('\n');
  if (isShort) {
    return (
      <div style={{ marginTop: '14px' }}>
        {labelEl}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '13px' }}>
          <span style={{ background: 'rgba(248,113,113,0.18)', color: '#fecaca', textDecoration: beforeRaw === undefined || beforeRaw === '' || beforeRaw === null ? 'none' : 'line-through', padding: '3px 10px', borderRadius: '6px' }}>
            {prettyScalar(fieldKey, beforeRaw, record.coll)}
          </span>
          <span style={{ color: 'var(--text-muted, #94a3b8)' }}>→</span>
          <span style={{ background: 'rgba(34,197,94,0.2)', color: '#bbf7d0', padding: '3px 10px', borderRadius: '6px', fontWeight: 600 }}>
            {prettyScalar(fieldKey, afterRaw, record.coll)}
          </span>
        </div>
      </div>
    );
  }

  // Longer text → highlighted word diff.
  return (
    <div style={{ marginTop: '14px' }}>
      {labelEl}
      <DiffText before={beforeText} after={afterText} />
    </div>
  );
};

export default function HistoryPage({ initialSearch = '' }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collFilter, setCollFilter] = useState('all');
  const [search, setSearch] = useState(initialSearch);
  const [expanded, setExpanded] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);

  useEffect(() => {
    const q = query(collection(db, 'auditLog'), orderBy('ts', 'desc'), limit(500));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setRecords(rows);
        setLoading(false);
        setError('');
      },
      (e) => {
        console.error('auditLog subscription failed:', e);
        setError(e.message || 'Could not load history. Check Firestore rules for the auditLog collection.');
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((r) => {
      if (collFilter !== 'all' && r.coll !== collFilter) return false;
      if (!term) return true;
      return (r.label || '').toLowerCase().includes(term) || (r.docId || '').toLowerCase().includes(term);
    });
  }, [records, collFilter, search]);

  const canRestore = (r) =>
    (r.action === 'update' || r.action === 'restore') && r.before && Object.keys(r.before).length > 0;
  const canUndelete = (r) =>
    r.action === 'delete' && r.before && Object.keys(r.before).length > 0;

  const handleRestore = async (r) => {
    const verb = r.action === 'delete' ? 'Bring back' : 'Restore the previous version of';
    if (!confirm(`${verb} "${r.label}"?\n\nThis updates the live data now, and the restore is itself recorded in history.`)) return;
    setBusyId(r.id);
    try {
      await restoreAudit(r);
    } catch (e) {
      console.error('Restore failed:', e);
      alert(`Restore failed: ${e.message || 'unknown error'}`);
    }
    setBusyId(null);
  };

  // ─── styles ───────────────────────────────────────────────────────────
  const containerStyle = { padding: '24px 36px', color: 'var(--text-primary, #f1f5f9)', fontFamily: 'Segoe UI, Arial, sans-serif' };
  const headerStyle = { fontSize: '20px', fontWeight: 800, marginBottom: '6px' };
  const subStyle = { fontSize: '13px', color: 'var(--text-muted, #94a3b8)', marginBottom: '20px', maxWidth: '760px', lineHeight: 1.5 };
  const controlsStyle = { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' };
  const inputStyle = { padding: '7px 12px', fontSize: '13px', background: 'rgba(0,0,0,0.25)', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', minWidth: '280px' };
  const selectStyle = { padding: '7px 12px', fontSize: '13px', background: 'rgba(0,0,0,0.25)', color: '#f1f5f9', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px' };
  const rowStyle = { border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '8px', overflow: 'hidden' };
  const rowHeadStyle = { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', cursor: 'pointer' };
  const badge = (meta) => ({ background: meta.bg, color: meta.fg, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap' });
  const restoreBtn = (disabled) => ({ padding: '6px 14px', fontSize: '12px', fontWeight: 600, border: '1px solid rgba(168,85,247,0.45)', borderRadius: '6px', cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? 'rgba(255,255,255,0.08)' : 'rgba(168,85,247,0.18)', color: '#d8b4fe' });

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Change History</div>
      <div style={subStyle}>
        A running record of every change made in this portal — newest first. Each row says what changed in plain language; expand it to see the exact wording, with <span style={{ color: '#fca5a5' }}>removed text</span> and <span style={{ color: '#86efac' }}>added text</span> highlighted. Use <strong>Restore</strong> to put a previous version back. Changes are tracked with what &amp; when (there is no sign-in, so individual people aren't named).
      </div>

      <div style={controlsStyle}>
        <input type="text" placeholder="Search by procedure / entity name…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />
        <select value={collFilter} onChange={(e) => setCollFilter(e.target.value)} style={selectStyle}>
          <option value="all">All areas</option>
          <option value="procedures">Procedures</option>
          <option value="reviews">Reviews</option>
          <option value="entityLinks">Entity Links</option>
          <option value="oosProcedures">Out of Scope</option>
        </select>
        <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>
          {filtered.length} {filtered.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', color: '#fca5a5', padding: '10px 14px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px' }}>Loading history…</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', padding: '20px 0' }}>
          No changes recorded yet{search || collFilter !== 'all' ? ' for this filter' : ''}. Edits made from here on will appear in this list.
        </div>
      )}

      {filtered.map((r) => {
        const meta = ACTION_META[r.action] || ACTION_META.update;
        const isOpen = expanded === r.id;
        const keys = changedKeys(r);
        const restorable = canRestore(r) || canUndelete(r);
        return (
          <div key={r.id} style={rowStyle}>
            <div style={rowHeadStyle} onClick={() => setExpanded(isOpen ? null : r.id)}>
              <span style={badge(meta)}>{meta.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label || r.docId}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                  {summarize(r)} · {COLL_LABELS[r.coll] || r.coll}
                </div>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>{fmtTime(r.ts)}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', width: '14px', textAlign: 'center' }}>{isOpen ? '▾' : '▸'}</span>
            </div>

            {isOpen && (
              <div style={{ padding: '4px 14px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {r.action === 'bulk' ? (
                  <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-primary, #f1f5f9)' }}>
                    {Object.entries(r.after || {}).map(([k, v]) => (
                      <div key={k} style={{ marginBottom: '4px' }}>{cap(k.replace(/([A-Z])/g, ' $1').trim())}: <strong>{scalarText(v)}</strong></div>
                    ))}
                  </div>
                ) : keys.length === 0 ? (
                  <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>No further detail recorded.</div>
                ) : (
                  keys.map((k) => <FieldChange key={k} fieldKey={k} record={r} />)
                )}

                {restorable && (
                  <div style={{ marginTop: '16px' }}>
                    <button onClick={() => handleRestore(r)} disabled={busyId === r.id} style={restoreBtn(busyId === r.id)}>
                      {busyId === r.id ? 'Restoring…' : (canUndelete(r) ? '↩ Bring this back' : '↩ Restore this version')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
