// End-to-end: the real editing service on the Firestore store, with security
// rules on, signed in as each fictional person.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { makeEnv, seed, as } from './setup.js';
import { createFirestoreStore } from '../../src/editing/firestoreStore.js';
import { createEditingService } from '../../src/editing/editingService.js';
import { findConflicts } from '../../src/editing/conflicts.js';
import { AVERY, BLAKE, VIEWER } from '../../src/editing/test/fixtures.js';

let env;
beforeAll(async () => { env = await makeEnv(); });
beforeEach(async () => { await env.clearFirestore(); await seed(env); });
afterAll(async () => { await env.cleanup(); });

const svcFor = (user) => createEditingService(createFirestoreStore(as(env, user)));
const NOTE = 'Emulator end-to-end change';

describe('editing on Firestore (emulator)', () => {
  it('draft, preview, publish, history and restore', async () => {
    const avery = svcFor(AVERY);
    await avery.startDraft(AVERY, 'mri-brain');
    await avery.saveDraft(AVERY, 'mri-brain', { scheduling: ['Schedule 60 minutes.'] });

    const anon = createFirestoreStore(env.unauthenticatedContext().firestore());
    expect((await anon.getExam('mri-brain')).scheduling[0]).toMatch(/45 minutes/);

    const p = await avery.previewDraft(AVERY, 'mri-brain');
    expect(p.affects).toEqual(['guidance']);
    await avery.publish(AVERY, 'mri-brain', NOTE);
    expect((await anon.getExam('mri-brain')).scheduling).toEqual(['Schedule 60 minutes.']);

    const blake = svcFor(BLAKE);
    await blake.restoreVersion(BLAKE, 'mri-brain', 1);
    const h = await anon.listVersions('mri-brain');
    expect(h.map((v) => [v.version, v.publishedBy.name])).toEqual([[3, 'Blake Sup'], [2, 'Avery Lead'], [1, 'Sample data']]);
    expect((await anon.getExam('mri-brain')).scheduling[0]).toMatch(/45 minutes/);
  });

  it("keeps drafts private and refuses edits from non-supervisors", async () => {
    await svcFor(AVERY).startDraft(AVERY, 'mri-brain');
    expect(await svcFor(BLAKE).getDraft(BLAKE, 'mri-brain')).toBeNull();
    await expect(svcFor(VIEWER).startDraft(VIEWER, 'mri-brain')).rejects.toMatchObject({ code: 'not-supervisor' });
  });

  it('detects a stale draft when two supervisors publish the same exam', async () => {
    const avery = svcFor(AVERY);
    const blake = svcFor(BLAKE);
    await avery.startDraft(AVERY, 'ct-mako');
    await blake.startDraft(BLAKE, 'ct-mako');
    await avery.saveDraft(AVERY, 'ct-mako', { scheduling: ['Schedule 50 minutes.'] });
    await blake.saveDraft(BLAKE, 'ct-mako', { aliases: ['mako', 'mako knee', 'robotic knee CT'] });
    await avery.publish(AVERY, 'ct-mako', NOTE);
    await expect(blake.publish(BLAKE, 'ct-mako', NOTE)).rejects.toMatchObject({ code: 'stale' });
    await blake.updateDraftToLatest(BLAKE, 'ct-mako');
    await blake.publish(BLAKE, 'ct-mako', NOTE);
    const exam = await createFirestoreStore(as(env, VIEWER)).getExam('ct-mako');
    expect(exam).toMatchObject({ version: 3, scheduling: ['Schedule 50 minutes.'] });
    expect(exam.aliases).toContain('robotic knee CT');
  });

  it('records a conflict marked as intended', async () => {
    const avery = svcFor(AVERY);
    await avery.startDraft(AVERY, 'ct-mako');
    await avery.saveDraft(AVERY, 'ct-mako', {
      facilities: [
        { facilityId: 'NORTH', availability: 'yes', note: '' },
        { facilityId: 'SOUTH', availability: 'no', note: '' },
        { facilityId: 'EAST', availability: 'yes', note: '' },
      ],
    });
    await avery.publish(AVERY, 'ct-mako', NOTE);
    const store = createFirestoreStore(as(env, BLAKE));
    const [c] = findConflicts(await store.listExams());
    await svcFor(BLAKE).acknowledgeConflict(BLAKE, 'ct-mako', c, 'EAST has a MAKO-only scanner');
    expect(findConflicts(await store.listExams())).toEqual([]);
  });
});
