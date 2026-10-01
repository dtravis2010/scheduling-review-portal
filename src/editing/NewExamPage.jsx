// NewExamPage — start a draft for a new exam or special protocol.
import { useId, useState } from 'react';
import { useEditing } from './context';
import { editHref, SIGN_IN_HREF } from './routes';

export default function NewExamPage({ parentId: initialParent = '' }) {
  const { service, user, canEdit, checked, exams } = useEditing();
  const [kind, setKind] = useState(initialParent ? 'protocol' : 'exam');
  const [parentId, setParentId] = useState(initialParent);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const ids = { name: useId(), parent: useId() };

  if (!checked) return <p>Checking your access…</p>;
  if (!user || !canEdit) {
    return (
      <section className="notice-panel">
        <h1>Sign in to add exams</h1>
        <p>Only supervisors can add exams.</p>
        {!user && <p><a className="link-button" href={SIGN_IN_HREF}>Supervisor sign-in</a></p>}
      </section>
    );
  }

  const parents = (exams || []).filter((e) => e.kind !== 'protocol').sort((a, b) => a.name.localeCompare(b.name));

  const start = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Enter a name for the new exam.'); return; }
    if (kind === 'protocol' && !parentId) { setError('Choose the exam this protocol is ordered under.'); return; }
    const d = await service.startNewExamDraft(user, { name, kind, parentId: kind === 'protocol' ? parentId : null });
    window.location.hash = editHref(d.examId);
  };

  return (
    <section className="notice-panel" aria-labelledby="new-title">
      <h1 id="new-title">Add an exam</h1>
      <p className="muted">This starts a private draft. Nothing is live until you publish it.</p>
      <form className="edit-form" onSubmit={start}>
        <fieldset className="field">
          <legend>What are you adding?</legend>
          <label className="radio-line">
            <input type="radio" name="new-kind" checked={kind === 'exam'} onChange={() => setKind('exam')} /> A regular exam
          </label>
          <label className="radio-line">
            <input type="radio" name="new-kind" checked={kind === 'protocol'} onChange={() => setKind('protocol')} />
            A special protocol ordered under an existing exam
          </label>
        </fieldset>
        {kind === 'protocol' && (
          <div className="field">
            <label htmlFor={ids.parent}>Ordered under</label>
            <select id={ids.parent} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Choose the parent exam</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor={ids.name}>Name</label>
          <input id={ids.name} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
        <div className="action-row">
          <button type="submit" className="button-primary">Start draft</button>
        </div>
      </form>
    </section>
  );
}
