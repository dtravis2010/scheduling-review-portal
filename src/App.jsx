import React, { useState, useEffect, useMemo } from 'react';
import data from './data.json';

// Component for an individual Procedure item
const ProcedureCard = ({ item, isFinished, onToggleFinished }) => {
  const [comment, setComment] = useState('');
  const [savedStatus, setSavedStatus] = useState(false);

  // Load comment from local storage on mount
  useEffect(() => {
    const savedComment = localStorage.getItem(`comment-${item.Procedure}`);
    if (savedComment) {
      setComment(savedComment);
    }
  }, [item.Procedure]);

  const handleSave = () => {
    localStorage.setItem(`comment-${item.Procedure}`, comment);
    setSavedStatus(true);
    setTimeout(() => setSavedStatus(false), 2000);
  };

  return (
    <div className={`procedure-card ${isFinished ? 'finished' : ''}`}>
      <div className="procedure-header">
        <h2 className="procedure-title">{item.Procedure.replace('_SCH', '')}</h2>
        <div className="procedure-tags">
          <span className="tag">Entity {item.Entity0Id}</span>
          <span className="tag">Modality {item.ModalityId}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginLeft: 'auto', background: isFinished ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.875rem' }}>
            <input 
              type="checkbox" 
              checked={!!isFinished} 
              onChange={() => onToggleFinished(item.Procedure)} 
              style={{ cursor: 'pointer' }}
            />
            {isFinished ? 'Finished' : 'Mark as Done'}
          </label>
        </div>
      </div>

      <div className="html-content legacy-content-wrapper">
        <div dangerouslySetInnerHTML={{ __html: item.Scheduling_x0020_Instructions }} />
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
            ✓ Saved
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
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'finished'
  
  // Track finished items from localStorage
  const [finishedItems, setFinishedItems] = useState(() => {
    const initialState = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('finished-')) {
        initialState[key.replace('finished-', '')] = localStorage.getItem(key) === 'true';
      }
    }
    return initialState;
  });

  const toggleFinished = (procedure) => {
    setFinishedItems(prev => {
      const newVal = !prev[procedure];
      localStorage.setItem(`finished-${procedure}`, newVal);
      return { ...prev, [procedure]: newVal };
    });
  };
  
  const filteredData = useMemo(() => {
    return data.filter(item => 
      !item.Procedure.endsWith('_CR') &&
      item.Procedure.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const displayedData = useMemo(() => {
    return filteredData.filter(item => {
      const isFinished = !!finishedItems[item.Procedure];
      return activeTab === 'finished' ? isFinished : !isFinished;
    });
  }, [filteredData, finishedItems, activeTab]);

  const exportCommentsToCSV = () => {
    let csvContent = "Procedure,Finished,Comment\n";
    let hasComments = false;

    // We pull from filteredData so we can check both comment and finished status
    data.filter(i => !i.Procedure.endsWith('_CR')).forEach(item => {
      const comment = localStorage.getItem(`comment-${item.Procedure}`) || '';
      const isFinished = localStorage.getItem(`finished-${item.Procedure}`) === 'true';
      
      if (comment.trim() !== '' || isFinished) {
        hasComments = true;
        const procedureName = item.Procedure.replace('_SCH', '');
        const escapedComment = comment.replace(/"/g, '""');
        csvContent += `"${procedureName}","${isFinished ? 'Yes' : 'No'}","${escapedComment}"\n`;
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
        <button className="btn btn-primary" onClick={exportCommentsToCSV}>
          Export Data (CSV)
        </button>
      </div>
      
      <input 
        type="text" 
        className="search-bar" 
        placeholder="Filter procedures or instructions..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <div 
          className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending Reviews ({filteredData.filter(i => !finishedItems[i.Procedure]).length})
        </div>
        <div 
          className={`tab ${activeTab === 'finished' ? 'active' : ''}`}
          onClick={() => setActiveTab('finished')}
        >
          Finished ({filteredData.filter(i => finishedItems[i.Procedure]).length})
        </div>
      </div>

      <div className="procedure-list">
        {displayedData.slice(0, 100).map((item, index) => (
          <ProcedureCard 
            key={`${item.Procedure}-${index}`} 
            item={item} 
            isFinished={finishedItems[item.Procedure]}
            onToggleFinished={toggleFinished}
          />
        ))}
        {displayedData.length > 100 && (
          <div style={{textAlign: 'center', margin: '2rem 0', color: 'var(--text-muted)'}}>
            Showing 100 of {displayedData.length} results. Please use the search bar to find more.
          </div>
        )}
        {displayedData.length === 0 && (
          <div style={{textAlign: 'center', margin: '2rem 0', color: 'var(--text-muted)'}}>
            No procedures found in this tab.
          </div>
        )}
      </div>
    </div>
  );
}
