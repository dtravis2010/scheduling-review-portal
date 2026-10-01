// EditingRoute — picks the editing screen for an editing hash route.
import { useEditing } from './context';
import { parseEditingHash } from './routes';
import EditExamPage from './EditExamPage';
import NewExamPage from './NewExamPage';
import ExamHistoryPage from './ExamHistoryPage';
import AttentionPage from './AttentionPage';
import DraftsPage from './DraftsPage';
import SupervisorsPage from './SupervisorsPage';
import SignInPage from './SignInPage';

export default function EditingRoute({ hash }) {
  const ctx = useEditing();
  const route = parseEditingHash(hash);
  if (!route) return null;
  if (ctx.error) return <p className="form-message form-message--error">Editing is unavailable: {ctx.error}</p>;
  if (!ctx.backend || !ctx.exams) return <p>Loading…</p>;
  switch (route.name) {
    case 'edit': return <EditExamPage key={route.id} examId={route.id} />;
    case 'new': return <NewExamPage key={route.id} parentId={route.id} />;
    case 'history': return <ExamHistoryPage key={route.id} examId={route.id} />;
    case 'attention': return <AttentionPage />;
    case 'drafts': return <DraftsPage />;
    case 'supervisors': return <SupervisorsPage />;
    case 'sign-in': return <SignInPage />;
    default: return null;
  }
}
