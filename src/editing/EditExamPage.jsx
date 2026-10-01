// EditExamPage — draft → preview → publish for one exam.
//
// Step 1 (Edit): a form. Changes save to a private draft as you type; lookups
// keep showing the published version.
// Step 2 (Preview): the draft exactly as Find an exam will show it, what will
// change, anything that must be fixed, and the change note.
// Publishing makes it live at once and adds a version to History.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useEditing, facilityNames } from './context';
import { getFacilities, getCategories } from '../lookup/examSource';
import ExamDetail from '../lookup/ExamDetail';
import { examContent, FACILITY_STATUS_LABEL, AFFECTS_LABEL, fieldLabel } from './examFields';
import { errorsFor, MIN_CHANGE_NOTE } from './validation';
import { conflictsForExam } from './conflicts';
import { examHref, historyHref, SIGN_IN_HREF, ATTENTION_HREF } from './routes';
import { formatWhen } from './format';

const LIST_FIELDS = ['aliases', 'orderables', 'scheduling', 'clinicalReview'];

// Lists are edited as text, one item per line, so typing a new line works.
const toForm = (content) => ({
  ...content,
  ...Object.fromEntries(LIST_FIELDS.map((k) => [k, content[k].join('\n')])),
});
const fromForm = (form) =>
  examContent({ ...form, ...Object.fromEntries(LIST_FIELDS.map((k) => [k, form[k].split('\n')])) });

export const AffectsTags = ({ affects }) =>
  affects.length ? (
    <span className="tag-row">
      {affects.map((a) => <span key={a} className={`tag tag--${a}`}>{AFFECTS_LABEL[a]}</span>)}
    </span>
  ) : (
    <span className="tag-row"><span className="tag">Doesn't change lookups</span></span>
  );

export const ChangeList = ({ changes }) => (
  <ul className="change-list">
    {changes.map((c) => (
      <li key={c.field}>
        <strong>{c.label}</strong>
        <ul>{c.details.map((d) => <li key={d}>{d}</li>)}</ul>
      </li>
    ))}
  </ul>
);

const FieldErrors = ({ errors, field, id }) => {
  const msgs = errorsFor(errors, field);
  if (!msgs.length) return null;
  return (
    <div className="field-errors" id={id}>
      {msgs.map((m) => <p key={m}>{m}</p>)}
    </div>
  );
};

const TextList = ({ id, label, help, value, onChange, errors, field, mono }) => (
  <div className="field">
    <label htmlFor={id}>{label}</label>
    <p className="field-help" id={`${id}-help`}>{help}</p>
    <textarea
      id={id}
      className={mono ? 'mono' : undefined}
      rows={Math.max(3, value.split('\n').length + 1)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-describedby={`${id}-help${errorsFor(errors, field).length ? ` ${id}-err` : ''}`}
      aria-invalid={errorsFor(errors, field).length ? 'true' : undefined}
    />
    <FieldErrors errors={errors} field={field} id={`${id}-err`} />
  </div>
);

const FacilityEditor = ({ facilities, onChange, errors }) => {
  const set = (facilityId, patch) =>
    onChange(facilities.map((f) => (f.facilityId === facilityId ? { ...f, ...patch } : f)));
  return (
    <fieldset className="facility-editor" aria-describedby="facilities-err">
      <legend>Where it's offered</legend>
      {facilities.map((f) => {
        const name = facilityNames[f.facilityId] || f.facilityId;
        return (
          <div key={f.facilityId} className="facility-row">
            <fieldset className="facility-choice">
              <legend>{name}</legend>
              {['yes', 'limited', 'no'].map((a) => (
                <label key={a} className={`radio-pill radio-pill--${a}`}>
                  <input
                    type="radio"
                    name={`avail-${f.facilityId}`}
                    value={a}
                    checked={f.availability === a}
                    onChange={() => set(f.facilityId, { availability: a })}
                  />
                  {FACILITY_STATUS_LABEL[a]}
                </label>
              ))}
            </fieldset>
            <label className="facility-note">
              <span className="visually-hidden">Note for {name}</span>
              <input
                type="text"
                placeholder={f.availability === 'limited' ? 'Required: explain the limits' : 'Note (optional)'}
                value={f.note}
                onChange={(e) => set(f.facilityId, { note: e.target.value })}
              />
            </label>
          </div>
        );
      })}
      <FieldErrors errors={errors} field="facilities" id="facilities-err" />
    </fieldset>
  );
};

function useDraft(examId) {
  const { service, user, canEdit } = useEditing();
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!service || !user || !canEdit) return undefined;
    let cancelled = false;
    service.startDraft(user, examId).then(
      (d) => { if (!cancelled) setDraft(d); },
      (e) => { if (!cancelled) setLoadError(e.message); },
    );
    return () => { cancelled = true; };
  }, [service, user, canEdit, examId]);

  return { draft, setDraft, loadError };
}

