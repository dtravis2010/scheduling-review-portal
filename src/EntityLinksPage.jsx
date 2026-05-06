// EntityLinksPage — manage the canonical entity list AND each entity's SCH/CR
// reference-page URL. Stored in Firestore collection `entityLinks`, keyed by
// entity code, fields { sch, cr }.
//
// This page is the source of truth for which entities exist. Adding a new
// entity here makes it appear in every procedure's Entity Matrix the next
// time the card is built. Click "Regenerate All Cards" to push the change
// across all existing 452 docs at once. New entities default to performs=YES.
//
// cardBuilder reads the entityLinks map and:
//   • Sorts the matrix alphabetically by entity code.
//   • Auto-adds any entity present in entityLinks but missing from the card's
//     stored matrix (defaults to YES, no notes).
//   • Drops any entity in the stored matrix that is no longer in entityLinks.
//   • Wraps each entity abbreviation in <a href="..."> when a URL exists for
//     the card kind (SCH/CR).

import React, { useState, useMemo, useEffect } from 'react';
import { doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { parseCard, parseCRCard, DEFAULT_ENTITIES } from './cardParser';
import { buildCardHTML, buildCRCardHTML } from './cardBuilder';

const ENTITY_CODE_RE = /^[A-Z][A-Z0-9]{1,9}$/;

export default function EntityLinksPage({ entityLinks }) {
  // Canonical list = sorted keys of entityLinks. If the collection is empty
  // (e.g., brand-new install), seed the visual list from DEFAULT_ENTITIES so
  // the user has something to start from. Once a row is saved the actual
  // doc gets created.
  const seededEntities = useMemo(() => {
    const fromLinks = Object.keys(entityLinks || {});
    const list = fromLinks.length > 0 ? fromLinks : [...DEFAULT_ENTITIES];
    return [...new Set(list)].sort();
  }, [entityLinks]);

  const [draft, setDraft] = useState(() => {
    const seed = {};
    for (const e of seededEntities) {
      seed[e] = { sch: entityLinks?.[e]?.sch || '', cr: entityLinks?.[e]?.cr || '' };
    }
    return seed;
  });

  // Keep draft in sync when entityLinks changes (e.g., add/delete from elsewhere)
  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const e of seededEntities) {
        if (!next[e]) {
          next[e] = { sch: entityLinks?.[e]?.sch || '', cr: entityLinks?.[e]?.cr || '' };
        }
      }
      // Drop draft rows whose entity no longer exists in canonical list
      for (const e of Object.keys(next)) {
        if (!seededEntities.includes(e)) delete next[e];
      }
      return next;
    });
  }, [seededEntities, entityLinks]);

  const [savingRow, setSavingRow] = useState(null);
  const [savedRow, setSavedRow] = useState(null);
  const [regenStatus, setRegenStatus] = useState('');
  const [regenInProgress, setRegenInProgress] = useState(false);
  const [newEntityCode, setNewEntityCode] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const dirty = useMemo(() => {
    const d = {};
    for (const e of seededEntities) {
      const cur = entityLinks?.[e] || {};
      const drf = draft[e] || {};
      d[e] = (cur.sch || '') !== (drf.sch || '') || (cur.cr || '') !== (drf.cr || '');
    }
    return d;
  }, [entityLinks, draft, seededEntities]);

  const updateField = (entity, side, value) => {
    setDraft((prev) => ({ ...prev, [entity]: { ...prev[entity], [side]: value } }));
  };

  const saveRow = async (entity) => {
    setSavingRow(entity);
    try {
      const payload = { sch: (draft[entity]?.sch || '').trim(), cr: (draft[entity]?.cr || '').trim() };
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
    for (const e of seededEntities) {
      if (dirty[e]) await saveRow(e);
    }
  };

  // Add a brand-new entity to the canonical list. Validates code, checks
  // uniqueness, then creates an entityLinks doc with empty URLs.
  const addEntity = async () => {
    const raw = newEntityCode.trim().toUpperCase();
    setAddError('');
    if (!raw) { setAddError('Enter an entity code'); return; }
    if (!ENTITY_CODE_RE.test(raw)) {
      setAddError('Code must be ALL CAPS letters/digits, 2–10 chars, starting with a letter');
      return;
    }
    if (seededEntities.includes(raw)) {
      setAddError(`${raw} already exists`);
      return;
    }
    setAdding(true);
    try {
      await setDoc(doc(db, 'entityLinks', raw), { sch: '', cr: '' });
      setNewEntityCode('');
    } catch (e) {
      console.error('Add failed:', e);
      setAddError(e.message || 'Add failed');
    }
    setAdding(false);
  };

  // Delete an entity from the canonical list. Does NOT modify existing card
  // matrices in Firestore — those still have rows for the deleted entity until
  // the next Regenerate All Cards (which rebuilds matrices from the current
  // canonical list, dropping orphan rows).
  const deleteEntity = async (entity) => {
    const ok = confirm(
      `Remove ${entity} from the entity list?\n\n` +
      `This deletes the URL config and removes ${entity} from the canonical list. ` +
      `Existing procedure cards will keep their ${entity} matrix row until you click ` +
      `"Regenerate All Cards" — that rebuild will drop the orphan rows.`
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'entityLinks', entity));
    } catch (e) {
      console.error('Delete failed:', e);
      alert(`Could not delete ${entity}: ${e.message || 'unknown error'}`);
    }
  };

  // Bulk regenerate every SCH+CR procedure card so:
  //   1. Newly-added entities appear with default YES on every matrix.
  //   2. Removed entities are dropped from every matrix.
  //   3. URL changes propagate to entity-cell anchors.
  //   4. Matrices end up sorted alphabetically.
  // Skips procedure-level OOS docs (their matrix doesn't render anyway).
  const regenerateAllCards = async () => {
    if (!confirm('Rebuild HTML for ALL ~452 procedure docs using current entity list and URLs? This may take ~30–60 seconds.')) return;
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

  // ─── styles ────────────────────────────────────────────────────────────
  const containerStyle = {
    padding: '24px 36px',
    color: 'var(--text-primary, #f1f5f9)',
    fontFamily: 'Segoe UI, Arial, sans-serif',
  };
  const headerStyle = { fontSize: '20px', fontWeight: 800, color: 'var(--text-primary, #f1f5f9)', marginBottom: '6px' };
  const subStyle = { fontSize: '13px', color: 'var(--text-muted, #94a3b8)', marginBottom: '20px', maxWidth: '720px', lineHeight: 1.5 };
  const tableStyle = {
    width: '100%', maxWidth: '1100px', borderCollapse: 'collapse',
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
  const btnStyle = (color, disabled = false) => ({
    padding: '5px 12px', fontSize: '12px', fontWeight: 600, border: 'none',
    borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(255,255,255,0.08)' : color, color: '#fff',
  });

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Entity Reference Links</div>
      <div style={subStyle}>
        Manage the canonical entity list. Each entity has two URLs: a Scheduling reference page (rendered as a hyperlink on the entity abbreviation in SCH cards) and a Clinical Review reference page (used on CR cards). Adding a new entity here makes it appear in every procedure's Entity Matrix on next build, sorted alphabetically and defaulting to <strong>performs=YES</strong>. After adding URLs or new entities, click <strong>Regenerate All Cards</strong> to push changes into the ~452 existing procedure docs.
      </div>

      {/* Add Entity form */}
      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px',
        padding: '12px', background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', maxWidth: '640px',
      }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '1px' }}>Add entity</span>
        <input
          type="text"
          placeholder="ENTITY CODE (e.g. THXX)"
          value={newEntityCode}
          onChange={(e) => setNewEntityCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') addEntity(); }}
          style={{ ...inputStyle, width: '220px', textTransform: 'uppercase' }}
        />
        <button
          onClick={addEntity}
          disabled={adding || !newEntityCode.trim()}
          style={btnStyle('#009543', adding || !newEntityCode.trim())}
        >
          {adding ? 'Adding…' : '+ Add'}
        </button>
        {addError && <span style={{ color: '#fca5a5', fontSize: '12px' }}>{addError}</span>}
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '90px' }}>Entity</th>
            <th style={thStyle}>SCH page URL</th>
            <th style={thStyle}>CR page URL</th>
            <th style={{ ...thStyle, width: '160px' }}></th>
          </tr>
        </thead>
        <tbody>
          {seededEntities.map((e) => (
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
              <td style={{ ...tdStyle, display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => saveRow(e)}
                  disabled={!dirty[e] || savingRow === e}
                  style={btnStyle(dirty[e] ? '#0077c8' : 'rgba(255,255,255,0.08)', !dirty[e] || savingRow === e)}
                >
                  {savedRow === e ? 'Saved ✓' : savingRow === e ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => deleteEntity(e)}
                  style={btnStyle('rgba(220,38,38,0.7)', false)}
                  title={`Remove ${e} from the entity list`}
                >
                  Delete
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
          style={btnStyle('#009543', !Object.values(dirty).some(Boolean))}
        >
          Save All Dirty Rows
        </button>
        <button
          onClick={regenerateAllCards}
          disabled={regenInProgress}
          style={{ ...btnStyle('#e65100', regenInProgress), cursor: regenInProgress ? 'wait' : 'pointer' }}
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
