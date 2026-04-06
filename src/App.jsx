import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, writeBatch } from 'firebase/firestore';

// Automatically load all .json files in the 'src' folder (like data.json, Batch_MRI.json)
const jsonFiles = import.meta.glob('./*.json', { eager: true });
const data = Object.values(jsonFiles).flatMap(module => module.default || module);

const MODALITY_MAP = {
  1: 'CT / NM',
  2: 'MRI',
  3: 'Ultrasound',
  4: 'X-Ray'
};

// Component for an individual Procedure item
const ProcedureCard = ({ group, reviewData, onUpdateReview }) => {
  const [comment, setComment] = useState('');
  const [savedStatus, setSavedStatus] = useState(false);
  const [innerTab, setInnerTab] = useState(group.schItem ? 'SCH' : 'CR');

  const isFinished = reviewData?.isFinished || false;
  // Use DB key from scheduler item to preserve previous reviews
  const dbKey = group.schItem ? group.schItem.Procedure : group.baseName;

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

  const currentHTML = innerTab === 'SCH'
    ? group.schItem?.Scheduling_x0020_Instructions
    : group.crItem?.Scheduling_x0020_Instructions;

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

      <div className="tabs" style={{ marginBottom: '1rem' }}>
        {group.schItem && (
          <div
            className={`tab ${innerTab === 'SCH' ? 'active' : ''}`}
            onClick={() => setInnerTab('SCH')}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
          >
            Scheduling Instructions
          </div>
        )}
        {group.crItem && (
          <div
            className={`tab ${innerTab === 'CR' ? 'active' : ''}`}
            onClick={() => setInnerTab('CR')}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
          >
            Clinical Review
          </div>
        )}
      </div>
      <div className="html-content legacy-content-wrapper">
        {currentHTML ? (
          <div dangerouslySetInnerHTML={{ __html: currentHTML }} />
        ) : (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '1rem' }}>No content available for this view.</div>
        )}
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
};

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModality, setSelectedModality] = useState('All');
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
      const term = searchTerm.toLowerCase();
      const inBaseName = group.baseName.toLowerCase().includes(term);
      // use optional chaining because this can sometimes be null
      const inSch = group.schItem && group.schItem.Scheduling_x0020_Instructions?.toLowerCase().includes(term);
      const inCr = group.crItem && group.crItem.Scheduling_x0020_Instructions?.toLowerCase().includes(term);
      const matchesSearch = inBaseName || inSch || inCr;
      
      const matchesModality = selectedModality === 'All' || group.ModalityId?.toString() === selectedModality;

      return matchesSearch && matchesModality;
    });

    return {
      groupedData: filtered,
      availableModalities: Array.from(mods).sort()
    };
  }, [searchTerm, selectedModality, dbProcedures]);

  const displayedData = useMemo(() => {
    return groupedData.filter(group => {
      const dbKey = group.schItem ? group.schItem.Procedure : group.baseName;
      const isFinished = !!(reviewsDB[dbKey]?.isFinished);
      return activeTab === 'finished' ? isFinished : !isFinished;
    });
  }, [groupedData, reviewsDB, activeTab]);

  const exportCommentsToCSV = () => {
    let csvContent = "Procedure,Finished,Comment\n";
    let hasComments = false;

    groupedData.forEach(group => {
      const dbKey = group.schItem ? group.schItem.Procedure : group.baseName;
      const reviewData = reviewsDB[dbKey] || {};
      const comment = reviewData.comment || '';
      const isFinished = reviewData.isFinished || false;

      if (comment.trim() !== '' || isFinished) {
        hasComments = true;
        const escapedComment = comment.replace(/"/g, '""');
        csvContent += `"${group.baseName}","${isFinished ? 'Yes' : 'No'}","${escapedComment}"\n`;
      }
    });

    if (!hasComments) {
      alert("No comments or finished items to export yet!");
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
            const dbKey = g.schItem ? g.schItem.Procedure : g.baseName;
            return !reviewsDB[dbKey]?.isFinished;
          }).length})
        </div>
        <div
          className={`tab ${activeTab === 'finished' ? 'active' : ''}`}
          onClick={() => setActiveTab('finished')}
        >
          Finished ({groupedData.filter(g => {
            const dbKey = g.schItem ? g.schItem.Procedure : g.baseName;
            return reviewsDB[dbKey]?.isFinished;
          }).length})
        </div>
      </div>

      <div className="procedure-list">
        {displayedData.slice(0, 100).map((group, index) => {
          const dbKey = group.schItem ? group.schItem.Procedure : group.baseName;
          return (
            <ProcedureCard
              key={`${group.baseName}-${index}`}
              group={group}
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
