import { availabilityAt, protocolsFor } from './search';
import { AvailabilityBadge } from './Availability';

const GuidanceList = ({ title, items }) => (
  <section className="guidance-block">
    <h3>{title}</h3>
    {items.length ? (
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="muted">No guidance recorded.</p>
    )}
  </section>
);

const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const ExamDetail = ({ exam, exams, facilities, facilityId, onOpenExam, footer = null }) => {
  const parent = exam.kind === 'protocol' ? exams.find((e) => e.id === exam.parentId) : null;
  const protocols = protocolsFor(exams, exam.id);
  const selectedAvailability = facilityId ? availabilityAt(exam, facilityId) : null;
  const facilityName = facilities.find((f) => f.id === facilityId)?.name;

  return (
    <article className="exam-detail" aria-labelledby={`exam-${exam.id}`}>
      <div className="detail-head">
        <h2 id={`exam-${exam.id}`}>{exam.name}</h2>
        <div className="result-meta">
          <span className="pill">{exam.category}</span>
          {parent && <span className="pill pill--protocol">Special protocol</span>}
        </div>
      </div>

      {selectedAvailability && (
        <p className={`facility-answer facility-answer--${selectedAvailability.availability}`}>
          <AvailabilityBadge availability={selectedAvailability.availability} /> at {facilityName}
          {selectedAvailability.note && <span>. {selectedAvailability.note}</span>}
        </p>
      )}

      {parent && (
        <div className="callout callout--protocol">
          <p>
            <strong>This is a special protocol, not a routine exam.</strong> It is ordered as{' '}
            <button type="button" className="link-button" onClick={() => onOpenExam(parent.id)}>
              {parent.name}
            </button>
            , but it has its own rules and is offered at fewer facilities. Check availability below
            before booking.
          </p>
        </div>
      )}

      {protocols.length > 0 && (
        <div className="callout">
          <p>
            <strong>Has a special protocol with different rules:</strong>{' '}
            {protocols.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <button type="button" className="link-button" onClick={() => onOpenExam(p.id)}>
                  {p.name}
                </button>
              </span>
            ))}
            . If the order mentions it, use that page instead.
          </p>
        </div>
      )}

      <div className="guidance-grid">
        <GuidanceList title="Scheduling" items={exam.scheduling} />
        <GuidanceList title="Clinical review" items={exam.clinicalReview} />
      </div>

      <section className="guidance-block">
        <h3>Where it’s offered</h3>
        <table className="facility-table">
          <caption className="visually-hidden">Facility availability for {exam.name}</caption>
          <thead>
            <tr>
              <th scope="col">Facility</th>
              <th scope="col">Availability</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map((f) => {
              const a = availabilityAt(exam, f.id);
              return (
                <tr key={f.id} className={f.id === facilityId ? 'is-selected' : undefined}>
                  <th scope="row">{f.name}</th>
                  <td>
                    <AvailabilityBadge availability={a.availability} />
                  </td>
                  <td>{a.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <details className="matching-details">
        <summary>How this exam is found and ordered</summary>
        <div className="matching-grid">
          <div>
            <h4>Search wording</h4>
            <p className="muted">Words supervisors type that find this {parent ? 'protocol' : 'exam'}.</p>
            <ul className="chip-list">
              {exam.aliases.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Order names</h4>
            <p className="muted">
              {parent
                ? `How it appears on the order. These are shared with ${parent.name}, so searching them shows ${parent.name}, not this protocol.`
                : 'How it appears on the order. Searching these also finds this exam.'}
            </p>
            <ul className="chip-list chip-list--mono">
              {exam.orderables.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <p className="muted reviewed">Guidance last reviewed {formatDate(exam.lastReviewed)}.</p>
      {footer}
    </article>
  );
};

export default ExamDetail;
