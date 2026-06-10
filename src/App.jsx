import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { parseCard, parseCRCard, DEFAULT_ENTITIES } from './cardParser';
import { buildCardHTML, buildCRCardHTML, stripOOSPreserved } from './cardBuilder';
import EditorPanel from './EditorPanel';
import EntityLinksPage from './EntityLinksPage';
import OutOfScopePage from './OutOfScopePage';
import HistoryPage from './HistoryPage';
import { auditedSet, auditedDelete, logEvent, logBulk } from './audit';
import {
  STANDARD_STAT_BULLETS,
  STANDARD_ASAP_BULLETS,
  STANDARD_SPECIAL_NEEDS_BULLETS,
  STANDARD_COVID_BULLETS
} from './standardCallouts';

// Site reads ONLY from Firestore — legacy bundled JSON loading was removed so old layouts
// can't leak into the UI. Use "+ Upload JSON Batch" to seed Firestore.

const MODALITY_MAP = {
  1: 'CT / NM',
  2: 'MRI',
  3: 'GI & Fluoro',
  4: 'Vascular Ultrasound',
  5: 'General Ultrasound'
};

// Modal: create a brand-new procedure (SCH and/or CR Firestore docs).
const NewProcedureModal = ({ isOpen, onClose, onCreate, existingProcedures }) => {
  const [name, setName] = useState('');
  const [modalityId, setModalityId] = useState(1);
  const [makeSCH, setMakeSCH] = useState(true);
  const [makeCR, setMakeCR] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setName('');
      setModalityId(1);
      setMakeSCH(true);
      setMakeCR(true);
      setError('');
      setBusy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError('');
    const trimmed = name.trim().toUpperCase();
    if (!trimmed) {
      setError('Procedure name is required.');
      return;
    }
    if (!makeSCH && !makeCR) {
      setError('Pick at least one of Scheduling or Clinical Review.');
      return;
    }
    // Uniqueness check
    const existsSCH = existingProcedures.some(p => p.Procedure === `${trimmed}_SCH`);
    const existsCR = existingProcedures.some(p => p.Procedure === `${trimmed}_CR`);
    if (makeSCH && existsSCH) {
      setError(`A scheduling card named "${trimmed}_SCH" already exists.`);
      return;
    }
    if (makeCR && existsCR) {
      setError(`A clinical review card named "${trimmed}_CR" already exists.`);
      return;
    }

    setBusy(true);
    try {
      await onCreate({ baseName: trimmed, modalityId, makeSCH, makeCR });
      onClose();
    } catch (e) {
      setError(e.message || 'Create failed.');
    } finally {
      setBusy(false);
    }
  };

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
  };
  const modalStyle = {
    background: 'var(--card-bg, #0f172a)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '0.75rem', padding: '1.5rem',
    width: 'min(520px, 90vw)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
  };
  const labelStyle = { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#60a5fa', fontWeight: 700, marginBottom: 6, display: 'block' };
  const inputStyle = {
    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.375rem', padding: '0.5rem 0.75rem', color: 'var(--text-primary, #f1f5f9)',
    fontSize: '0.9rem', fontFamily: 'inherit'
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <h2 style={{ margin: 0, marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--text-primary, #f1f5f9)' }}>+ New Procedure</h2>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Procedure Name</label>
          <input
            style={inputStyle}
            placeholder="e.g. CT HEAD"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', marginTop: 4 }}>
            Use ALL CAPS. The system appends _SCH and _CR automatically.
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Modality</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={modalityId}
            onChange={(e) => setModalityId(Number(e.target.value))}
          >
            <option value={1}>CT / NM</option>
            <option value={2}>MRI</option>
            <option value={3}>GI & Fluoro</option>
            <option value={4}>Vascular Ultrasound</option>
            <option value={5}>General Ultrasound</option>
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Create</label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary, #f1f5f9)' }}>
              <input type="checkbox" checked={makeSCH} onChange={(e) => setMakeSCH(e.target.checked)} />
              Scheduling card
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary, #f1f5f9)' }}>
              <input type="checkbox" checked={makeCR} onChange={(e) => setMakeCR(e.target.checked)} />
              Clinical Review card
            </label>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', color: '#fca5a5', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Creating…' : 'Create Procedure'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Map ModalityId → display name (used for new-card defaults)
const MODALITY_SHORT = {
  1: 'CT',
  2: 'MRI',
  3: 'GI / Fluoro',
  4: 'Vascular Ultrasound',
  5: 'Ultrasound'
};

// Memoized HTML content to prevent re-renders when typing in comments
const HtmlContent = React.memo(({ html }) => {
  if (!html) {
    return (
      <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '1rem' }}>No content available for this view.</div>
    );
  }
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

// Component for an individual Procedure item
const ProcedureCard = React.memo(({ group, page, reviewData, onUpdateReview, onSaveProcedureContent, onDeleteProcedure, onViewHistory, entityLinks, tipSheetsBank }) => {
  const [comment, setComment] = useState('');
  const [savedStatus, setSavedStatus] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editorState, setEditorState] = useState(null);
  const [editorSaved, setEditorSaved] = useState(false);
  const [editorError, setEditorError] = useState('');

  const item = page === 'SCH' ? group.schItem : group.crItem;
  const dbKey = `${group.baseName}_${page}`.replace(/\//g, '-');
  const isFinished = reviewData?.isFinished || false;
  const canEdit = !!item; // Both SCH and CR are editable now

  // Sync the local text box with the Firebase database
  useEffect(() => {
    // `?? ''` guards the controlled textarea against a null comment (e.g. a
    // History restore of a record captured before the field existed).
    if (reviewData?.comment !== undefined && (reviewData?.comment ?? '') !== comment) {
      setComment(reviewData.comment ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData?.comment]);

  // Audit label keeps the raw (slash-containing) name so the per-card History
  // filter matches both review and content records for the same procedure.
  const auditLabel = `${group.baseName}_${page}`;

  const handleSave = () => {
    onUpdateReview(dbKey, { comment, isFinished }, auditLabel);
    setSavedStatus(true);
    setTimeout(() => setSavedStatus(false), 2000);
  };

  const handleToggleFinished = () => {
    onUpdateReview(dbKey, { comment, isFinished: !isFinished }, auditLabel);
  };

  // Pick the right HTML field based on which page we're on
  const contentHTML = page === 'SCH'
    ? item?.Scheduling_x0020_Instructions
    : item?.Clinical_x0020_Review_x0020_Notes;

  const enterEditMode = () => {
    try {
      const parsed = page === 'SCH' ? parseCard(contentHTML || '') : parseCRCard(contentHTML || '');
      // Pre-fill procedure name from baseName if parser missed it
      if (!parsed.procedureName) parsed.procedureName = group.baseName;
      setEditorState(parsed);
      setEditorError('');
      setEditMode(true);
    } catch (e) {
      console.error('Parser error:', e);
      setEditorError('Could not parse this card into structured fields. Try again or report.');
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditorState(null);
    setEditorError('');
  };

  const saveEdit = async () => {
    if (!editorState) return false;
    try {
      const newHTML = page === 'SCH' ? buildCardHTML(editorState, entityLinks) : buildCRCardHTML(editorState, entityLinks);
      const fieldName = page === 'SCH' ? 'Scheduling_x0020_Instructions' : 'Clinical_x0020_Review_x0020_Notes';
      await onSaveProcedureContent(item.Procedure, fieldName, newHTML);

      // Auto-couple OOS state to the sibling card. When OOS is checked on either
      // SCH or CR, the other side should also display as OOS so the procedure
      // shows the same status across both pages. We only propagate
      // outOfScope=true (we never auto-uncheck the sibling) to avoid silently
      // wiping the sibling's content.
      if (editorState.outOfScope) {
        const siblingPage = page === 'SCH' ? 'CR' : 'SCH';
        const siblingItem = page === 'SCH' ? group.crItem : group.schItem;
        if (siblingItem) {
          const siblingHTML = siblingPage === 'SCH'
            ? (siblingItem.Scheduling_x0020_Instructions || '')
            : (siblingItem.Clinical_x0020_Review_x0020_Notes || '');
          const siblingParsed = siblingPage === 'SCH'
            ? parseCard(siblingHTML)
            : parseCRCard(siblingHTML);
          const siblingData = {
            ...siblingParsed,
            procedureName: siblingParsed.procedureName || group.baseName,
            outOfScope: true,
            outOfScopeReason: editorState.outOfScopeReason || ''
          };
          const siblingNewHTML = siblingPage === 'SCH'
            ? buildCardHTML(siblingData, entityLinks)
            : buildCRCardHTML(siblingData, entityLinks);
          const siblingField = siblingPage === 'SCH'
            ? 'Scheduling_x0020_Instructions'
            : 'Clinical_x0020_Review_x0020_Notes';
          await onSaveProcedureContent(siblingItem.Procedure, siblingField, siblingNewHTML);
        }

        // Auto-finish review state when OOS is set. OOS procs need no review
        // attention so we mark BOTH SCH and CR review docs as finished.
        // updateReviewInDB writes with { merge: true }, so passing only
        // { isFinished: true } leaves existing comments intact. Like the
        // OOS-to-sibling propagation above, we never auto-unfinish —
        // unchecking OOS leaves isFinished alone.
        const baseId = group.baseName.replace(/\//g, '-');
        await onUpdateReview(`${baseId}_SCH`, { isFinished: true }, `${group.baseName}_SCH`);
        await onUpdateReview(`${baseId}_CR`,  { isFinished: true }, `${group.baseName}_CR`);
        // isFinished is derived from reviewData (see top of component); the
        // onUpdateReview writes above propagate back via onSnapshot, so the
        // finished state updates on its own — no local setter needed.
      }

      setEditorSaved(true);
      setTimeout(() => setEditorSaved(false), 2500);
      // Stay in edit mode so user can keep tweaking
      return true;
    } catch (e) {
      console.error(e);
      setEditorError('Save failed: ' + (e.message || 'unknown error'));
      return false;
    }
  };

  const saveAndClose = async () => {
    const ok = await saveEdit();
    if (ok) {
      setEditMode(false);
      setEditorState(null);
      setEditorError('');
    }
  };

  const handleDeleteProcedure = async () => {
    const both = !!(group.schItem && group.crItem);
    const msg = both
      ? `Delete the entire "${group.baseName}" procedure?\n\nThis removes BOTH the Scheduling and Clinical Review entries from the database. Cannot be undone.`
      : `Delete "${group.baseName}_${page}" from the database?\n\nCannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await onDeleteProcedure(group.baseName, both);
    } catch (e) {
      console.error(e);
      alert('Delete failed: ' + (e.message || 'unknown error'));
    }
  };

  return (
    <div className={`procedure-card ${isFinished ? 'finished' : ''}`}>
      <div className="procedure-header">
        <h2 className="procedure-title">{group.baseName}</h2>
        <div className="procedure-tags">
          <span className="tag">Entity {group.Entity0Id}</span>
          <span className="tag">{MODALITY_MAP[group.ModalityId] || `Modality ${group.ModalityId}`}</span>
          {canEdit && (
            <button
              type="button"
              className="btn"
              onClick={editMode ? cancelEdit : enterEditMode}
              style={{
                padding: '0.25rem 0.75rem',
                background: editMode ? 'rgba(248,113,113,0.18)' : 'rgba(96,165,250,0.18)',
                border: `1px solid ${editMode ? 'rgba(248,113,113,0.4)' : 'rgba(96,165,250,0.4)'}`,
                color: editMode ? '#fca5a5' : '#93c5fd',
                fontSize: '0.8rem',
                fontWeight: 600,
                borderRadius: '999px',
                cursor: 'pointer'
              }}
            >
              {editMode ? '✕ Cancel' : '✏ Edit'}
            </button>
          )}
          {!editMode && (
            <button
              type="button"
              className="btn"
              onClick={handleDeleteProcedure}
              title={`Delete this procedure from the database`}
              style={{
                padding: '0.25rem 0.75rem',
                background: 'rgba(248,113,113,0.12)',
                border: '1px solid rgba(248,113,113,0.35)',
                color: '#fca5a5',
                fontSize: '0.8rem',
                fontWeight: 600,
                borderRadius: '999px',
                cursor: 'pointer'
              }}
            >
              🗑 Delete
            </button>
          )}
          {!editMode && onViewHistory && (
            <button
              type="button"
              className="btn"
              onClick={() => onViewHistory(group.baseName)}
              title="View this procedure's change history"
              style={{
                padding: '0.25rem 0.75rem',
                background: 'rgba(168,85,247,0.12)',
                border: '1px solid rgba(168,85,247,0.35)',
                color: '#d8b4fe',
                fontSize: '0.8rem',
                fontWeight: 600,
                borderRadius: '999px',
                cursor: 'pointer'
              }}
            >
              🕓 History
            </button>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginLeft: 'auto', background: isFinished ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={!!isFinished}
              onChange={handleToggleFinished}
              style={{ cursor: 'pointer' }}
            />
            {isFinished ? 'Finished' : 'Mark as Done'}
          </label>
        </div>
      </div>

      {editMode && editorState ? (
        <div>
          {editorError && (
            <div style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', color: '#fca5a5', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', marginBottom: '1rem' }}>
              {editorError}
            </div>
          )}
          <EditorPanel value={editorState} onChange={setEditorState} kind={page} tipSheetsBank={tipSheetsBank} />
          <details style={{ marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Live preview (click to expand)</summary>
            <div className="html-content legacy-content-wrapper" style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '1rem', background: '#fff' }}>
              <HtmlContent html={page === 'SCH' ? buildCardHTML(editorState, entityLinks) : buildCRCardHTML(editorState, entityLinks)} />
            </div>
          </details>
          <div className="button-group">
            <span className={`saved-status ${editorSaved ? 'visible' : ''}`}>✓ Saved to Database</span>
            <button type="button" className="btn" onClick={cancelEdit} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }} title="Discard unsaved changes and close the editor">
              Discard &amp; Close
            </button>
            <button type="button" className="btn" onClick={saveEdit} style={{ background: 'rgba(96,165,250,0.18)', border: '1px solid rgba(96,165,250,0.4)', color: '#93c5fd' }} title="Save changes and keep editing">
              Save
            </button>
            <button type="button" className="btn btn-primary" onClick={saveAndClose} title="Save changes and close the editor">
              ✓ Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="html-content legacy-content-wrapper">
            <HtmlContent html={contentHTML} />
          </div>
          <div className="comment-section">
            <label className="comment-label">Reviewer Comments</label>
            <textarea
              placeholder="Add your comments here for changes, notes, etc..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="button-group">
              <span className={`saved-status ${savedStatus ? 'visible' : ''}`}>
                ✓ Saved to Database
              </span>
              <button className="btn btn-primary" onClick={handleSave}>
                Save Comment
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModality, setSelectedModality] = useState('All');
  const [activePage, setActivePage] = useState('SCH'); // 'SCH', 'CR', 'ENTITY_LINKS', 'OOS', or 'HISTORY'
  const [historyFilter, setHistoryFilter] = useState(''); // pre-seeds the History search when jumping from a card
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'finished'
  const [reviewsDB, setReviewsDB] = useState({});
  const [dbProcedures, setDbProcedures] = useState([]);
  const [entityLinks, setEntityLinks] = useState({}); // { THA: {sch, cr}, ... }
  const [oosProcedures, setOosProcedures] = useState({}); // { 'CT BIOPSIES': {name, modalityId}, ... }
  const [tipSheetsBank, setTipSheetsBank] = useState([]); // [{ id, displayName, category, filename, url }]
  const [isUploading, setIsUploading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  // Sync with Firestore
  useEffect(() => {
    const unsubReviews = onSnapshot(collection(db, "reviews"), (snapshot) => {
      const dataStore = {};
      snapshot.forEach(doc => {
        dataStore[doc.id] = doc.data();
      });
      setReviewsDB(dataStore);
    }, (error) => {
      console.error("Error reading reviews from Firebase:", error);
    });

    const unsubProcedures = onSnapshot(collection(db, "procedures"), (snapshot) => {
      const loaded = [];
      snapshot.forEach(doc => {
        loaded.push(doc.data());
      });
      setDbProcedures(loaded);
    }, (error) => {
      console.error("Error reading procedures from Firebase:", error);
    });

    // Subscribe to entityLinks — keyed by entity code, fields { sch, cr }.
    // Used by cardBuilder to wrap entity abbreviations in <a> tags.
    const unsubEntityLinks = onSnapshot(collection(db, "entityLinks"), (snapshot) => {
      const map = {};
      snapshot.forEach(d => { map[d.id] = d.data(); });
      setEntityLinks(map);
    }, (error) => {
      console.error("Error reading entityLinks from Firebase:", error);
    });

    // Subscribe to oosProcedures — keyed by procedure name, fields { name, modalityId }.
    // Folded into a single OUT_OF_SCOPE_PROCEDURES_SCH SharePoint row on export.
    const unsubOos = onSnapshot(collection(db, "oosProcedures"), (snapshot) => {
      const map = {};
      snapshot.forEach(d => { map[d.id] = d.data(); });
      setOosProcedures(map);
    }, (error) => {
      console.error("Error reading oosProcedures from Firebase:", error);
    });

    // Subscribe to tipSheets — shared bank of CR tip-sheet titles + URLs that
    // schedulers pick from when adding a Pertinent Tip Sheet to a CR card.
    const unsubTips = onSnapshot(collection(db, "tipSheets"), (snapshot) => {
      const list = [];
      snapshot.forEach(d => { list.push({ id: d.id, ...d.data() }); });
      list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      setTipSheetsBank(list);
    }, (error) => {
      console.error("Error reading tipSheets from Firebase:", error);
    });

    return () => {
      unsubReviews();
      unsubProcedures();
      unsubEntityLinks();
      unsubOos();
      unsubTips();
    };
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      if (!Array.isArray(jsonData)) {
        alert("JSON file must contain an array of procedures");
        setIsUploading(false);
        return;
      }

      // Snapshot the reviewer comments this upload is about to wipe — the
      // procedure HTML can be re-uploaded from the JSON file, but the comments
      // exist nowhere else, so the bulk audit record preserves them.
      const clearedComments = [];
      for (const item of jsonData) {
        if (!item?.Procedure) continue;
        const cleanId = item.Procedure.replace(/\//g, '-');
        const prev = reviewsDB[cleanId];
        if (prev?.comment) clearedComments.push({ procedure: item.Procedure, comment: prev.comment });
      }

      // Chunk uploads to avoid 500 op limit on Firestore batched writes
      const chunkSize = 200; // Lower chunk size to account for review clears (2 ops per item)
      let count = 0;
      try {
        for (let i = 0; i < jsonData.length; i += chunkSize) {
          const chunk = jsonData.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          let chunkCount = 0;

          chunk.forEach(item => {
            if (item.Procedure) {
              // Replace any slashes to prevent subcollections
              const cleanId = item.Procedure.replace(/\//g, '-');
              const docRef = doc(db, 'procedures', cleanId);
              batch.set(docRef, item, { merge: true });

              // Clear the reviewer comment/notes for this procedure
              const reviewRef = doc(db, 'reviews', cleanId);
              batch.set(reviewRef, { comment: '', isFinished: false }, { merge: true });

              chunkCount++;
            }
          });

          await batch.commit();
          count += chunkCount;
        }
      } finally {
        // Earlier chunks commit even if a later one throws — record whatever
        // actually landed so a partial upload doesn't vanish from History.
        if (count > 0) {
          await logBulk('procedures', `Batch JSON upload (${count} procedures)`, {
            proceduresUploaded: count,
            reviewsCleared: count,
            clearedComments,
          });
        }
      }
      alert(`Successfully uploaded ${count} procedures! Reviewer notes have been cleared for uploaded items.`);
    } catch (e) {
      console.error(e);
      alert("Error parsing JSON or uploading to database");
    }

    setIsUploading(false);
    event.target.value = null; // reset input
  };

  const updateReviewInDB = async (procedureKey, updateData, label) => {
    try {
      // reviewsDB mirrors the reviews collection live via onSnapshot, so pass
      // it as the audit `before` — skipping auditedSet's pre-read keeps this
      // hot path (checkbox toggles, comment saves) at one write round-trip and
      // lets Firestore's latency compensation flip the UI instantly.
      await auditedSet('reviews', procedureKey, updateData, {
        label: label || procedureKey,
        before: reviewsDB[procedureKey] ?? null,
      });
    } catch (error) {
      console.error("Error updating database:", error);
      alert("Error saving to database! Check your Firebase rules.");
    }
  };

  // Persist edited content (HTML for either Scheduling_x0020_Instructions or
  // Clinical_x0020_Review_x0020_Notes) back to the procedures collection.
  const saveProcedureContent = useCallback(async (procedureName, fieldName, newHTML) => {
    const cleanId = procedureName.replace(/\//g, '-');
    await auditedSet('procedures', cleanId, { [fieldName]: newHTML }, { label: procedureName });
  }, []);

  // Build default v12 SCH/CR HTML for a brand-new procedure and write to Firestore.
  const createNewProcedure = useCallback(async ({ baseName, modalityId, makeSCH, makeCR }) => {
    const modalityShort = MODALITY_SHORT[modalityId] || 'CT';
    const defaultEntityMatrix = DEFAULT_ENTITIES.map(e => ({ entity: e, performs: 'YES', notes: '' }));

    const writes = [];

    if (makeSCH) {
      const schData = {
        outOfScope: false,
        outOfScopeReason: '',
        procedureName: baseName,
        modality: modalityShort,
        modalityDescription: '',
        headerImage: '',
        orderOptions: [],
        sharedEntityNotes: [],
        entityMatrix: defaultEntityMatrix,
        stat: [...STANDARD_STAT_BULLETS],
        asap: [...STANDARD_ASAP_BULLETS],
        specialNeeds: [...STANDARD_SPECIAL_NEEDS_BULLETS],
        covid: [...STANDARD_COVID_BULLETS]
      };
      const schHtml = buildCardHTML(schData, entityLinks);
      const schProc = `${baseName}_SCH`;
      const schId = schProc.replace(/\//g, '-');
      writes.push({
        id: schId,
        proc: schProc,
        data: {
          Entity0Id: 24,
          ModalityId: modalityId,
          Procedure: schProc,
          Scheduling_x0020_Instructions: schHtml,
          Clinical_x0020_Review_x0020_Notes: ''
        }
      });
    }

    if (makeCR) {
      const crData = {
        outOfScope: false,
        outOfScopeReason: '',
        procedureName: baseName,
        modality: modalityShort,
        modalityDescription: '',
        headerImage: '',
        description: '',
        epicOrderables: [],
        tipSheets: [],
        standardCRNotes: '',
        entityMatrix: defaultEntityMatrix
      };
      const crHtml = buildCRCardHTML(crData, entityLinks);
      const crProc = `${baseName}_CR`;
      const crId = crProc.replace(/\//g, '-');
      writes.push({
        id: crId,
        proc: crProc,
        data: {
          Entity0Id: 24,
          ModalityId: modalityId,
          Procedure: crProc,
          Scheduling_x0020_Instructions: '',
          Clinical_x0020_Review_x0020_Notes: crHtml
        }
      });
    }

    const batch = writeBatch(db);
    for (const w of writes) {
      batch.set(doc(db, 'procedures', w.id), w.data, { merge: true });
      batch.set(doc(db, 'reviews', w.id), { comment: '', isFinished: false }, { merge: true });
    }
    await batch.commit();
    // The merge:true set above can land on an existing doc (e.g. a name that
    // sanitizes to the same id, or a stale duplicate check) — log that as the
    // update it really is, with the in-memory doc as `before`, instead of
    // asserting a brand-new create. Logs run in parallel; logEvent never throws.
    await Promise.all(writes.map((w) => {
      const existing = dbProcedures.find(p => p.Procedure?.replace(/\//g, '-') === w.id);
      const before = existing
        ? Object.fromEntries(Object.keys(w.data).filter(k => k in existing).map(k => [k, existing[k]]))
        : null;
      return logEvent({
        coll: 'procedures', docId: w.id, label: w.proc,
        action: existing ? 'update' : 'create',
        before, after: w.data,
      });
    }));
  }, [entityLinks, dbProcedures]);

  // Delete a procedure (and optionally its sibling on the other page) from
  // both procedures and reviews collections.
  const deleteProcedure = useCallback(async (baseName, deleteBoth) => {
    const targets = deleteBoth ? [`${baseName}_SCH`, `${baseName}_CR`] : [`${baseName}_${activePage}`];
    for (const proc of targets) {
      const cleanId = proc.replace(/\//g, '-');
      try {
        await auditedDelete('procedures', cleanId, { label: proc });
      } catch (e) {
        console.warn(`procedures/${cleanId} delete:`, e.message);
      }
      try {
        await auditedDelete('reviews', cleanId, { label: proc });
      } catch (e) {
        console.warn(`reviews/${cleanId} delete:`, e.message);
      }
    }
  }, [activePage]);

  // Jump to the History tab pre-filtered to one procedure (used by the per-card
  // 🕓 History shortcut).
  const viewHistoryFor = useCallback((label) => {
    setHistoryFilter(label);
    setActivePage('HISTORY');
  }, []);

  const { groupedData, availableModalities } = useMemo(() => {
    const groups = {};
    const mods = new Set();

    dbProcedures.forEach(item => {
      if (!item || !item.Procedure) return;
      if (item.ModalityId !== undefined && item.ModalityId !== null) {
        mods.add(item.ModalityId);
      }

      const isCR = item.Procedure.endsWith('_CR');
      const baseName = item.Procedure.replace(/_CR$|_SCH$/, '');

      if (!groups[baseName]) {
        groups[baseName] = {
          baseName,
          schItem: null,
          crItem: null,
          Entity0Id: item.Entity0Id,
          ModalityId: item.ModalityId
        };
      }

      if (isCR) {
        groups[baseName].crItem = item;
      } else {
        groups[baseName].schItem = item;
      }
    });

    const filtered = Object.values(groups).filter(group => {
      // Only show procedures that have content for the active page
      const item = activePage === 'SCH' ? group.schItem : group.crItem;
      if (!item) return false;

      const term = searchTerm.toLowerCase();
      const inBaseName = group.baseName.toLowerCase().includes(term);
      const fieldHTML = activePage === 'SCH'
        ? item.Scheduling_x0020_Instructions
        : item.Clinical_x0020_Review_x0020_Notes;
      // Strip the hidden OOS data island first — otherwise OOS cards match
      // searches for text that is nowhere visible on the card.
      const inContent = fieldHTML ? stripOOSPreserved(fieldHTML).toLowerCase().includes(term) : false;
      const matchesSearch = inBaseName || inContent;

      const matchesModality = selectedModality === 'All' || group.ModalityId?.toString() === selectedModality;

      return matchesSearch && matchesModality;
    });

    return {
      groupedData: filtered,
      availableModalities: Array.from(mods).sort()
    };
  }, [searchTerm, selectedModality, activePage, dbProcedures]);

  const displayedData = useMemo(() => {
    return groupedData.filter(group => {
      const dbKey = `${group.baseName}_${activePage}`.replace(/\//g, '-');
      const isFinished = !!(reviewsDB[dbKey]?.isFinished);
      return activeTab === 'finished' ? isFinished : !isFinished;
    });
  }, [groupedData, reviewsDB, activeTab, activePage]);

  const exportCommentsToCSV = () => {
    let csvContent = "Procedure,Page,Finished,Comment\n";

    groupedData.forEach(group => {
      const dbKey = `${group.baseName}_${activePage}`.replace(/\//g, '-');
      const reviewData = reviewsDB[dbKey] || {};
      const comment = reviewData.comment || '';
      const isFinished = reviewData.isFinished || false;
      const pageLabel = activePage === 'SCH' ? 'Scheduling' : 'Clinical Review';

      const escapedComment = comment.replace(/"/g, '""');
      csvContent += `"${group.baseName}","${pageLabel}","${isFinished ? 'Yes' : 'No'}","${escapedComment}"\n`;
    });

    if (groupedData.length === 0) {
      alert("No procedures to export!");
      return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "scheduling-review-data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export current procedures (filtered by active page = SCH or CR) as a Power Automate update JSON.
  const exportPowerAutomateJSON = () => {
    if (dbProcedures.length === 0) {
      alert("No procedures in the database yet. Upload a JSON Batch first.");
      return;
    }
    const suffix = activePage === 'SCH' ? '_SCH' : '_CR';
    // The Power Automate flow ("Upsert Consolidated Scheduling Reference") writes
    // EVERY card's HTML into the SharePoint Scheduling_x0020_Instructions column,
    // regardless of whether it's SCH or CR — the _SCH / _CR suffix on Procedure
    // is what tells them apart. The Clinical_x0020_Review_x0020_Notes column is
    // a legacy field that must always be empty in the upload payload, otherwise
    // the flow ignores the CR HTML stored there and silently writes blanks.
    // Rebuild HTML on export using current entityLinks. Ensures hyperlinks
    // on entity abbreviations reflect the latest URLs even if the user forgot
    // to run "Regenerate All Cards" after editing entity links. Falls back
    // to the stored HTML if a card can't be parsed.
    const items = dbProcedures
      .filter(p => p.Procedure && p.Procedure.endsWith(suffix))
      .map(p => {
        const isCR = p.Procedure.endsWith('_CR');
        const storedHtml = isCR
          ? (p.Clinical_x0020_Review_x0020_Notes || p.Scheduling_x0020_Instructions || '')
          : (p.Scheduling_x0020_Instructions || '');
        let html = storedHtml;
        try {
          const parsed = isCR ? parseCRCard(storedHtml) : parseCard(storedHtml);
          html = isCR ? buildCRCardHTML(parsed, entityLinks) : buildCardHTML(parsed, entityLinks);
        } catch (err) {
          console.warn(`Export: could not rebuild ${p.Procedure}, using stored HTML`, err);
        }
        return {
          Entity0Id: p.Entity0Id ?? 24,
          ModalityId: p.ModalityId,
          Procedure: p.Procedure,
          Scheduling_x0020_Instructions: html,
          Clinical_x0020_Review_x0020_Notes: ''
        };
      });

    if (items.length === 0) {
      alert(`No ${activePage} procedures found in the database to export.`);
      return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `Update_${activePage}_${stamp}.json`;
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

  return (
    <div className="app-container">
      <NewProcedureModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={createNewProcedure}
        existingProcedures={dbProcedures}
      />
      <div className="header">
        <h1>Scheduling Review Portal</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label
            style={{
              padding: '0.5rem 1rem',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '0.5rem',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              opacity: isUploading ? 0.6 : 1,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            {isUploading ? 'Uploading to DB...' : '+ Upload JSON Batch'}
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              disabled={isUploading}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => setShowNewModal(true)}
            title="Create a brand-new procedure"
            style={{ background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac', fontWeight: 600 }}
          >
            + New Procedure
          </button>
          <button className="btn" onClick={exportCommentsToCSV} title="Export reviewer comments + finished status as CSV" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
            Comments CSV
          </button>
          <button className="btn btn-primary" onClick={exportPowerAutomateJSON} title="Download all current procedures as a Power Automate update JSON">
            ↓ Export Power Automate JSON
          </button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <div
          className={`tab ${activePage === 'SCH' ? 'active' : ''}`}
          onClick={() => { setActivePage('SCH'); setActiveTab('pending'); }}
          style={{ fontWeight: 700, fontSize: '1rem' }}
        >
          Scheduling
        </div>
        <div
          className={`tab ${activePage === 'CR' ? 'active' : ''}`}
          onClick={() => { setActivePage('CR'); setActiveTab('pending'); }}
          style={{ fontWeight: 700, fontSize: '1rem' }}
        >
          Clinical Review
        </div>
        <div
          className={`tab ${activePage === 'ENTITY_LINKS' ? 'active' : ''}`}
          onClick={() => setActivePage('ENTITY_LINKS')}
          style={{ fontWeight: 700, fontSize: '1rem' }}
        >
          Entity Links
        </div>
        <div
          className={`tab ${activePage === 'OOS' ? 'active' : ''}`}
          onClick={() => setActivePage('OOS')}
          style={{ fontWeight: 700, fontSize: '1rem' }}
        >
          Out of Scope
        </div>
        <div
          className={`tab ${activePage === 'HISTORY' ? 'active' : ''}`}
          onClick={() => { setHistoryFilter(''); setActivePage('HISTORY'); }}
          style={{ fontWeight: 700, fontSize: '1rem' }}
        >
          History
        </div>
      </div>

      {activePage === 'ENTITY_LINKS' && (
        <EntityLinksPage entityLinks={entityLinks} />
      )}
      {activePage === 'OOS' && (
        <OutOfScopePage oosProcedures={oosProcedures} />
      )}
      {activePage === 'HISTORY' && (
        <HistoryPage initialSearch={historyFilter} />
      )}
      {activePage !== 'ENTITY_LINKS' && activePage !== 'OOS' && activePage !== 'HISTORY' && (<>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <input
          type="text"
          className="search-bar"
          placeholder="Filter procedures or instructions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ marginBottom: 0, flex: 1 }}
        />
        <select
          className="search-bar"
          value={selectedModality}
          onChange={(e) => setSelectedModality(e.target.value)}
          style={{ marginBottom: 0, width: 'auto', minWidth: '150px', cursor: 'pointer' }}
        >
          <option value="All">All Modalities</option>
          {availableModalities.map(modId => {
            const label = MODALITY_MAP[modId] || `Modality ${modId}`;
            return (
              <option key={modId} value={modId}>{label}</option>
            );
          })}
        </select>
      </div>

      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <div
          className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending Reviews ({groupedData.filter(g => {
            const dbKey = `${g.baseName}_${activePage}`.replace(/\//g, '-');
            return !reviewsDB[dbKey]?.isFinished;
          }).length})
        </div>
        <div
          className={`tab ${activeTab === 'finished' ? 'active' : ''}`}
          onClick={() => setActiveTab('finished')}
        >
          Finished ({groupedData.filter(g => {
            const dbKey = `${g.baseName}_${activePage}`.replace(/\//g, '-');
            return reviewsDB[dbKey]?.isFinished;
          }).length})
        </div>
      </div>

      <div className="procedure-list">
        {displayedData.slice(0, 100).map((group, index) => {
          const dbKey = `${group.baseName}_${activePage}`.replace(/\//g, '-');
          return (
            <ProcedureCard
              key={`${group.baseName}-${activePage}-${index}`}
              group={group}
              page={activePage}
              reviewData={reviewsDB[dbKey]}
              onUpdateReview={updateReviewInDB}
              onSaveProcedureContent={saveProcedureContent}
              onDeleteProcedure={deleteProcedure}
              onViewHistory={viewHistoryFor}
              entityLinks={entityLinks}
              tipSheetsBank={tipSheetsBank}
            />
          );
        })}
        {displayedData.length > 100 && (
          <div style={{ textAlign: 'center', margin: '2rem 0', color: 'var(--text-muted)' }}>
            Showing 100 of {displayedData.length} results. Please use the search bar to find more.
          </div>
        )}
        {displayedData.length === 0 && (
          <div style={{ textAlign: 'center', margin: '2rem 0', color: 'var(--text-muted)' }}>
            No procedures found in this tab.
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}
