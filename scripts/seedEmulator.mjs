// Loads the fictional sample exams and fictional supervisors into the LOCAL
// Firestore emulator (project demo-scheduling-review). Run through
// `npm run dev:emulator`; it refuses to run without the emulator.
/* global process */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { SAMPLE_EXAMS } from '../src/lookup/sampleExams.js';
import { PREVIEW_SUPERVISORS } from '../src/editing/previewPeople.js';

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort) {
  console.error('FIRESTORE_EMULATOR_HOST is not set. Run this through `npm run dev:emulator`.');
  process.exit(1);
}
const [host, port] = hostPort.split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-scheduling-review', firestore: { host, port: Number(port) } });

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const s of PREVIEW_SUPERVISORS) await setDoc(doc(db, 'supervisors', s.email), s);
  for (const e of SAMPLE_EXAMS) {
    const at = `${e.lastReviewed}T12:00:00Z`;
    const exam = { parentId: null, active: true, acknowledged: {}, ...e, version: 1, updatedAt: at, updatedBy: { name: 'Sample data' } };
    await setDoc(doc(db, 'exams', e.id), exam);
    await setDoc(doc(db, 'examVersions', `${e.id}__v1`), {
      examId: e.id, version: 1, snapshot: exam, changeNote: 'Sample data loaded', changes: [], affects: [],
      publishedBy: { name: 'Sample data' }, publishedAt: at, restoredFrom: null, acknowledgedConflict: null,
    });
  }
});
await env.cleanup();
console.log(`Seeded ${SAMPLE_EXAMS.length} sample exams and ${PREVIEW_SUPERVISORS.length} fictional supervisors.`);
