// ExamFooter — shown under an exam in Find an exam: any conflict flag, and the
// History / Edit links. Edit appears only for signed-in supervisors.
import { useEditing } from './context';
import { conflictsForExam } from './conflicts';
import { editHref, historyHref, newExamHref } from './routes';
import { formatWhen } from './format';

export default function ExamFooter({ exam }) {
  const { conflicts, canEdit } = useEditing() || {};
  if (!conflicts) return null;
  const mine = conflictsForExam(conflicts, exam.id);
  return (
    <div className="exam-footer">
      {mine.length > 0 && (
        <div className="callout callout--warn" role="note">
          <p><strong>Supervisors are checking this guidance.</strong></p>
          <ul>{mine.map((c) => <li key={c.key}>{c.message}</li>)}</ul>
        </div>
      )}
      <p className="exam-footer-links">
        {exam.updatedBy?.name && exam.version > 1 && (
          <span className="muted">Last changed by {exam.updatedBy.name}, {formatWhen(exam.updatedAt)}. </span>
        )}
        <a className="secondary-link" href={historyHref(exam.id)}>History</a>
        {canEdit && <a className="secondary-link" href={editHref(exam.id)}>Edit this exam</a>}
        {canEdit && exam.kind !== 'protocol' && (
          <a className="secondary-link" href={newExamHref(exam.id)}>Add a special protocol</a>
        )}
      </p>
    </div>
  );
}
