import { useId, useMemo, useRef, useState } from 'react';
import { searchExams, availabilityAt } from './search';
import { SAMPLE_EXAMS, FACILITIES, CATEGORIES } from './sampleExams';
import ExamDetail from './ExamDetail';
import { AvailabilityBadge } from './Availability';

// This milestone's lookup always runs on the fictional sample set. Swapping in
// a real, approved dataset means replacing these three imports.
const EXAMS = SAMPLE_EXAMS;

const MATCH_LABEL = {
  alias: 'Common wording',
  orderable: 'Order name',
};

const ResultItem = ({ match, facilityId, selected, onSelect }) => {
  const { exam, matchedOn, matchedText } = match;
  return (
    <li>
      <button
        type="button"
        className={`result-item${selected ? ' is-selected' : ''}`}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(exam.id)}
      >
        <span className="result-name">{exam.name}</span>
        <span className="result-meta">
          <span className="pill">{exam.category}</span>
          {exam.kind === 'protocol' && <span className="pill pill--protocol">Special protocol</span>}
          {facilityId && <AvailabilityBadge availability={availabilityAt(exam, facilityId).availability} compact />}
        </span>
        {MATCH_LABEL[matchedOn] && (
          <span className="result-why">
            {MATCH_LABEL[matchedOn]}: “{matchedText}”
          </span>
        )}
      </button>
    </li>
  );
};

const FindExam = ({ reviewHref }) => {
  const [query, setQuery] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [category, setCategory] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [mobileView, setMobileView] = useState('list');
  const detailRef = useRef(null);
  const ids = { search: useId(), facility: useId(), category: useId(), count: useId() };

  const { results, notOfferedAtFacility } = useMemo(
    () => searchExams(EXAMS, { query, facilityId, category }),
    [query, facilityId, category],
  );

  const visible = showHidden ? [...results, ...notOfferedAtFacility] : results;
  const selected =
    EXAMS.find((e) => e.id === selectedId && visible.some((m) => m.exam.id === e.id)) ||
    visible[0]?.exam ||
    null;
  const facilityName = FACILITIES.find((f) => f.id === facilityId)?.name;

  const openExam = (id) => {
    setSelectedId(id);
    setMobileView('detail');
    // Move focus to the guidance so keyboard and screen-reader users land on it.
    requestAnimationFrame(() => detailRef.current?.focus());
  };

  const clearAll = () => {
    setQuery('');
    setFacilityId('');
    setCategory('');
    setShowHidden(false);
  };

  const hasFilters = query || facilityId || category;
  const countText =
    results.length === 1 ? '1 exam' : `${results.length} exams`;

  return (
    <div className="lookup-page">
      <header className="lookup-header">
        <div>
          <h1>Find an exam</h1>
          <p className="lookup-subtitle">Scheduling and clinical review guidance, by exam and facility.</p>
        </div>
        <a className="secondary-link" href={reviewHref}>
          Edit / Review tools
        </a>
      </header>

      <p className="sample-banner" role="note">
        <strong>Sample data.</strong> Every exam, facility and instruction here is made up for
        this preview. Do not use it for real scheduling.
      </p>

      <form className="lookup-controls" role="search" aria-label="Find an exam" onSubmit={(e) => e.preventDefault()}>
        <div className="field field--search">
          <label htmlFor={ids.search}>Exam name or common wording</label>
          <div className="search-wrap">
            <input
              id={ids.search}
              type="search"
              className="search-input"
              placeholder="For example: CT knee, MAKO, DVT study, mammo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-describedby={ids.count}
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={ids.facility}>Facility</label>
          <select
            id={ids.facility}
            value={facilityId}
            onChange={(e) => {
              setFacilityId(e.target.value);
              setShowHidden(false);
            }}
          >
            <option value="">All facilities</option>
            {FACILITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={ids.category}>Exam type</label>
          <select id={ids.category} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All exam types</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </form>

      <p id={ids.count} className="result-count" aria-live="polite">
        {countText}
        {facilityName ? ` offered at ${facilityName}` : ''}
        {hasFilters && (
          <>
            {' · '}
            <button type="button" className="link-button" onClick={clearAll}>
              Clear search
            </button>
          </>
        )}
      </p>

      <div className={`lookup-layout lookup-layout--${mobileView}`}>
        <section className="results-pane" aria-label="Results">
          {visible.length > 0 && (
            <ul className="result-list">
              {visible.map((m) => (
                <ResultItem
                  key={m.exam.id}
                  match={m}
                  facilityId={facilityId}
                  selected={selected?.id === m.exam.id}
                  onSelect={openExam}
                />
              ))}
            </ul>
          )}

          {results.length === 0 && notOfferedAtFacility.length === 0 && (
            <div className="empty-state">
              <p><strong>No exams match “{query}”.</strong></p>
              <p>Try fewer words, a body part (for example “knee”), or clear the filters.</p>
            </div>
          )}

          {notOfferedAtFacility.length > 0 && (
            <div className="hidden-note">
              {results.length === 0 && <p><strong>None of the matches are offered at {facilityName}.</strong></p>}
              <button type="button" className="link-button" onClick={() => setShowHidden((v) => !v)}>
                {showHidden
                  ? `Hide ${notOfferedAtFacility.length} not offered at ${facilityName}`
                  : `Show ${notOfferedAtFacility.length} more not offered at ${facilityName}`}
              </button>
            </div>
          )}
        </section>

        <section
          className="detail-pane"
          aria-label="Exam guidance"
          tabIndex={-1}
          ref={detailRef}
        >
          <button type="button" className="back-button" onClick={() => setMobileView('list')}>
            ← Back to results
          </button>
          {selected ? (
            <ExamDetail
              exam={selected}
              exams={EXAMS}
              facilities={FACILITIES}
              facilityId={facilityId}
              onOpenExam={openExam}
            />
          ) : (
            <p className="empty-state">Pick an exam to see its guidance.</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default FindExam;
