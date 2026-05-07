// OutOfScopePage — manage the consolidated Out-of-Scope procedure list.
// Stored in Firestore collection `oosProcedures`, one doc per OOS procedure
// keyed by name (with `/` replaced by `-` like the procedures collection),
// fields { name, modalityId }.
//
// On export, every doc in this collection is folded into a single SharePoint
// row keyed `OUT_OF_SCOPE_PROCEDURES_SCH` (Entity0Id 24, ModalityId 1) whose
// Scheduling_x0020_Instructions HTML is a card grouping the procedures by
// modality. Replaces the old pattern of one OOS-flagged card per procedure.

import React, { useMemo, useState } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { buildOOSCardHTML } from './cardBuilder';

// OOS-page-only modality labels. ID 1 is relabeled "CT" (no /NM) since NM
// gets its own bucket here. IDs 7 (NM) and 8 (IR) are new and exist only in
// the oosProcedures collection — the global App.jsx MODALITY_MAP is unchanged.
const MODALITY_MAP = {
  1: 'CT',
  2: 'MRI',
  3: 'GI & Fluoro',
  4: 'Vascular Ultrasound',
  5: 'General Ultrasound',
  6: "Women's Services",
  7: 'NM',
  8: 'IR',
};

const docKey = (name) => name.trim().replace(/\//g, '-');

export default function OutOfScopePage({ oosProcedures }) {
  const [newName, setNewName] = useState('');
  const [newModality, setNewModality] = useState(1);
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [savedKey, setSavedKey] = useState(null); // doc key that just saved — flashes "Saved ✓"

  // Single alphabetized list — modality is just metadata shown as a column.
  const sorted = useMemo(() => {
    return Object.values(oosProcedures || {})
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [oosProcedures]);

  const totalCount = useMemo(() => Object.values(oosProcedures || {}).length, [oosProcedures]);

  const addProcedure = async () => {
    const name = newName.trim().toUpperCase();
    setAddError('');
    if (!name) { setAddError('Enter a procedure name'); return; }
    if (name.endsWith('_SCH') || name.endsWith('_CR')) {
      setAddError('Use the base name only — no _SCH/_CR suffix');
      return;
    }
    const key = docKey(name);
    if (oosProcedures?.[key]) {
      setAddError(`${name} is already on the OOS list`);
      return;
    }
    setAdding(true);
    try {
      await setDoc(doc(db, 'oosProcedures', key), {
        name,
        modalityId: Number(newModality) || 1,
      });
      setNewName('');
    } catch (e) {
      console.error('Add OOS procedure failed:', e);
      setAddError(e.message || 'Add failed');
    }
    setAdding(false);
  };

  // Inline-edit a procedure's modality. Writes to Firestore on change; the
  // onSnapshot subscription in App.jsx will refresh the parent prop.
  const updateModality = async (key, newModalityId) => {
    try {
      await setDoc(
        doc(db, 'oosProcedures', key),
        { modalityId: Number(newModalityId) || 1 },
        { merge: true }
      );
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
    } catch (e) {
      console.error('Update OOS modality failed:', e);
      alert(`Could not update modality: ${e.message || 'unknown error'}`);
    }
  };

  const removeProcedure = async (key, name) => {
    if (!confirm(`Remove ${name} from the OOS list?\n\nThis only edits the consolidated list. Run “Export Power Automate JSON” on this tab and upload the result to push the change to SharePoint.`)) return;
    try {
      await deleteDoc(doc(db, 'oosProcedures', key));
    } catch (e) {
      console.error('Delete OOS procedure failed:', e);
      alert(`Could not delete ${name}: ${e.message || 'unknown error'}`);
    }
  };

  // Generate the consolidated SharePoint row JSON. Emits TWO items so both
  // the Scheduling and Clinical Review tabs of the SharePoint reference site
  // show the OOS landing page:
  //   - OUT_OF_SCOPE_PROCEDURES_SCH  (visible on the Scheduling tab)
  //   - OUT_OF_SCOPE_PROCEDURES_CR   (visible on the Clinical Review tab)
  // Both rows carry the SAME consolidated HTML in Scheduling_x0020_Instructions
  // (per the project convention — the _CR / _SCH suffix on Procedure is the
  // discriminator, and Clinical_x0020_Review_x0020_Notes is always empty).
  const exportConsolidatedJSON = () => {
    const list = Object.values(oosProcedures || {})
      .map((p) => ({ name: p.name, modalityId: p.modalityId || 1 }));
    if (list.length === 0) {
      alert('No OOS procedures to export.');
      return;
    }
    const html = buildOOSCardHTML(list);
    const baseItem = {
      Entity0Id: 24,
      ModalityId: 1,
      Scheduling_x0020_Instructions: html,
      Clinical_x0020_Review_x0020_Notes: '',
    };
    const items = [
      { ...baseItem, Procedure: 'OUT_OF_SCOPE_PROCEDURES_SCH' },
      { ...baseItem, Procedure: 'OUT_OF_SCOPE_PROCEDURES_CR' },
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `Update_OOS_Consolidated_${stamp}.json`;
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ─── styles (mirrors EntityLinksPage) ─────────────────────────────────
  const containerStyle = {
    padding: '24px 36px',
    color: 'var(--text-primary, #f1f5f9)',
    fontFamily: 'Segoe UI, Arial, sans-serif',
  };
  const headerStyle = { fontSize: '20px', fontWeight: 800, color: 'var(--text-primary, #f1f5f9)', marginBottom: '6px' };
  const subStyle = { fontSize: '13px', color: 'var(--text-muted, #94a3b8)', marginBottom: '20px', maxWidth: '720px', lineHeight: 1.5 };
  const tableStyle = {
    width: '100%', maxWidth: '900px', borderCollapse: 'collapse',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', overflow: 'hidden',
  };
  const thStyle = {
    textAlign: 'left', padding: '10px 14px', background: 'rgba(0,51,102,0.4)',
    color: '#cbd5e1', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  };
  const tdStyle = { padding: '8px 14px', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary, #f1f5f9)' };
  const inputStyle = {
    width: '100%', padding: '6px 10px', fontSize: '12px',
    background: 'rgba(0,0,0,0.25)', color: '#f1f5f9',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px',
    fontFamily: 'Consolas, monospace',
  };
  const selectStyle = {
    padding: '6px 10px', fontSize: '12px',
    background: 'rgba(0,0,0,0.25)', color: '#f1f5f9',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px',
  };
  const btnStyle = (color, disabled = false) => ({
    padding: '5px 12px', fontSize: '12px', fontWeight: 600, border: 'none',
    borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(255,255,255,0.08)' : color, color: '#fff',
  });
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Out of Scope Procedures</div>
      <div style={subStyle}>
        Consolidated list of procedures that THR central scheduling does not handle for any entity. Replaces the old pattern of one OOS-flagged card per procedure. On export, every entry on this list is folded into a single SharePoint row (<strong>OUT_OF_SCOPE_PROCEDURES_SCH</strong>, ModalityId 1) whose card renders a single alphabetical table with Procedure + Modality columns. Default action shown to schedulers is <em>Transfer to entities</em>. Currently {totalCount} {totalCount === 1 ? 'procedure' : 'procedures'} on the list.
      </div>

      {/* Add row */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px',
        padding: '12px', background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', maxWidth: '720px',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '1px' }}>Add procedure</span>
        <input
          type="text"
          placeholder="PROCEDURE NAME (no _SCH/_CR)"
          value={newName}
          onChange={(e) => setNewName(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') addProcedure(); }}
          style={{ ...inputStyle, width: '320px', textTransform: 'uppercase' }}
        />
        <select
          value={newModality}
          onChange={(e) => setNewModality(e.target.value)}
          style={selectStyle}
        >
          {Object.entries(MODALITY_MAP).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <button
          onClick={addProcedure}
          disabled={adding || !newName.trim()}
          style={btnStyle('#009543', adding || !newName.trim())}
        >
          {adding ? 'Adding…' : '+ Add'}
        </button>
        {addError && <span style={{ color: '#fca5a5', fontSize: '12px' }}>{addError}</span>}
      </div>

      {/* Export button */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={exportConsolidatedJSON}
          disabled={totalCount === 0}
          style={btnStyle('#0077c8', totalCount === 0)}
        >
          ↓ Export Power Automate JSON (single consolidated row)
        </button>
      </div>

      {/* Single alphabetized table */}
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Procedure</th>
            <th style={{ ...thStyle, width: '180px' }}>Modality</th>
            <th style={{ ...thStyle, width: '120px' }}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const key = docKey(p.name);
            return (
              <tr key={key}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                <td style={tdStyle}>
                  <select
                    value={p.modalityId || 1}
                    onChange={(e) => updateModality(key, e.target.value)}
                    style={{ ...selectStyle, minWidth: '160px' }}
                    title="Change modality (saves on change)"
                  >
                    {Object.entries(MODALITY_MAP).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                  {savedKey === key && (
                    <span style={{ marginLeft: '8px', color: '#86efac', fontSize: '12px' }}>Saved ✓</span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button
                    onClick={() => removeProcedure(key, p.name)}
                    style={btnStyle('rgba(220,38,38,0.7)', false)}
                    title={`Remove ${p.name} from OOS list`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
          {totalCount === 0 && (
            <tr>
              <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                No OOS procedures yet. Add one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
