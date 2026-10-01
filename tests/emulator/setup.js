/* global process */
// Shared emulator setup. The project id starts with "demo-", which Firebase
// treats as offline-only, so these tests can never reach a real project.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc } from 'firebase/firestore';
import { SUPERVISORS, EXAMS } from '../../src/editing/test/fixtures.js';

export const PROJECT_ID = 'demo-scheduling-review';

export async function makeEnv() {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
}

// Seed supervisors and published exams (version 1) with rules disabled.
export async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const s of SUPERVISORS) await setDoc(doc(db, 'supervisors', s.email), s);
    for (const e of EXAMS) {
      const exam = { active: true, acknowledged: {}, parentId: null, ...e, version: 1, updatedBy: { name: 'Sample data' } };
      await setDoc(doc(db, 'exams', e.id), exam);
      await setDoc(doc(db, 'examVersions', `${e.id}__v1`), {
        examId: e.id, version: 1, snapshot: exam, changeNote: 'Sample data loaded', changes: [], affects: [],
        publishedBy: { name: 'Sample data' }, publishedAt: null, restoredFrom: null, acknowledgedConflict: null,
      });
    }
  });
}

// A signed-in person. email_verified mirrors email-link sign-in.
export const as = (env, user, { verified = true } = {}) =>
  env.authenticatedContext(user.uid, { email: user.email, email_verified: verified }).firestore();
