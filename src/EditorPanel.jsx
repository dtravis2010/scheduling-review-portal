// EditorPanel.jsx
// Structured editor for a single SCH card. Receives a `value` (parsed structure)
// and an `onChange(updated)` callback. Renders form fields for every section.

import React from 'react';
import { ALL_ENTITIES } from './cardParser';

const fieldLabel = (text) => (
  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-blue, #60a5fa)', fontWeight: 700, marginBottom: 6 }}>{text}</div>
);

const sectionWrap = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '0.75rem',
  padding: '1rem 1.25rem',
  marginBottom: '1rem'
};

const inputStyle = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.75rem',
  color: 'var(--text-primary, #f1f5f9)',
  fontSize: '0.875rem',
  fontFamily: 'inherit'
};

const textareaStyle = { ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' };

const btnStyle = {
  background: 'rgba(96,165,250,0.18)',
  border: '1px solid rgba(96,165,250,0.4)',
  color: '#93c5fd',
  borderRadius: '0.375rem',
  padding: '0.35rem 0.75rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  fontWeight: 600
};

const dangerBtnStyle = { ...btnStyle, background: 'rgba(248,113,113,0.18)', borderColor: 'rgba(248,113,113,0.4)', color: '#fca5a5' };

const BulletList = ({ label, bullets, onChange }) => {
  const update = (i, v) => {
    const next = [...bullets];
    next[i] = v;
    onChange(next);
  };
  const add = () => onChange([...bullets, '']);
  const remove = (i) => onChange(bullets.filter((_, idx) => idx !== i));
  return (
    <div style={sectionWrap}>
      {fieldLabel(label)}
      {(bullets || []).map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <textarea style={{ ...textareaStyle, minHeight: 44 }} value={b} onChange={(e) => update(i, e.target.value)} />
          <button type="button" style={{ ...dangerBtnStyle, alignSelf: 'flex-start' }} onClick={() => remove(i)} title="Delete bullet">&#10005;</button>
        </div>
      ))}
      <button type="button" style={btnStyle} onClick={add}>+ Add bullet</button>
    </div>
  );
};

