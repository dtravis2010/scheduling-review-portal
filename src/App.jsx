import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, writeBatch } from 'firebase/firestore';
import { parseCard, parseCRCard } from './cardParser';
import { buildCardHTML, buildCRCardHTML } from './cardBuilder';
import EditorPanel from './EditorPanel';

// Site reads ONLY from Firestore — legacy bundled JSON loading was removed so old layouts
// can't leak into the UI. Use "+ Upload JSON Batch" to seed Firestore.

const MODALITY_MAP = {
  1: 'CT / NM',
  2: 'MRI',
  3: 'GI & Fluoro',
  4: 'Vascular Ultrasound',
  5: 'General Ultrasound'
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
const ProcedureCard = React.memo(({ group, page, reviewData, onUpdateReview, onSaveProcedureContent }) => {
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
    if (reviewData?.comment !== undefined && reviewData?.comment !== comment) {
      setComment(reviewData.comment);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData?.comment]);

  const handleSave = () => {
    onUpdateReview(dbKey, { comment, isFinished });
    setSavedStatus(true);
    setTimeout(() => setSavedStatus(false), 2000);
  };

  const handleToggleFinished = () => {
    onUpdateReview(dbKey, { comment, isFinished: !isFinished });
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
    if (!editorState) return;
    try {
      const newHTML = page === 'SCH' ? buildCardHTML(editorState) : buildCRCardHTML(editorState);
      const fieldName = page === 'SCH' ? 'Scheduling_x0020_Instructions' : 'Clinical_x0020_Review_x0020_Notes';
      await onSaveProcedureContent(item.Procedure, fieldName, newHTML);
      setEditorSaved(true);
      setTimeout(() => setEditorSaved(false), 2500);
      // Stay in edit mode so user can keep tweaking
    } catch (e) {
      console.error(e);
      setEditorError('Save failed: ' + (e.message || 'unknown error'));
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
          <EditorPanel value={editorState} onChange={setEditorState} kind={page} />
          <details style={{ marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Live preview (click to expand)</summary>
            <div className="html-content legacy-content-wrapper" style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '1rem', background: '#fff' }}>
              <HtmlContent html={page === 'SCH' ? buildCardHTML(editorState) : buildCRCardHTML(editorState)} />
            </div>
          </details>
          <div className="button-group">
            <span className={`saved-status ${editorSaved ? 'visible' : ''}`}>✓ Saved to Database</span>
            <button type="button" className="btn" onClick={cancelEdit} style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveEdit}>
              Save Changes
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
  const [activePage, setActivePage] = useState('SCH'); // 'SCH' or 'CR'
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'finished'
  const [reviewsDB, setReviewsDB] = useState({});
  const [dbProcedures, setDbProcedures] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

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

    return () => {
      unsubReviews();
      unsubProcedures();
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

      // Chunk uploads to avoid 500 op limit on Firestore batched writes
      const chunkSize = 200; // Lower chunk size to account for review clears (2 ops per item)
      let count = 0;
      for (let i = 0; i < jsonData.length; i += chunkSize) {
        const chunk = jsonData.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach(item => {
          if (item.Procedure) {
            // Replace any slashes to prevent subcollections
            const cleanId = item.Procedure.replace(/\//g, '-');
            const docRef = doc(db, 'procedures', cleanId);
            batch.set(docRef, item, { merge: true });

            // Clear the reviewer comment/notes for this procedure
            const reviewKey = cleanId.replace(/\//g, '-');
            const reviewRef = doc(db, 'reviews', reviewKey);
            batch.set(reviewRef, { comment: '', isFinished: false }, { merge: true });

            count++;
          }
        });

        await batch.commit();
      }
      alert(`Successfully uploaded ${count} procedures! Reviewer notes have been cleared for uploaded items.`);
    } catch (e) {
      console.error(e);
      alert("Error parsing JSON or uploading to database");
    }

    setIsUploading(false);
    event.target.value = null; // reset input
  };

  const updateReviewInDB = async (procedureKey, updateData) => {
    try {
      await setDoc(doc(db, "reviews", procedureKey), updateData, { merge: true });
    } catch (error) {
      console.error("Error updating database:", error);
      alert("Error saving to database! Check your Firebase rules.");
    }
  };

  // Persist edited content (HTML for either Scheduling_x0020_Instructions or
  // Clinical_x0020_Review_x0020_Notes) back to the procedures collection.
  const saveProcedureContent = useCallback(async (procedureName, fieldName, newHTML) => {
    const cleanId = procedureName.replace(/\//g, '-');
    const patch = {};
    patch[fieldName] = newHTML;
    await setDoc(doc(db, 'procedures', cleanId), patch, { merge: true });
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
      const inContent = fieldHTML?.toLowerCase().includes(term);
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
    const items = dbProcedures
      .filter(p => p.Procedure && p.Procedure.endsWith(suffix))
      .map(p => ({
        Entity0Id: p.Entity0Id ?? 24,
        ModalityId: p.ModalityId,
        Procedure: p.Procedure,
        Scheduling_x0020_Instructions: p.Scheduling_x0020_Instructions || '',
        Clinical_x0020_Review_x0020_Notes: p.Clinical_x0020_Review_x0020_Notes || ''
      }));

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
      </div>

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
    </div>
  );
}
