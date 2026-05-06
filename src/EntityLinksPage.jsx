// EntityLinksPage — manage the SCH and CR reference-page URL for each of the
// 20 hospital entities. URLs are stored in Firestore collection `entityLinks`,
// keyed by entity code, with fields { sch, cr }. cardBuilder reads this map
// (passed in from App.jsx) to wrap each entity abbreviation in the matrix in
// a clickable hyperlink. SCH cards link to the SCH page; CR cards link to CR.
//
// "Regenerate All Cards" button lives at the bottom — when URLs change, click
// it to bulk-rebuild every SCH+CR doc in Firestore so the hyperlinks go live
// across all 452 docs at once. Without that, links only appear on docs that
// get re-saved through the editor.

import React, { useState, useMemo } from 'react';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { parseCard, parseCRCard, DEFAULT_ENTITIES } from './cardParser';
import { buildCardHTML, buildCRCardHTML } from './cardBuilder';

export default function EntityLinksPage({ entityLinks }) {
  // Local edit state — copy from props so user edits don't fire a write per keystroke
  const [draft, setDraft] = useState(() => {
    const seed = {};
    for (const e of DEFAULT_ENTITIES) {
      seed[e] = { sch: entityLinks?.[e]?.sch || '', cr: entityLinks?.[e]?.cr || '' };
    }
    return seed;
  });
  const [savingRow, setSavingRow] = useState(null);
  const [savedRow, setSavedRow] = useState(null);
  const [regenStatus, setRegenStatus] = useState('');
  const [regenInProgress, setRegenInProgress] = useState(false);

  const dirty = useMemo(() => {
    const d = {};
    for (const e of DEFAULT_ENTITIES) {
      const cur = entityLinks?.[e] || {};
      const drf = draft[e] || {};
      d[e] = (cur.sch || '') !== (drf.sch || '') || (cur.cr || '') !== (drf.cr || '');
    }
    return d;
  }, [entityLinks, draft]);

  const updateField = (entity, side, value) => {
    setDraft((prev) => ({ ...prev, [entity]: { ...prev[entity], [side]: value } }));
  };

  const saveRow = async (entity) => {
    setSavingRow(entity);
    try {
      const payload = { sch: draft[entity].sch.trim(), cr: draft[entity].cr.trim() };
      await setDoc(doc(db, 'entityLinks', entity), payload, { merge: true });
      setSavedRow(entity);
      setTimeout(() => setSavedRow(null), 2000);
    } catch (e) {
      console.error('Save failed:', e);
      alert(`Could not save ${entity}: ${e.message || 'unknown error'}`);
    }
    setSavingRow(null);
  };

  const saveAllDirty = async () => {
    for (const e of DEFAULT_ENTITIES) {
      if (dirty[e]) await saveRow(e);
    }
  };

  // Bulk regenerate every SCH+CR procedure card so newly-saved entity URLs
  // propagate to existing docs. Pulls all docs, parses each, rebuilds with the
  // current entityLinks map, writes back. Skips procedure-level OOS docs since
  // their matrix doesn't render anyway.
  const regenerateAllCards = async () => {
    if (!confirm('Rebuild HTML for ALL ~452 procedure docs using current entity links? This may take ~30–60 seconds. Existing card content is preserved — only the entity matrix HTML changes.')) return;
    setRegenInProgress(true);
    setRegenStatus('Loading all procedures...');
    try {
      const snap = await getDocs(collection(db, 'procedures'));
      let updated = 0, skipped = 0;
      const all = [];
      snap.forEach((d) => all.push({ id: d.id, data: d.data() }));
      for (let i = 0; i < all.length; i++) {
        const { id, data } = all[i];
        const isSCH = id.endsWith('_SCH');
        const fieldName = isSCH ? 'Scheduling_x0020_Instructions' : 'Clinical_x0020_Review_x0020_Notes';
        const html = data[fieldName] || '';
        if (!html) { skipped++; continue; }
        const parsed = isSCH ? parseCard(html) : parseCRCard(html);
        if (parsed.outOfScope) { skipped++; continue; }
        const newHTML = isSCH ? buildCardHTML(parsed, entityLinks) : buildCRCardHTML(parsed, entityLinks);
        if (newHTML === html) { skipped++; continue; }
        await setDoc(doc(db, 'procedures', id), { [fieldName]: newHTML }, { merge: true });
        updated++;
        if (i % 25 === 0) setRegenStatus(`Updating... ${i + 1}/${all.length} processed, ${updated} written`);
      }
      setRegenStatus(`Done. ${updated} updated, ${skipped} skipped (OOS or empty).`);
    } catch (e) {
      console.error('Regenerate failed:', e);
      setRegenStatus(`Error: ${e.message || 'unknown'}`);
    }
    setRegenInProgress(false);
  };

  const containerStyle = {
    padding: '24px 36px',
    color: 'var(--text-primary, #f1f5f9)',
    fontFamily: 'Segoe UI, Arial, sans-serif',
  };
  const headerStyle = {
    fontSize: '20px',
    fontWeight: 800,
    color: 'var(--text-primary, #f1f5f9)',
    marginBottom: '6px',
  };
  const subStyle = {
    fontSize: '13px',
    color: 'var(--text-muted, #94a3b8)',
    marginBottom: '20px',
    maxWidth: '720px',
    lineHeight: 1.5,
  };
  const tableStyle = {
    width: '100%',
    maxWidth: '1100px',
    borderCollapse: 'collapse',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    overflow: 'hidden',
  };
  const thStyle = {
    textAlign: 'left',
    padding: '10px 14px',
    background: 'rgba(0,51,102,0.4)',
    color: '#cbd5e1',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  };
  const tdStyle = {
    padding: '8px 14px',
    fontSize: '13px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    color: 'var(--text-primary, #f1f5f9)',
  };
  const inputStyle = {
    width: '100%',
    padding: '6px 10px',
    fontSize: '12px',
    background: 'rgba(0,0,0,0.25)',
    color: '#f1f5f9',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '4px',
    fontFamily: 'Consolas, monospace',
  };
  const btnStyle = (color) => ({
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    background: color,
    color: '#fff',
  });

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Entity Reference Links</div>
      <div style={subStyle}>
        Each entity gets two URLs: one for the Scheduling reference page (rendered as a hyperlink on the entity abbreviation in SCH cards) and one for the Clinical Review reference page (used on CR cards). Leave blank to render plain text. After saving URLs, click <strong>Regenerate All Cards</strong> at the bottom to push the links into the ~452 existing procedure docs.
      </div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '90px' }}>Entity</th>
            <th style={thStyle}>SCH page URL</th>
            <th style={thStyle}>CR page URL</th>
            <th style={{ ...thStyle, width: '110px' }}></th>
          </tr>
        </thead>
        <tbody>
          {DEFAULT_ENTITIES.map((e) => (
            <tr key={e}>
              <td style={{ ...tdStyle, fontWeight: 700, color: '#9bb8d9' }}>{e}</td>
              <td style={tdStyle}>
                <input
                  type="text"
                  style={inputStyle}
                  placeholder="https://…"
                  value={draft[e]?.sch || ''}
                  onChange={(ev) => updateField(e, 'sch', ev.target.value)}
                />
              </td>
              <td style={tdStyle}>
                <input
                  type="text"
                  style={inputStyle}
                  placeholder="https://…"
                  value={draft[e]?.cr || ''}
                  onChange={(ev) => updateField(e, 'cr', ev.target.value)}
                />
              </td>
              <td style={tdStyle}>
                <button
                  onClick={() => saveRow(e)}
                  disabled={!dirty[e] || savingRow === e}
                  style={{
                    ...btnStyle(dirty[e] ? '#0077c8' : 'rgba(255,255,255,0.08)'),
                    cursor: dirty[e] ? 'pointer' : 'not-allowed',
                  }}
                >
                  {savedRow === e ? 'Saved ✓' : savingRow === e ? 'Saving…' : 'Save'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={saveAllDirty}
          disabled={!Object.values(dirty).some(Boolean)}
          style={{
            ...btnStyle('#009543'),
            cursor: Object.values(dirty).some(Boolean) ? 'pointer' : 'not-allowed',
          }}
        >
          Save All Dirty Rows
        </button>
        <button
          onClick={regenerateAllCards}
          disabled={regenInProgress}
          style={{ ...btnStyle('#e65100'), cursor: regenInProgress ? 'wait' : 'pointer' }}
        >
          {regenInProgress ? 'Regenerating…' : 'Regenerate All Cards'}
        </button>
        {regenStatus && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted, #94a3b8)' }}>{regenStatus}</span>
        )}
      </div>
    </div>
  );
}