export default function EditExamPage({ examId }) {
  const { service, user, canEdit, checked, exams, conflicts } = useEditing();
  const { draft, setDraft, loadError } = useDraft(examId);
  const [formState, setForm] = useState(null);
  const [step, setStep] = useState('edit');
  const [saveState, setSaveState] = useState('');
  const [preview, setPreview] = useState(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState(null);
  const [published, setPublished] = useState(null);
  const saveTimer = useRef(null);
  const headingRef = useRef(null);
  const form = formState ?? (draft ? toForm(draft.content) : null);
  const ids = { name: useId(), category: useId(), parent: useId(), aliases: useId(), orderables: useId(), sch: useId(), cr: useId(), note: useId() };

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const save = useCallback(async (nextForm) => {
    try {
      const d = await service.saveDraft(user, examId, fromForm(nextForm));
      setDraft(d);
      setSaveState(`Draft saved ${formatWhen(d.updatedAt)}`);
    } catch (e) {
      setSaveState(`Not saved: ${e.message}`);
    }
  }, [service, user, examId, setDraft]);

  const update = (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    setSaveState('Saving…');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 500);
  };

  const flush = async () => {
    clearTimeout(saveTimer.current);
    await save(form);
  };

  const goPreview = async () => {
    await flush();
    const p = await service.previewDraft(user, examId);
    setPreview(p);
    setErrors(p.errors);
    setMessage(null);
    setStep('preview');
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const backToEdit = () => {
    setStep('edit');
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const publish = async (e) => {
    e.preventDefault();
    try {
      const result = await service.publish(user, examId, note);
      setPublished(result);
      setStep('done');
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (err) {
      if (err.code === 'invalid') {
        setErrors(err.errors);
        setMessage({ tone: 'error', text: err.message });
      } else if (err.code === 'stale') {
        setPreview(await service.previewDraft(user, examId));
        setMessage({ tone: 'error', text: err.message });
      } else {
        setMessage({ tone: 'error', text: err.message });
      }
    }
  };

  const updateToLatest = async () => {
    const { draft: d, overlapping } = await service.updateDraftToLatest(user, examId);
    setDraft(d);
    setForm(toForm(d.content));
    const p = await service.previewDraft(user, examId);
    setPreview(p);
    setErrors(p.errors);
    setMessage({
      tone: overlapping.length ? 'warn' : 'ok',
      text: overlapping.length
        ? `Your draft now includes their changes. You both changed: ${overlapping.map(fieldLabel).join(', ')}. Your version of those is kept; check it before publishing.`
        : 'Your draft now includes their changes. Your own edits are kept.',
    });
  };

  // Two-step discard on the page itself (browser confirm dialogs are not
  // available everywhere this runs).
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const discard = async () => {
    await service.discardDraft(user, examId);
    window.location.hash = draft?.isNew ? '#find' : examHref(examId);
  };

  const parentOptions = useMemo(
    () => (exams || []).filter((e) => e.kind !== 'protocol' && e.id !== examId).sort((a, b) => a.name.localeCompare(b.name)),
    [exams, examId],
  );

  if (!checked) return <p>Checking your access…</p>;
  if (!user || !canEdit) {
    return (
      <section className="notice-panel">
        <h1>{user ? "You can't edit exams" : 'Sign in to edit'}</h1>
        <p>{user ? 'Your account is not on the supervisor list, so you can look exams up but not change them.' : 'Only supervisors can change guidance.'}</p>
        {!user && <p><a className="link-button" href={SIGN_IN_HREF}>Supervisor sign-in</a></p>}
      </section>
    );
  }
  if (loadError) return <section className="notice-panel"><h1>Can't edit this exam</h1><p>{loadError}</p></section>;
  if (!draft || !form) return <p>Opening your draft…</p>;

  const content = fromForm(form);
  const title = content.name || 'New exam';
  const myConflicts = conflictsForExam(conflicts, examId);

  if (step === 'done') {
    return (
      <section className="notice-panel" aria-labelledby="published-title">
        <h1 id="published-title" tabIndex={-1} ref={headingRef}>Published</h1>
        <p>
          <strong>{published.exam.name}</strong> is live. Find an exam now shows version {published.exam.version}.
        </p>
        <AffectsTags affects={published.version.affects} />
        <p className="action-row">
          <a className="button-primary" href={examHref(examId)}>View it in Find an exam</a>
          <a className="secondary-link" href={historyHref(examId)}>See history</a>
        </p>
      </section>
    );
  }

  const staleBanner = preview?.stale && (
    <div className="edit-banner edit-banner--warn" role="alert">
      <p>
        <strong>Someone published a newer version after you started.</strong>{' '}
        {preview.newer.map((v) => `${v.publishedBy?.name} (${formatWhen(v.publishedAt)}): "${v.changeNote}"`).join('; ')}
      </p>
      {!draft.isNew && (
        <button type="button" className="button-secondary" onClick={updateToLatest}>
          Update my draft to the latest
        </button>
      )}
    </div>
  );

  return (
    <div className="edit-page">
      <header className="edit-header">
        <h1 tabIndex={-1} ref={headingRef}>
          {step === 'edit' ? `Editing: ${title}` : `Preview: ${title}`}
        </h1>
        <p className="edit-banner" role="note">
          <strong>Draft, not live.</strong> Only you can see this draft. Find an exam keeps showing the
          published version until you publish.
        </p>
        <p className="edit-steps" aria-label="Steps">
          <span className={step === 'edit' ? 'is-current' : ''}>1. Edit</span>
          <span className={step === 'preview' ? 'is-current' : ''}>2. Preview and publish</span>
        </p>
      </header>

      {myConflicts.length > 0 && (
        <div className="edit-banner edit-banner--warn">
          <p><strong>Needs attention:</strong></p>
          <ul>{myConflicts.map((c) => <li key={c.key}>{c.message}</li>)}</ul>
          <p className="muted">Fix it here, or <a className="link-button" href={ATTENTION_HREF}>mark it as intended</a>.</p>
        </div>
      )}

      {step === 'edit' && (
        <form className="edit-form" onSubmit={(e) => { e.preventDefault(); goPreview(); }}>
          <section className="edit-section">
            <h2>Basics</h2>
            <div className="field">
              <label htmlFor={ids.name}>Exam name</label>
              <input id={ids.name} type="text" value={form.name} onChange={(e) => update({ name: e.target.value })}
                aria-invalid={errorsFor(errors, 'name').length ? 'true' : undefined} />
              <FieldErrors errors={errors} field="name" />
            </div>
            <fieldset className="field">
              <legend>Type</legend>
              <label className="radio-line">
                <input type="radio" name="kind" checked={form.kind === 'exam'} onChange={() => update({ kind: 'exam', parentId: null })} />
                Regular exam
              </label>
              <label className="radio-line">
                <input type="radio" name="kind" checked={form.kind === 'protocol'} onChange={() => update({ kind: 'protocol' })} />
                Special protocol (ordered under another exam, with its own rules)
              </label>
            </fieldset>
            {form.kind === 'protocol' && (
              <div className="field">
                <label htmlFor={ids.parent}>Ordered under (parent exam)</label>
                <select id={ids.parent} value={form.parentId || ''} onChange={(e) => update({ parentId: e.target.value || null })}>
                  <option value="">Choose the parent exam</option>
                  {parentOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <FieldErrors errors={errors} field="parentId" />
              </div>
            )}
            <div className="field">
              <label htmlFor={ids.category}>Exam type</label>
              <select id={ids.category} value={form.category} onChange={(e) => update({ category: e.target.value })}>
                <option value="">Choose a type</option>
                {getCategories().map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <FieldErrors errors={errors} field="category" />
            </div>
            <label className="radio-line">
              <input type="checkbox" checked={!form.active} onChange={(e) => update({ active: !e.target.checked })} />
              Retire this exam (hide it from Find an exam)
            </label>
          </section>

          <section className="edit-section">
            <h2>How people find it</h2>
            <TextList
              id={ids.aliases} field="aliases" errors={errors} label="Search words"
              help={form.kind === 'protocol'
                ? 'Everyday words that should find this protocol, one per line. Include at least one word that sets it apart from its parent exam (for example "MAKO").'
                : 'Everyday words people type to find this exam, one per line (for example "ct knee").'}
              value={form.aliases} onChange={(v) => update({ aliases: v })}
            />
            <TextList
              id={ids.orderables} field="orderables" errors={errors} label="Order names" mono
              help={form.kind === 'protocol'
                ? 'How it appears on the order, one per line. For a special protocol these are shown for reference only and never used to find it, so general orders cannot match this protocol.'
                : 'How it appears on the order (Epic orderable), one per line. Searching these also finds this exam.'}
              value={form.orderables} onChange={(v) => update({ orderables: v })}
            />
          </section>

          <section className="edit-section">
            <h2>Guidance</h2>
            <TextList id={ids.sch} field="scheduling" errors={errors} label="Scheduling"
              help="One instruction per line. Each line shows as a bullet."
              value={form.scheduling} onChange={(v) => update({ scheduling: v })} />
            <TextList id={ids.cr} field="clinicalReview" errors={errors} label="Clinical review"
              help="One instruction per line. Each line shows as a bullet."
              value={form.clinicalReview} onChange={(v) => update({ clinicalReview: v })} />
          </section>

          <section className="edit-section">
            <h2>Facilities</h2>
            <FacilityEditor facilities={form.facilities} errors={errors} onChange={(facilities) => update({ facilities })} />
          </section>

          <div className="action-row action-row--sticky">
            <button type="submit" className="button-primary">Preview and publish</button>
            {confirmDiscard ? (
              <>
                <button type="button" className="button-danger" onClick={discard}>Yes, discard my draft</button>
                <button type="button" className="button-secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
              </>
            ) : (
              <button type="button" className="button-secondary" onClick={() => setConfirmDiscard(true)}>Discard draft</button>
            )}
            <span className="save-state" role="status" aria-live="polite">
              {confirmDiscard ? 'Discarding removes your changes. The published version stays as it is.' : saveState}
            </span>
          </div>
        </form>
      )}

      {step === 'preview' && preview && (
        <div className="preview-layout">
          {staleBanner}
          {errors.length > 0 && (
            <div className="edit-banner edit-banner--error" role="alert">
              <p><strong>Fix these before publishing:</strong></p>
              <ul>{errors.filter((e) => e.field !== 'changeNote').map((e) => <li key={e.field + e.message}>{e.message}</li>)}</ul>
              <button type="button" className="button-secondary" onClick={backToEdit}>Back to editing</button>
            </div>
          )}

          <section className="edit-section" aria-labelledby="what-changes">
            <h2 id="what-changes">What changes when you publish</h2>
            {preview.changes.length === 0 ? (
              <p className="muted">Nothing has changed yet compared with the published version.</p>
            ) : (
              <>
                <AffectsTags affects={preview.affects} />
                <ChangeList changes={preview.changes} />
              </>
            )}
          </section>

          <section className="edit-section" aria-labelledby="looks-like">
            <h2 id="looks-like">How it will look in Find an exam</h2>
            <div className="detail-pane detail-pane--static">
              <ExamDetail
                exam={{ ...content, id: examId, lastReviewed: new Date().toISOString().slice(0, 10) }}
                exams={[...(exams || []).filter((e) => e.id !== examId), { ...content, id: examId }]}
                facilities={getFacilities()}
                facilityId=""
                onOpenExam={() => {}}
              />
            </div>
          </section>

          <form className="edit-section edit-form" onSubmit={publish} aria-labelledby="publish-title">
            <h2 id="publish-title">Publish</h2>
            <div className="field">
              <label htmlFor={ids.note}>Why are you making this change?</label>
              <p className="field-help" id={`${ids.note}-help`}>
                Shown in History so others know what changed and why. At least {MIN_CHANGE_NOTE} characters.
              </p>
              <textarea id={ids.note} rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                aria-describedby={`${ids.note}-help`}
                aria-invalid={errorsFor(errors, 'changeNote').length ? 'true' : undefined} />
              <FieldErrors errors={errors} field="changeNote" />
            </div>
            {message && <p className={`form-message form-message--${message.tone}`} role="alert">{message.text}</p>}
            <p className="muted">Publishing makes this live right away for everyone using Find an exam.</p>
            <div className="action-row">
              <button type="submit" className="button-primary">Publish now</button>
              <button type="button" className="button-secondary" onClick={backToEdit}>Back to editing</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
