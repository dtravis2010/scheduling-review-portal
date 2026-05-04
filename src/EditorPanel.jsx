// EditorPanel.jsx
// Structured editor for SCH and CR cards. Pass `kind="SCH"` or `kind="CR"`.
// Receives a `value` (parsed structure) and an `onChange(updated)` callback.

import React, { useState } from 'react';

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

const EpicOrderablesTable = ({ rows, onChange }) => {
  const update = (i, field, v) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: v } : r);
    onChange(next);
  };
  const add = () => onChange([...rows, { orderableName: '', contrast: '', epicId: '' }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const headerCell = { padding: '0.5rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' };
  return (
    <div style={sectionWrap}>
      {fieldLabel('Epic Orderables / Exam Variants')}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              <th style={headerCell}>Orderable Name</th>
              <th style={{ ...headerCell, width: 140 }}>Contrast</th>
              <th style={{ ...headerCell, width: 180 }}>Epic ID</th>
              <th style={{ ...headerCell, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, i) => (
              <tr key={i}>
                <td style={{ padding: 4 }}><input style={inputStyle} value={r.orderableName} onChange={(e) => update(i, 'orderableName', e.target.value)} /></td>
                <td style={{ padding: 4 }}><input style={inputStyle} value={r.contrast} onChange={(e) => update(i, 'contrast', e.target.value)} /></td>
                <td style={{ padding: 4 }}><input style={inputStyle} value={r.epicId} onChange={(e) => update(i, 'epicId', e.target.value)} /></td>
                <td style={{ padding: 4, verticalAlign: 'top' }}><button type="button" style={dangerBtnStyle} onClick={() => remove(i)} title="Delete row">&#10005;</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" style={btnStyle} onClick={add}>+ Add orderable</button>
      </div>
    </div>
  );
};

const TipSheetsTable = ({ rows, onChange }) => {
  const update = (i, field, v) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: v } : r);
    onChange(next);
  };
  const add = () => onChange([...rows, { title: '', link: '' }]);
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const headerCell = { padding: '0.5rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted, #94a3b8)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' };
  return (
    <div style={sectionWrap}>
      {fieldLabel('Pertinent Tip Sheets')}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr>
              <th style={headerCell}>Title</th>
              <th style={headerCell}>Link (URL)</th>
              <th style={{ ...headerCell, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r, i) => (
              <tr key={i}>
                <td style={{ padding: 4 }}><input style={inputStyle} value={r.title} onChange={(e) => update(i, 'title', e.target.value)} /></td>
                <td style={{ padding: 4 }}><input style={inputStyle} placeholder="https://..." value={r.link} onChange={(e) => update(i, 'link', e.target.value)} /></td>
                <td style={{ padding: 4, verticalAlign: 'top' }}><button type="button" style={dangerBtnStyle} onClick={() => remove(i)} title="Delete tip sheet">&#10005;</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" style={btnStyle} onClick={add}>+ Add tip sheet</button>
      </div>
    </div>
  );
};

const STATUS_PILLS = [
  { key: 'YES', activeBg: 'rgba(34,197,94,0.2)', activeColor: '#86efac', activeBorder: '#22c55e' },
  { key: 'NO', activeBg: 'rgba(239,68,68,0.2)', activeColor: '#fca5a5', activeBorder: '#ef4444' },
  { key: 'OOS', activeBg: 'rgba(255,102,0,0.2)', activeColor: '#fdba74', activeBorder: '#f97316' }
];

const EntityMatrixTable = ({ rows, onChange }) => {
  const [newEntity, setNewEntity] = useState('');

  const update = (i, field, v) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: v } : r);
    onChange(next);
  };
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i));
  const addEntity = () => {
    const code = newEntity.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return;
    if (rows.some(r => r.entity.toUpperCase() === code)) {
      alert(`Entity ${code} already exists in the matrix.`);
      return;
    }
    onChange([...rows, { entity: code, performs: 'YES', notes: '' }]);
    setNewEntity('');
  };
  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEntity();
    }
  };

  const pillStyle = (active, color) => ({
    padding: '0.25rem 0.65rem',
    border: '1px solid',
    borderColor: active ? color.activeBorder : 'rgba(255,255,255,0.15)',
    borderRadius: '0.375rem',
    background: active ? color.activeBg : 'rgba(0,0,0,0.2)',
    color: active ? color.activeColor : 'var(--text-muted, #94a3b8)',
    fontWeight: 700,
    fontSize: '0.72rem',
    cursor: 'pointer'
  });

  return (
    <div style={sectionWrap}>
      {fieldLabel(`Entity Matrix (${rows?.length || 0} entities)`)}
      <div style={{ display: 'grid', gap: 8 }}>
        {(rows || []).map((r, i) => (
          <div key={r.entity || i} style={{ display: 'grid', gridTemplateColumns: '90px 170px 1fr 32px', gap: 8, alignItems: 'center' }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-blue, #60a5fa)', fontSize: '0.85rem' }}>{r.entity}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {STATUS_PILLS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  style={pillStyle(r.performs === p.key, p)}
                  onClick={() => update(i, 'performs', p.key)}
                >
                  {p.key}
                </button>
              ))}
            </div>
            <textarea style={{ ...textareaStyle, minHeight: 36 }} placeholder="Entity-specific notes (leave blank for none)" value={r.notes} onChange={(e) => update(i, 'notes', e.target.value)} />
            <button type="button" style={dangerBtnStyle} onClick={() => remove(i)} title={`Remove ${r.entity} from this card`}>&#10005;</button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '0.75rem', display: 'flex', gap: 6, alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
        <input
          style={{ ...inputStyle, width: 180, textTransform: 'uppercase' }}
          placeholder="New entity code (e.g. THXYZ)"
          value={newEntity}
          onChange={(e) => setNewEntity(e.target.value)}
          onKeyDown={handleKey}
        />
        <button type="button" style={btnStyle} onClick={addEntity}>+ Add entity</button>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>YES / NO / OOS — three-state</span>
      </div>
    </div>
  );
};

