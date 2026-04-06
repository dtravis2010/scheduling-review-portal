import React, { useState, useEffect, useMemo } from 'react';
import data from './data.json';

// Component for an individual Procedure item
const ProcedureCard = ({ item }) => {
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
    <div className="procedure-card">
      <div className="procedure-header">
        <h2 className="procedure-title">{item.Procedure.replace('_SCH', '')}</h2>
        <div className="procedure-tags">
          <span className="tag">Entity {item.Entity0Id}</span>
          <span className="tag">Modality {item.ModalityId}</span>
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
  
  // Clean up duplicate entries by procedure name just in case, though we will just render them all
  const filteredData = useMemo(() => {
    return data.filter(item => 
      !item.Procedure.endsWith('_CR') &&
      item.Procedure.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const exportCommentsToCSV = () => {
    let csvContent = "Procedure,Comment\n";
    let hasComments = false;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('comment-')) {
        const comment = localStorage.getItem(key);
        if (comment && comment.trim() !== '') {
          hasComments = true;
          const procedureName = key.replace('comment-', '').replace('_SCH', '');
          const escapedComment = comment.replace(/"/g, '""');
          csvContent += `"${procedureName}","${escapedComment}"\n`;
        }
      }
    }

    if (!hasComments) {
      alert("No comments to export yet!");
      return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "scheduling-review-comments.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Scheduling Review Portal</h1>
        <button className="btn btn-primary" onClick={exportCommentsToCSV}>
          Export Comments (CSV)
        </button>
      </div>
      
      <input 
        type="text" 
        className="search-bar" 
        placeholder="Filter procedures or instructions..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="procedure-list">
        {filteredData.slice(0, 100).map((item, index) => (
          <ProcedureCard key={`${item.Procedure}-${index}`} item={item} />
        ))}
        {filteredData.length > 100 && (
          <div style={{textAlign: 'center', margin: '2rem 0', color: 'var(--text-muted)'}}>
            Showing 100 of {filteredData.length} results. Please use the search bar to find more.
          </div>
        )}
        {filteredData.length === 0 && (
          <div style={{textAlign: 'center', margin: '2rem 0', color: 'var(--text-muted)'}}>
            No procedures found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
