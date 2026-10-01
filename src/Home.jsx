import { lazy, Suspense, useEffect, useState } from 'react';
import FindExam from './lookup/FindExam';
import './lookup/lookup.css';

// Data mode is chosen at build time:
//   sample (default): fictional sample exams only. The existing Edit / Review
//                     tools are left out and Firebase is never bundled, so the
//                     build cannot read or write the live database.
//   live:             VITE_DATA_MODE=live npm run build — also includes the
//                     existing Edit / Review tools, which use live Firestore.
// Keep the env check inline: Vite replaces it with a constant, so the bundler
// drops the import. Moving it into a variable from another module stops that.
const ReviewTools =
  import.meta.env.VITE_DATA_MODE === 'live' ? lazy(() => import('./App.jsx')) : null;

const REVIEW_HASH = '#review';

const useHashRoute = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
};

const BackLink = () => (
  <a className="secondary-link" href="#find">
    ← Back to Find an exam
  </a>
);

const ReviewToolsOff = () => (
  <main className="lookup-page">
    <BackLink />
    <section className="notice-panel" aria-labelledby="review-off-title">
      <h1 id="review-off-title">Edit and review tools are off in this preview</h1>
      <p>
        This preview uses made-up sample exams so it can be tried safely. The edit and
        review tools change live data, so they are turned off here.
      </p>
      <p>Nothing you do in this preview changes any real scheduling guidance.</p>
    </section>
  </main>
);

const Home = () => {
  const hash = useHashRoute();

  if (hash === REVIEW_HASH) {
    if (!ReviewTools) return <ReviewToolsOff />;
    return (
      <>
        <div className="lookup-page lookup-page--bar">
          <BackLink />
        </div>
        <Suspense fallback={<p className="lookup-page">Loading edit and review tools…</p>}>
          <ReviewTools />
        </Suspense>
      </>
    );
  }

  return <FindExam reviewHref={REVIEW_HASH} />;
};

export default Home;
