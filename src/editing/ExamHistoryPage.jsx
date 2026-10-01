// ExamHistoryPage — every published version of one exam: who, when, why, what
// changed, and whether it changed search results or the guidance shown.
// Restoring publishes the old version again as a new version.
import { useEffect, useId, useState } from 'react';
import { useEditing } from './context';
import { AffectsTags, ChangeList } from './EditExamPage';
import { editHref, examHref } from './routes';
import { formatWhen } from './format';
import { MIN_CHANGE_NOTE } from './validation';

const RestoreForm = ({ version, onRestore, onCancel }) => {
  const id = useId();
  const [note, setNote] = useState(`Restored version ${version.version} because `);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await onRestore(note);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="restore-form edit-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor={id}>Why restore this version?</label>
        <textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="muted">This makes version {version.version} live again right away. Nothing in history is erased.</p>
      {error && (
        <div className="form-message form-message--error" role="alert">
          <p>{error.message}</p>
          {error.errors && <ul>{error.errors.map((x) => <li key={x.message}>{x.message}</li>)}</ul>}
        </div>
      )}
      <div className="action-row">
        <button type="submit" className="button-primary" disabled={note.trim().length < MIN_CHANGE_NOTE}>Restore this version</button>
        <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
};

export default function ExamHistoryPage({ examId }) {
  const { service, user, canEdit, exams } = useEditing();
  const [versions, setVersions] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const exam = (exams || []).find((e) => e.id === examId);

  useEffect(() => {
    if (!service) return undefined;
    let cancelled = false;
    service.history(examId).then((v) => { if (!cancelled) setVersions(v); });
    return () => { cancelled = true; };
    // Re-read when the published exam changes (a publish or restore).
  }, [service, examId, exam?.version]);

  if (!versions) return <p>Loading history…</p>;

  return (
    <div className="edit-page">
      <header className="edit-header">
        <h1>History: {exam?.name || examId}</h1>
        <p className="muted">
          Every published change is listed, newest first. Drafts are not listed because they never
          change what people see in Find an exam.
        </p>
        <p className="action-row">
          <a className="secondary-link" href={examHref(examId)}>View in Find an exam</a>
          {canEdit && <a className="secondary-link" href={editHref(examId)}>Edit this exam</a>}
        </p>
      </header>
      <ol className="history-list">
        {versions.map((v, i) => (
          <li key={v.version} className="history-item">
            <div className="history-head">
              <h2>
                Version {v.version}
                {i === 0 && <span className="tag tag--current">Live now</span>}
              </h2>
              <p className="muted">
                {formatWhen(v.publishedAt)} · {v.publishedBy?.name || 'Unknown'}
              </p>
            </div>
            <p className="history-note">“{v.changeNote}”</p>
            {v.restoredFrom && <p className="muted">Restored from version {v.restoredFrom}.</p>}
            {v.version > 1 && <AffectsTags affects={v.affects || []} />}
            {v.changes?.length > 0 && (
              <details>
                <summary>What changed</summary>
                <ChangeList changes={v.changes} />
              </details>
            )}
            {canEdit && i > 0 && restoring !== v.version && (
              <button type="button" className="button-secondary" onClick={() => setRestoring(v.version)}>
                Restore this version…
              </button>
            )}
            {restoring === v.version && (
              <RestoreForm
                version={v}
                onCancel={() => setRestoring(null)}
                onRestore={async (note) => {
                  await service.restoreVersion(user, examId, v.version, note);
                  setRestoring(null);
                }}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
