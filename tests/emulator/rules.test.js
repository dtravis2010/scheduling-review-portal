import { describe, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, getDocs, collection, query, where } from 'firebase/firestore';
import { makeEnv, seed, as } from './setup.js';
import { AVERY, BLAKE, FORMER, VIEWER } from '../../src/editing/test/fixtures.js';

let env;
beforeAll(async () => { env = await makeEnv(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });
afterAll(async () => { await env.cleanup(); });

const by = (u) => ({ uid: u.uid, name: u.name, email: u.email.toLowerCase() });

// The writes a publish makes: exam at version n and its version record.
const publishBatch = (db, user, { examId = 'mri-brain', n = 2, author = user, examVersion = n, idVersion = n } = {}) => {
  const b = writeBatch(db);
  b.set(doc(db, 'exams', examId), { id: examId, name: 'MRI Brain', version: examVersion, updatedBy: by(author) });
  b.set(doc(db, 'examVersions', `${examId}__v${idVersion}`), {
    examId, version: n, changeNote: 'Rules test publish', publishedBy: by(author),
  });
  return b.commit();
};

describe('reading', () => {
  it('lets anyone, even signed out, look up exams and history', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, 'exams', 'ct-mako')));
    await assertSucceeds(getDocs(query(collection(anon, 'examVersions'), where('examId', '==', 'ct-mako'))));
  });
});

describe('publishing', () => {
  it('lets an active supervisor publish an exam with its version', async () => {
    await assertSucceeds(publishBatch(as(env, AVERY), AVERY));
  });

  it('blocks signed-out people, non-supervisors, deactivated supervisors and unverified emails', async () => {
    await assertFails(publishBatch(env.unauthenticatedContext().firestore(), VIEWER));
    await assertFails(publishBatch(as(env, VIEWER), VIEWER));
    await assertFails(publishBatch(as(env, FORMER), FORMER));
    await assertFails(publishBatch(as(env, AVERY, { verified: false }), AVERY));
  });

  it('matches the supervisor list case-insensitively', async () => {
    await assertSucceeds(publishBatch(as(env, BLAKE), BLAKE)); // Blake.Sup@ vs blake.sup@
  });

  it("blocks naming someone else as the author", async () => {
    await assertFails(publishBatch(as(env, BLAKE), BLAKE, { author: AVERY }));
  });

  it('blocks changing an exam without writing its version record', async () => {
    const db = as(env, AVERY);
    await assertFails(setDoc(doc(db, 'exams', 'mri-brain'), { id: 'mri-brain', version: 2, updatedBy: by(AVERY) }));
    await assertFails(updateDoc(doc(db, 'exams', 'mri-brain'), { scheduling: 'sneaky' }));
  });

  it('blocks skipping or reusing version numbers', async () => {
    await assertFails(publishBatch(as(env, AVERY), AVERY, { n: 3 }));
    await assertFails(publishBatch(as(env, AVERY), AVERY, { n: 1 }));
    await assertFails(publishBatch(as(env, AVERY), AVERY, { examVersion: 2, idVersion: 3, n: 3 }));
  });

  it('never allows deleting an exam (retire it instead)', async () => {
    await assertFails(deleteDoc(doc(as(env, AVERY), 'exams', 'mri-brain')));
  });
});

describe('version history is append-only', () => {
  it('blocks editing or deleting any version, even by a manager', async () => {
    const db = as(env, AVERY);
    await assertFails(updateDoc(doc(db, 'examVersions', 'mri-brain__v1'), { changeNote: 'rewritten' }));
    await assertFails(deleteDoc(doc(db, 'examVersions', 'mri-brain__v1')));
  });

  it('blocks adding a version record without publishing the exam', async () => {
    const db = as(env, AVERY);
    await assertFails(setDoc(doc(db, 'examVersions', 'mri-brain__v2'), {
      examId: 'mri-brain', version: 2, publishedBy: by(AVERY),
    }));
  });
});

describe('drafts are private', () => {
  const draft = (u, examId = 'mri-brain') => ({ examId, owner: by(u), content: { name: 'MRI Brain' } });

  it('lets a supervisor save, read and delete their own draft', async () => {
    const db = as(env, BLAKE);
    const ref = doc(db, 'examDrafts', `mri-brain__${BLAKE.uid}`);
    await assertSucceeds(setDoc(ref, draft(BLAKE)));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(query(collection(db, 'examDrafts'), where('owner.uid', '==', BLAKE.uid))));
    await assertSucceeds(deleteDoc(ref));
  });

  it("blocks reading, changing or creating someone else's draft", async () => {
    await assertSucceeds(setDoc(doc(as(env, BLAKE), 'examDrafts', `mri-brain__${BLAKE.uid}`), draft(BLAKE)));
    const avery = as(env, AVERY);
    const ref = doc(avery, 'examDrafts', `mri-brain__${BLAKE.uid}`);
    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, draft(AVERY)));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(avery, 'examDrafts', `ct-mako__${BLAKE.uid}`), draft(BLAKE, 'ct-mako')));
  });

  it('blocks non-supervisors from saving drafts', async () => {
    await assertFails(setDoc(doc(as(env, VIEWER), 'examDrafts', `mri-brain__${VIEWER.uid}`), draft(VIEWER)));
  });
});

describe('supervisor list', () => {
  const rec = (email, extra = {}) => ({ email, name: 'Someone', active: true, canManageSupervisors: false, ...extra });

  it('lets a list manager add and deactivate supervisors', async () => {
    const db = as(env, AVERY);
    await assertSucceeds(setDoc(doc(db, 'supervisors', 'new@example.org'), rec('new@example.org')));
    await assertSucceeds(setDoc(doc(db, 'supervisors', 'blake.sup@example.org'), rec('blake.sup@example.org', { active: false })));
  });

  it('blocks regular supervisors and others from changing the list', async () => {
    await assertFails(setDoc(doc(as(env, BLAKE), 'supervisors', 'new@example.org'), rec('new@example.org')));
    await assertFails(setDoc(doc(as(env, VIEWER), 'supervisors', 'viewer@example.org'), rec('viewer@example.org')));
    await assertFails(setDoc(doc(as(env, FORMER), 'supervisors', 'former.sup@example.org'), rec('former.sup@example.org')));
  });

  it('blocks a manager from removing their own access', async () => {
    const db = as(env, AVERY);
    await assertFails(setDoc(doc(db, 'supervisors', 'avery.lead@example.org'), rec('avery.lead@example.org', { active: false, canManageSupervisors: true })));
    await assertFails(deleteDoc(doc(db, 'supervisors', 'avery.lead@example.org')));
  });
});
