// AttentionPage — guidance that disagrees between exams. Each item can be
// fixed (edit the exam) or marked as intended with a reason, which is
// recorded in that exam's History.
import { useId, useState } from 'react';
import { useEditing } from './context';
import { editHref, historyHref } from './routes';
import { MIN_CHANGE_NOTE } from './validation';

const TYPE_HELP = {
  'protocol-parent': 'A special protocol is offered where its parent exam is not.',
  'status-note': "A facility's availability and its note say opposite things.",
  'shared-orderable': 'The same order name is listed on unrelated exams, so it is unclear which guidance applies.',
};

const IntendedForm = ({ conflict, onDone }) => {
  const { service, user } = useEditing();
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await service.acknowledgeConflict(user, conflict.examIds[0], conflict, reason);
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form className="edit-form restore-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor={id}>Why is this correct as it is?</label>
        <p className="field-help" id={`${id}-help`}>Shown in History. At least {MIN_CHANGE_NOTE} characters.</p>
        <textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={`${id}-help`} />
      </div>
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      <div className="action-row">
        <button type="submit" className="button-primary" disabled={reason.trim().length < MIN_CHANGE_NOTE}>Mark as intended</button>
        <button type="button" className="button-secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
};

export default function AttentionPage() {
  const { conflicts, exams, canEdit } = useEditing();
  const [open, setOpen] = useState('');
  const name = (id) => exams?.find((e) => e.id === id)?.name || id;

  return (
    <div className="edit-page">
      <header className="edit-header">
        <h1>Needs attention</h1>
        <p className="muted">
          Guidance that disagrees between exams. Fix the exam that is wrong, or mark it as intended
          with a short reason. Either way it is recorded in History.
        </p>
      </header>
      {conflicts.length === 0 && <p className="empty-state">Nothing needs attention right now.</p>}
      <ul className="history-list">
        {conflicts.map((c) => (
          <li key={c.key} className="history-item">
            <p className="muted">{TYPE_HELP[c.type]}</p>
            <p><strong>{c.message}</strong></p>
            {canEdit && (
              <div className="action-row">
                {c.examIds.map((id) => (
                  <a key={id} className="button-secondary" href={editHref(id)}>Fix {name(id)}</a>
                ))}
                {open !== c.key && (
                  <button type="button" className="button-secondary" onClick={() => setOpen(c.key)}>Mark as intended…</button>
                )}
                <a className="secondary-link" href={historyHref(c.examIds[0])}>History</a>
              </div>
            )}
            {open === c.key && <IntendedForm conflict={c} onDone={() => setOpen('')} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