const OutOfScopeToggle = ({ value, onChange }) => {
  const isOOS = !!value.outOfScope;
  const wrapStyle = {
    background: isOOS ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${isOOS ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: '0.75rem',
    padding: '1rem 1.25rem',
    marginBottom: '1rem'
  };
  return (
    <div style={wrapStyle}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={isOOS}
          onChange={(e) => onChange({ ...value, outOfScope: e.target.checked })}
          style={{ marginTop: 4, cursor: 'pointer', width: 18, height: 18 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: isOOS ? '#fdba74' : 'var(--text-primary, #f1f5f9)', fontSize: '0.95rem' }}>
            This procedure is OUT OF SCOPE for all entities
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
            Use for procedures like CT biopsies that no entity schedules through the central team.
            When checked, the saved card collapses to a single OUT OF SCOPE banner — all other
            tables (Order Options, Entity Matrix, etc.) are hidden but data is preserved if you
            uncheck later.
          </div>
        </div>
      </label>
      {isOOS && (
        <div style={{ marginTop: '0.75rem' }}>
          {fieldLabel('Reason / instruction shown on the OOS banner')}
          <textarea
            style={{ ...textareaStyle, minHeight: 60 }}
            placeholder="This procedure is Out of Scope for all entities. Transfer the caller to the entity schedulers."
            value={value.outOfScopeReason || ''}
            onChange={(e) => onChange({ ...value, outOfScopeReason: e.target.value })}
          />
        </div>
      )}
    </div>
  );
};

const HeaderFields = ({ value, onChange }) => {
  const update = (patch) => onChange({ ...value, ...patch });
  return (
    <>
      <div style={sectionWrap}>
        {fieldLabel('Procedure Name')}
        <input style={inputStyle} value={value.procedureName || ''} onChange={(e) => update({ procedureName: e.target.value })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={sectionWrap}>
          {fieldLabel('Modality (short)')}
          <input style={inputStyle} placeholder="CT, MRI, etc." value={value.modality || ''} onChange={(e) => update({ modality: e.target.value })} />
        </div>
        <div style={sectionWrap}>
          {fieldLabel('Header Image URL (optional)')}
          <input style={inputStyle} placeholder="/sites/.../my-image.jpg" value={value.headerImage || ''} onChange={(e) => update({ headerImage: e.target.value })} />
        </div>
      </div>

      <div style={sectionWrap}>
        {fieldLabel('Modality / Description blurb')}
        <textarea style={textareaStyle} placeholder="e.g. CCTA utilizes contrast dye to visualize coronary arteries..." value={value.modalityDescription || ''} onChange={(e) => update({ modalityDescription: e.target.value })} />
      </div>
    </>
  );
};

const SCHEditor = ({ value, onChange }) => {
  const update = (patch) => onChange({ ...value, ...patch });
  const isOOS = !!value.outOfScope;
  return (
    <div>
      <OutOfScopeToggle value={value} onChange={onChange} />
      <HeaderFields value={value} onChange={onChange} />
      {!isOOS && (
        <>
          <OrderOptionsTable rows={value.orderOptions || []} onChange={(rows) => update({ orderOptions: rows })} />
          <BulletList label="Shared Entity Notes (apply to all performing entities)" bullets={value.sharedEntityNotes || []} onChange={(b) => update({ sharedEntityNotes: b })} />
          <EntityMatrixTable rows={value.entityMatrix || []} onChange={(rows) => update({ entityMatrix: rows })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <BulletList label="STAT Orders bullets" bullets={value.stat || []} onChange={(b) => update({ stat: b })} />
            <BulletList label="ASAP / Same Day / Next Day (Non-STAT) bullets" bullets={value.asap || []} onChange={(b) => update({ asap: b })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <BulletList label="Special Needs bullets" bullets={value.specialNeeds || []} onChange={(b) => update({ specialNeeds: b })} />
            <BulletList label="COVID STATUS bullets" bullets={value.covid || []} onChange={(b) => update({ covid: b })} />
          </div>
        </>
      )}
    </div>
  );
};

const CREditor = ({ value, onChange }) => {
  const update = (patch) => onChange({ ...value, ...patch });
  const isOOS = !!value.outOfScope;
  return (
    <div>
      <OutOfScopeToggle value={value} onChange={onChange} />
      <HeaderFields value={value} onChange={onChange} />
      {!isOOS && (
        <>
          <div style={sectionWrap}>
            {fieldLabel('Description / Overview')}
            <textarea style={{ ...textareaStyle, minHeight: 80 }} placeholder="A brief description of the exam..." value={value.description || ''} onChange={(e) => update({ description: e.target.value })} />
          </div>
          <EpicOrderablesTable rows={value.epicOrderables || []} onChange={(rows) => update({ epicOrderables: rows })} />
          <TipSheetsTable rows={value.tipSheets || []} onChange={(rows) => update({ tipSheets: rows })} />
          <div style={sectionWrap}>
            {fieldLabel('Standard CR Notes')}
            <textarea style={{ ...textareaStyle, minHeight: 100 }} value={value.standardCRNotes || ''} onChange={(e) => update({ standardCRNotes: e.target.value })} />
          </div>
          <EntityMatrixTable rows={value.entityMatrix || []} onChange={(rows) => update({ entityMatrix: rows })} />
        </>
      )}
    </div>
  );
};

const EditorPanel = ({ value, onChange, kind = 'SCH' }) => {
  if (kind === 'CR') {
    return <CREditor value={value} onChange={onChange} />;
  }
  return <SCHEditor value={value} onChange={onChange} />;
};

export default EditorPanel;
