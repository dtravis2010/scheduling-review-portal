// DraftsPage — the signed-in supervisor's unpublished drafts.
import { useEffect, useState } from 'react';
import { useEditing } from './context';
import { editHref } from './routes';
import { formatWhen } from './format';

export default function DraftsPage() {
  const { service, user, exams } = useEditing();
  const [drafts, setDrafts] = useState(null);

  useEffect(() => {
    if (!service || !user) return undefined;
    let cancelled = false;
    service.listMyDrafts(user).then((d) => { if (!cancelled) setDrafts(d); });
    return () => { cancelled = true; };
  }, [service, user]);

  if (!user) return <p>Sign in to see your drafts.</p>;
  if (!drafts) return <p>Loading your drafts…</p>;

  return (
    <div className="edit-page">
      <header className="edit-header">
        <h1>My drafts</h1>
        <p className="muted">Drafts are private and not live. Publish one to make it show in Find an exam.</p>
      </header>
      {drafts.length === 0 && <p className="empty-state">You have no drafts.</p>}
      <ul className="history-list">
        {drafts.map((d) => {
          const live = exams?.find((e) => e.id === d.examId);
          const stale = live && live.version !== d.baseVersion;
          return (
            <li key={d.examId} className="history-item">
              <h2>{d.content.name || 'Untitled exam'}{d.isNew && <span className="tag">New</span>}</h2>
              <p className="muted">Last saved {formatWhen(d.updatedAt)}</p>
              {stale && <p className="form-message form-message--warn">Someone published a newer version since you started this draft.</p>}
              <a className="button-secondary" href={editHref(d.examId)}>Continue editing</a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
