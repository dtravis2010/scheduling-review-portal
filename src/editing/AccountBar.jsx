// AccountBar — the small strip above every page once someone signs in: who
// they are and the few editing links a supervisor needs. Signed-out visitors
// see nothing here; sign-in lives behind "Edit / Review tools".
import { useEffect, useState } from 'react';
import { useEditing } from './context';
import { ATTENTION_HREF, DRAFTS_HREF, SUPERVISORS_HREF, newExamHref } from './routes';

export default function AccountBar() {
  const { backend, service, user, canEdit, canManage, checked, conflicts } = useEditing() || {};
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    if (!service || !user || !canEdit) return undefined;
    let cancelled = false;
    const load = () => service.listMyDrafts(user).then((d) => { if (!cancelled) setDraftCount(d.length); });
    load();
    const off = backend.store.subscribe ? backend.store.subscribe(load) : () => {};
    return () => { cancelled = true; off(); };
  }, [service, backend, user, canEdit]);

  if (!backend || !user) return null;

  return (
    <nav className="account-bar" aria-label="Supervisor tools">
      {(
        <>
          <span className="account-name">
            Signed in as <strong>{user.name}</strong>
            {checked && !canEdit && <span className="muted"> (view only)</span>}
          </span>
          {canEdit && (
            <>
              <a className="secondary-link" href={DRAFTS_HREF}>
                My drafts{draftCount ? ` (${draftCount})` : ''}
              </a>
              <a className="secondary-link" href={ATTENTION_HREF}>
                Needs attention{conflicts.length ? ` (${conflicts.length})` : ''}
              </a>
              <a className="secondary-link" href={newExamHref()}>Add an exam</a>
            </>
          )}
          {canManage && <a className="secondary-link" href={SUPERVISORS_HREF}>Supervisors</a>}
          <button type="button" className="link-button account-signout" onClick={() => backend.signOut()}>
            Sign out
          </button>
        </>
      )}
    </nav>
  );
}
