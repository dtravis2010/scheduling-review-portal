import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, writeBatch } from 'firebase/firestore';

// Automatically load all .json files in the 'src' folder (like data.json, Batch_MRI.json)
const jsonFiles = import.meta.glob('./*.json', { eager: true });
const data = Object.values(jsonFiles).flatMap(module => module.default || module);

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
const ProcedureCard = React.memo(({ group, page, reviewData, onUpdateReview }) => {
  const [comment, setComment] = useState('');
  const [savedStatus, setSavedStatus] = useState(false);

  const item = page === 'SCH' ? group.schItem : group.crItem;
  const dbKey = `${group.baseName}_${page}`.replace(/\//g, '-');
  const isFinished = reviewData?.isFinished || false;

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

  const contentHTML = item?.Scheduling_x0020_Instructions;

  return (
    <div className={`procedure-card ${isFinished ? 'finished' : ''}`}>
      <div className="procedure-header">
        <h2 className="procedure-title">{group.baseName}</h2>
        <div className="procedure-tags">
          <span className="tag">Entity {group.Entity0Id}</span>
          <span className="tag">{MODALITY_MAP[group.ModalityId] || `Modality ${group.ModalityId}`}</span>
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
      const chunkSize = 400;
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
            count++;
          }
        });
        
        await batch.commit();
      }
      alert(`Successfully uploaded ${count} procedures to the database!`);
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

  const { groupedData, availableModalities } = useMemo(() => {
    const groups = {};
    
    // Combine local code-based JSON with dynamically fetched DB procedures
    const combinedMap = new Map();
    data.forEach(item => combinedMap.set(item.Procedure, item));
    dbProcedures.forEach(item => combinedMap.set(item.Procedure, item));
    
    const combinedData = Array.from(combinedMap.values());
    const mods = new Set();
    
    combinedData.forEach(item => {
      if (item.ModalityId !== undefined && item.ModalityId !== null) {
        mods.add(item.ModalityId);
      }
      
      const isCR = item.Procedure.endsWith('_CR');
      let baseName = item.Procedure.replace(/_CR$|_SCH$/, '');

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
      const inContent = item.Scheduling_x0020_Instructions?.toLowerCase().includes(term);
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
          <button className="btn btn-primary" onClick={exportCommentsToCSV}>
            Export Data (CSV)
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