const OrderOptionsTable = ({ rows, onChange }) => {
  const update = (i, field, v) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: v } : r);
    onChange(next);
  };
  const add = () => onChange([...rows, { visitType: '', code: '', cpt: '', contrast: '', instructions: '' }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const headerCell = { padding: '0.5rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' };
  return (
    <div style={sectionWrap}>
      {fieldLabel('Order Options')}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              <th style={headerCell}>Visit Type</th>
              <th style={{ ...headerCell, width: 80 }}>Code</th>
              <th style={{ ...headerCell, width: 200 }}>CPT Codes</th>
              <th style={{ ...headerCell, width: 180 }}>Contrast</th>
              <th style={headerCell}>Instructions</th>
              <th style={{ ...headerCell, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, i) => (
              <tr key={i}>
                <td style={{ padding: 4 }}><input style={inputStyle} value={r.visitType} onChange={(e) => update(i, 'visitType', e.target.value)} /></td>
                <td style={{ padding: 4 }}><input style={inputStyle} value={r.code} onChange={(e) => update(i, 'code', e.target.value)} /></td>
                <td style={{ padding: 4 }}><input style={inputStyle} value={r.cpt} onChange={(e) => update(i, 'cpt', e.target.value)} /></td>
                <td style={{ padding: 4 }}><input style={inputStyle} value={r.contrast} onChange={(e) => update(i, 'contrast', e.target.value)} /></td>
                <td style={{ padding: 4 }}><textarea style={{ ...textareaStyle, minHeight: 40 }} value={r.instructions} onChange={(e) => update(i, 'instructions', e.target.value)} /></td>
                <td style={{ padding: 4, verticalAlign: 'top' }}><button type="button" style={dangerBtnStyle} onClick={() => remove(i)} title="Delete row">&#10005;</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" style={btnStyle} onClick={add}>+ Add row</button>
      </div>
    </div>
  );
};

const EntityMatrixTable = ({ rows, onChange }) => {
  const update = (i, field, v) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: v } : r);
    onChange(next);
  };
  const yesBtn = (active) => ({
    padding: '0.25rem 0.75rem',
    border: '1px solid',
    borderColor: active ? '#22c55e' : 'rgba(255,255,255,0.15)',
    borderRadius: '0.375rem',
    background: active ? 'rgba(34,197,94,0.2)' : 'rgba(0,0,0,0.2)',
    color: active ? '#86efac' : 'var(--text-muted, #94a3b8)',
    fontWeight: 700,
    fontSize: '0.75rem',
    cursor: 'pointer'
  });
  const noBtn = (active) => ({
    padding: '0.25rem 0.75rem',
    border: '1px solid',
    borderColor: active ? '#ef4444' : 'rgba(255,255,255,0.15)',
    borderRadius: '0.375rem',
    background: active ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.2)',
    color: active ? '#fca5a5' : 'var(--text-muted, #94a3b8)',
    fontWeight: 700,
    fontSize: '0.75rem',
    cursor: 'pointer'
  });
  return (
    <div style={sectionWrap}>
      {fieldLabel('Entity Matrix')}
      <div style={{ display: 'grid', gap: 8 }}>
        {(rows || []).map((r, i) => (
          <div key={r.entity || i} style={{ display: 'grid', gridTemplateColumns: '80px 130px 1fr', gap: 8, alignItems: 'center' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-blue, #60a5fa)', fontSize: '0.85rem' }}>{r.entity}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={yesBtn(r.performs === 'YES')} onClick={() => update(i, 'performs', 'YES')}>YES</button>
              <button type="button" style={noBtn(r.performs === 'NO')} onClick={() => update(i, 'performs', 'NO')}>NO</button>
            </div>
            <textarea style={{ ...textareaStyle, minHeight: 36 }} placeholder="Entity-specific notes (leave blank for none)" value={r.notes} onChange={(e) => update(i, 'notes', e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );
};

const EditorPanel = ({ value, onChange }) => {
  const update = (patch) => onChange({ ...value, ...patch });
  return (
    <div>
      <div style={sectionWrap}>
        {fieldLabel('Procedure Name')}
        <input style={inputStyle} value={value.procedureName || ''} onChange={(e) => update({ procedureName: e.target.value })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
        <div style={sectionWrap}>
          {fieldLabel('Modality')}
          <input style={inputStyle} value={value.modality || ''} onChange={(e) => update({ modality: e.target.value })} />
        </div>
        <div style={sectionWrap}>
          {fieldLabel('Header Image URL (optional)')}
          <input style={inputStyle} placeholder="/sites/.../my-image.jpg" value={value.headerImage || ''} onChange={(e) => update({ headerImage: e.target.value })} />
        </div>
      </div>

      <OrderOptionsTable rows={value.orderOptions || []} onChange={(rows) => update({ orderOptions: rows })} />

      <div style={sectionWrap}>
        {fieldLabel('Standard Instructions')}
        <textarea style={textareaStyle} value={value.standardInstructions || ''} onChange={(e) => update({ standardInstructions: e.target.value })} />
      </div>

      <EntityMatrixTable rows={value.entityMatrix || []} onChange={(rows) => update({ entityMatrix: rows })} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <BulletList label="STAT Orders bullets" bullets={value.stat || []} onChange={(b) => update({ stat: b })} />
        <BulletList label="ASAP / Same Day / Next Day (Non-STAT) bullets" bullets={value.asap || []} onChange={(b) => update({ asap: b })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <BulletList label="Special Needs bullets" bullets={value.specialNeeds || []} onChange={(b) => update({ specialNeeds: b })} />
        <BulletList label="COVID STATUS bullets" bullets={value.covid || []} onChange={(b) => update({ covid: b })} />
      </div>
    </div>
  );
};

export default EditorPanel;
