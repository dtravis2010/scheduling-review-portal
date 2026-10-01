// EditingHub — what "Edit / Review tools" opens: supervisor sign-in and the
// editing links. Kept off the homepage so lookups stay the main job.
import { useEditing } from './context';
import { ATTENTION_HREF, DRAFTS_HREF, SIGN_IN_HREF, SUPERVISORS_HREF, newExamHref } from './routes';

export default function EditingHub() {
  const { backend, user, canEdit, canManage, checked, conflicts } = useEditing();
  if (!backend) return null;
  return (
    <section className="notice-panel" aria-labelledby="hub-title">
      <h1 id="hub-title">Edit exam guidance</h1>
      {!user && (
        <>
          <p>Supervisors sign in to change guidance. Changes start as a private draft and go live when you publish.</p>
          <p><a className="button-primary" href={SIGN_IN_HREF}>Supervisor sign-in</a></p>
        </>
      )}
      {user && checked && !canEdit && (
        <p>You're signed in as {user.name}, but your account is not on the supervisor list, so you can look exams up but not change them.</p>
      )}
      {canEdit && (
        <>
          <p>To change an exam, open it in Find an exam and choose <strong>Edit this exam</strong>.</p>
          <ul className="hub-links">
            <li><a href={DRAFTS_HREF}>My drafts</a></li>
            <li><a href={ATTENTION_HREF}>Needs attention{conflicts.length ? ` (${conflicts.length})` : ''}</a></li>
            <li><a href={newExamHref()}>Add an exam or special protocol</a></li>
            {canManage && <li><a href={SUPERVISORS_HREF}>Supervisors</a></li>}
          </ul>
        </>
      )}
      {backend.mode === 'preview' && (
        <p className="muted hub-preview-note">
          Preview: edits are saved only in this browser and use made-up data.{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => { if (window.confirm('Put the sample data back and erase every change made in this browser?')) backend.resetPreview(); }}
          >
            Reset the preview
          </button>
        </p>
      )}
    </section>
  );
}
