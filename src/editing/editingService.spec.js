import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryStore } from './memoryStore';
import { createEditingService } from './editingService';
import { findConflicts } from './conflicts';
import { AVERY, BLAKE, FORMER, VIEWER, EXAMS, SUPERVISORS, FACILITIES } from './test/fixtures';
import { SAMPLE_EXAMS, FACILITIES as SAMPLE_FACILITIES } from '../lookup/sampleExams';
import { validateExam } from './validation';
import { searchExams } from '../lookup/search';

const NOTE = 'Updated per imaging manager email';

let store;
let svc;
let clock;

beforeEach(() => {
  store = createMemoryStore({ exams: EXAMS, supervisors: SUPERVISORS });
  clock = 0;
  svc = createEditingService(store, { facilities: FACILITIES, now: () => `2026-10-01T10:00:${String(clock++).padStart(2, '0')}Z` });
});

const expectCode = async (promise, code) => {
  await expect(promise).rejects.toMatchObject({ code });
};

describe('permissions', () => {
  it('lets active supervisors edit, matching email case-insensitively', async () => {
    expect(await svc.canEdit(AVERY)).toBe(true);
    expect(await svc.canEdit(BLAKE)).toBe(true);
  });

  it('blocks signed-out people, non-supervisors and deactivated supervisors', async () => {
    expect(await svc.canEdit(null)).toBe(false);
    expect(await svc.canEdit(VIEWER)).toBe(false);
    expect(await svc.canEdit(FORMER)).toBe(false);
    await expectCode(svc.startDraft(null, 'mri-brain'), 'signed-out');
    await expectCode(svc.startDraft(VIEWER, 'mri-brain'), 'not-supervisor');
    await expectCode(svc.startDraft(FORMER, 'mri-brain'), 'not-supervisor');
  });

  it('blocks a supervisor who loses access mid-draft from publishing', async () => {
    await svc.startDraft(BLAKE, 'mri-brain');
    await svc.saveDraft(BLAKE, 'mri-brain', { scheduling: ['Schedule 60 minutes.'] });
    await svc.saveSupervisor(AVERY, { email: BLAKE.email, name: 'Blake Sup', active: false });
    await expectCode(svc.publish(BLAKE, 'mri-brain', NOTE), 'not-supervisor');
    expect((await store.getExam('mri-brain')).scheduling[0]).toMatch(/45 minutes/);
  });

  it('only list managers can add supervisors, and cannot lock themselves out', async () => {
    await expectCode(svc.saveSupervisor(BLAKE, { email: 'new@example.org', name: 'New' }), 'not-manager');
    await svc.saveSupervisor(AVERY, { email: 'New.Person@example.org', name: 'New Person' });
    expect(await svc.canEdit({ uid: 'u-new', email: 'new.person@example.org' })).toBe(true);
    await expectCode(svc.saveSupervisor(AVERY, { email: AVERY.email, name: 'Avery', active: false }), 'self-lockout');
    await expectCode(svc.saveSupervisor(AVERY, { email: 'not-an-email', name: 'x' }), 'bad-email');
  });
});

describe('drafts and publishing', () => {
  it('keeps drafts out of live lookups until published', async () => {
    await svc.startDraft(AVERY, 'mri-brain');
    await svc.saveDraft(AVERY, 'mri-brain', { scheduling: ['Schedule 60 minutes.'] });
    expect((await store.getExam('mri-brain')).scheduling[0]).toMatch(/45 minutes/);
    expect(await svc.getDraft(BLAKE, 'mri-brain')).toBeNull();

    const { exam, version } = await svc.publish(AVERY, 'mri-brain', NOTE);
    expect(exam.scheduling).toEqual(['Schedule 60 minutes.']);
    expect(exam.version).toBe(2);
    expect(version.publishedBy).toMatchObject({ uid: 'u-avery', name: 'Avery Lead' });
    expect(await svc.getDraft(AVERY, 'mri-brain')).toBeNull();
  });

  it('requires a change note and reports problems in plain language by field', async () => {
    await svc.startDraft(AVERY, 'mri-brain');
    await svc.saveDraft(AVERY, 'mri-brain', { name: '', category: '' });
    const err = await svc.publish(AVERY, 'mri-brain', 'ok').catch((e) => e);
    expect(err.code).toBe('invalid');
    const fields = err.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'category', 'changeNote']));
    expect(err.errors.find((e) => e.field === 'name').message).toBe('Enter the exam name.');
  });

  it('refuses to publish when nothing changed', async () => {
    await svc.startDraft(AVERY, 'mri-brain');
    await expectCode(svc.publish(AVERY, 'mri-brain', NOTE), 'no-changes');
  });

  it('preview lists what changed and whether it affects search or guidance', async () => {
    await svc.startDraft(AVERY, 'mri-brain');
    await svc.saveDraft(AVERY, 'mri-brain', {
      aliases: ['brain mri', 'head mri', 'MRI head'],
      facilities: [
        { facilityId: 'NORTH', availability: 'yes', note: '' },
        { facilityId: 'SOUTH', availability: 'no', note: '' },
        { facilityId: 'EAST', availability: 'yes', note: '' },
      ],
    });
    const p = await svc.previewDraft(AVERY, 'mri-brain');
    expect(p.errors).toEqual([]);
    expect(p.affects).toEqual(['guidance', 'search']);
    expect(p.changes.find((c) => c.field === 'aliases').details).toEqual(['Added "MRI head"']);
    expect(p.changes.find((c) => c.field === 'facilities').details).toEqual([
      'South Hospital: Limited → Not offered',
      'South Hospital note removed',
    ]);
  });

  it('creates a new special protocol under a parent exam', async () => {
    const d = await svc.startNewExamDraft(AVERY, { name: 'CT Lower Extremity Runoff', kind: 'protocol', parentId: 'ct-lower-extremity' });
    expect(d.content.category).toBe('CT');
    expect(d.content.facilities.map((f) => f.availability)).toEqual(['', '', '']);
    let err = await svc.publish(AVERY, d.examId, NOTE).catch((e) => e);
    expect(err.errors.some((e) => e.field === 'facilities')).toBe(true);

    await svc.saveDraft(AVERY, d.examId, {
      aliases: ['ct runoff'],
      scheduling: ['Schedule 40 minutes.'],
      facilities: [
        { facilityId: 'NORTH', availability: 'yes', note: '' },
        { facilityId: 'SOUTH', availability: 'no', note: '' },
        { facilityId: 'EAST', availability: 'no', note: '' },
      ],
    });
    const { exam } = await svc.publish(AVERY, d.examId, NOTE);
    expect(exam).toMatchObject({ id: 'ct-lower-extremity-runoff', version: 1, kind: 'protocol', parentId: 'ct-lower-extremity' });
  });
});

describe('protocol vs orderable separation', () => {
  it("blocks a protocol from using its parent's orderable as a search word", async () => {
    await svc.startDraft(AVERY, 'ct-mako');
    await svc.saveDraft(AVERY, 'ct-mako', { aliases: ['MAKO', 'CT LOWER EXTREMITY WO CONTRAST'] });
    const err = await svc.publish(AVERY, 'ct-mako', NOTE).catch((e) => e);
    expect(err.code).toBe('invalid');
    expect(err.errors[0]).toMatchObject({ field: 'aliases' });
    expect(err.errors[0].message).toMatch(/orderable for the parent exam "CT Lower Extremity"/);
  });

  it("blocks a search word that is another exam's name or search word", async () => {
    await svc.startDraft(AVERY, 'ct-mako');
    await svc.saveDraft(AVERY, 'ct-mako', { aliases: ['CT Lower Extremity', 'ct  LEG'] });
    const err = await svc.publish(AVERY, 'ct-mako', NOTE).catch((e) => e);
    const msgs = err.errors.map((e) => e.message);
    expect(msgs[0]).toMatch(/name of another exam \("CT Lower Extremity"\)/);
    expect(msgs[1]).toMatch(/already a search word for "CT Lower Extremity"/);
  });

  it('requires a protocol to have a regular exam as its parent', async () => {
    await svc.startDraft(AVERY, 'ct-mako');
    await svc.saveDraft(AVERY, 'ct-mako', { parentId: null });
    let err = await svc.publish(AVERY, 'ct-mako', NOTE).catch((e) => e);
    expect(err.errors.map((e) => e.field)).toContain('parentId');
    await svc.saveDraft(AVERY, 'ct-mako', { parentId: 'ct-mako' });
    err = await svc.publish(AVERY, 'ct-mako', NOTE).catch((e) => e);
    expect(err.errors.find((e) => e.field === 'parentId').message).toMatch(/not found/);
  });
});

describe('published edits reach the lookup, drafts do not', () => {
  it('search finds a new protocol word only after publishing, and generic wording still skips MAKO', async () => {
    await svc.startDraft(AVERY, 'ct-mako');
    await svc.saveDraft(AVERY, 'ct-mako', { aliases: ['mako', 'mako knee', 'robotic knee planning'] });
    const find = async (q) => searchExams(await store.listExams(), { query: q }).results.map((r) => r.exam.id);
    expect(await find('robotic knee')).toEqual([]);
    await svc.publish(AVERY, 'ct-mako', NOTE);
    expect(await find('robotic knee')).toEqual(['ct-mako']);
    expect(await find('CT lower extremity')).toEqual(['ct-lower-extremity']);
    expect(await find('CT LOWER EXTREMITY WO CONTRAST')).toEqual(['ct-lower-extremity']);
  });

  it('blocks publishing a protocol that search could never tell apart from its parent', async () => {
    await svc.startDraft(AVERY, 'ct-mako');
    await svc.saveDraft(AVERY, 'ct-mako', { name: 'CT Leg Knee', aliases: [] });
    const err = await svc.publish(AVERY, 'ct-mako', NOTE).catch((e) => e);
    expect(err.errors).toEqual([{ field: 'aliases', message: expect.stringMatching(/can't tell this protocol apart from "CT Lower Extremity"/) }]);
  });
});

describe('the lookup sample data', () => {
  it('passes validation and has no conflict flags', () => {
    const names = Object.fromEntries(SAMPLE_FACILITIES.map((f) => [f.id, f.name]));
    for (const exam of SAMPLE_EXAMS) {
      expect([exam.id, validateExam(exam, SAMPLE_EXAMS, { facilityNames: names })]).toEqual([exam.id, []]);
    }
    expect(findConflicts(SAMPLE_EXAMS, names)).toEqual([]);
  });
});

describe('version history', () => {
  it('records who changed what, when, why, and what it affects', async () => {
    await svc.startDraft(AVERY, 'ct-lower-extremity');
    await svc.saveDraft(AVERY, 'ct-lower-extremity', { scheduling: ['Schedule 35 minutes.', 'No prep.'] });
    await svc.publish(AVERY, 'ct-lower-extremity', 'Room turnover is longer now');
    await svc.startDraft(BLAKE, 'ct-lower-extremity');
    await svc.saveDraft(BLAKE, 'ct-lower-extremity', { aliases: ['ct leg', 'ct knee', 'ct ankle'] });
    await svc.publish(BLAKE, 'ct-lower-extremity', 'Front desk searches for ankle');

    const h = await svc.history('ct-lower-extremity');
    expect(h.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(h[0]).toMatchObject({
      publishedBy: { name: 'Blake Sup', email: 'blake.sup@example.org' },
      changeNote: 'Front desk searches for ankle',
      affects: ['search'],
    });
    expect(h[1]).toMatchObject({ publishedBy: { name: 'Avery Lead' }, affects: ['guidance'] });
    expect(h[1].publishedAt < h[0].publishedAt).toBe(true);
  });

  it('restores an earlier version as a new version without erasing history', async () => {
    await svc.startDraft(AVERY, 'mri-brain');
    await svc.saveDraft(AVERY, 'mri-brain', { scheduling: ['Wrong text'] });
    await svc.publish(AVERY, 'mri-brain', 'Typo introduced by mistake');
    const { exam, version } = await svc.restoreVersion(BLAKE, 'mri-brain', 1);
    expect(exam.scheduling[0]).toMatch(/45 minutes/);
    expect(exam.version).toBe(3);
    expect(version).toMatchObject({ restoredFrom: 1, changeNote: 'Restored version 1', publishedBy: { name: 'Blake Sup' } });
    expect((await svc.history('mri-brain')).length).toBe(3);
    await expectCode(svc.restoreVersion(VIEWER, 'mri-brain', 1), 'not-supervisor');
  });

  it('will not restore a version that would now clash with another exam', async () => {
    await svc.startDraft(AVERY, 'mri-brain');
    await svc.saveDraft(AVERY, 'mri-brain', { aliases: ['brain mri'] });
    await svc.publish(AVERY, 'mri-brain', 'Removing head MRI wording');
    await svc.startDraft(AVERY, 'ct-lower-extremity');
    await svc.saveDraft(AVERY, 'ct-lower-extremity', { aliases: ['ct leg', 'ct knee', 'head MRI'] });
    await svc.publish(AVERY, 'ct-lower-extremity', 'Deliberately odd test alias');
    const err = await svc.restoreVersion(AVERY, 'mri-brain', 1).catch((e) => e);
    expect(err.code).toBe('invalid');
    expect(err.errors[0].message).toMatch(/already a search word for "CT Lower Extremity"/);
  });
});

describe('two supervisors editing the same exam', () => {
  it('stops a stale publish and merges the draft onto the latest version', async () => {
    await svc.startDraft(AVERY, 'mri-brain');
    await svc.startDraft(BLAKE, 'mri-brain');
    await svc.saveDraft(AVERY, 'mri-brain', { scheduling: ['Schedule 60 minutes.'] });
    await svc.saveDraft(BLAKE, 'mri-brain', { aliases: ['brain mri', 'head mri', 'MRI head'], scheduling: ['Schedule 50 minutes.'] });
    await svc.publish(AVERY, 'mri-brain', NOTE);

    const p = await svc.previewDraft(BLAKE, 'mri-brain');
    expect(p.stale).toBe(true);
    expect(p.newer.map((v) => v.publishedBy.name)).toEqual(['Avery Lead']);
    const err = await svc.publish(BLAKE, 'mri-brain', NOTE).catch((e) => e);
    expect(err.code).toBe('stale');
    expect(err.newer).toHaveLength(1);

    const { draft, overlapping } = await svc.updateDraftToLatest(BLAKE, 'mri-brain');
    expect(overlapping).toEqual(['scheduling']);
    expect(draft.baseVersion).toBe(2);
    await svc.publish(BLAKE, 'mri-brain', 'Added wording and longer slot');
    const exam = await store.getExam('mri-brain');
    expect(exam.aliases).toContain('MRI head');
    expect(exam.scheduling).toEqual(['Schedule 50 minutes.']);
    expect(exam.version).toBe(3);
  });

  it('fails safely if the published version moves during the save', async () => {
    await svc.startDraft(AVERY, 'mri-brain');
    await svc.saveDraft(AVERY, 'mri-brain', { scheduling: ['Schedule 60 minutes.'] });
    const realCommit = store.commitPublish;
    store.commitPublish = async (args) => realCommit({ ...args, expectedVersion: args.expectedVersion + 99 });
    await expectCode(svc.publish(AVERY, 'mri-brain', NOTE), 'stale');
    store.commitPublish = realCommit;
    expect(await svc.getDraft(AVERY, 'mri-brain')).not.toBeNull();
  });
});

describe('conflict flags', () => {
  it('flags a protocol offered where its parent is not, and mismatched notes', async () => {
    const exams = await store.listExams();
    exams.find((e) => e.id === 'ct-mako').facilities[2] = { facilityId: 'EAST', availability: 'yes', note: '' };
    exams.find((e) => e.id === 'mri-brain').facilities[0].note = 'Does not perform on weekends anymore, not offered';
    exams.find((e) => e.id === 'mri-brain').orderables.push('CT LOWER EXTREMITY WO CONTRAST');
    const c = findConflicts(exams, { EAST: 'East Imaging' });
    expect(c.map((x) => x.type).sort()).toEqual(['protocol-parent', 'shared-orderable', 'status-note']);
    expect(c.find((x) => x.type === 'protocol-parent').message).toBe(
      'CT MAKO Protocol is marked "Offered" at East Imaging, but its parent exam CT Lower Extremity is marked "Not offered" there.',
    );
    // Flagged because MRI Brain is unrelated; MAKO sharing it with its parent alone is fine.
    expect(c.find((x) => x.type === 'shared-orderable').examIds).toEqual(['ct-lower-extremity', 'ct-mako', 'mri-brain']);
  });

  it('has no flags on clean sample data', async () => {
    expect(findConflicts(await store.listExams())).toEqual([]);
  });

  it('marking as intended hides the flag, is recorded in history, and does not change lookups', async () => {
    await svc.startDraft(AVERY, 'ct-mako');
    await svc.saveDraft(AVERY, 'ct-mako', {
      facilities: [
        { facilityId: 'NORTH', availability: 'yes', note: '' },
        { facilityId: 'SOUTH', availability: 'no', note: '' },
        { facilityId: 'EAST', availability: 'yes', note: '' },
      ],
    });
    await svc.publish(AVERY, 'ct-mako', 'EAST got the MAKO scanner');
    const [conflict] = findConflicts(await store.listExams());
    expect(conflict.type).toBe('protocol-parent');

    await expectCode(svc.acknowledgeConflict(BLAKE, 'ct-mako', conflict, 'ok'), 'invalid');
    await expectCode(svc.acknowledgeConflict(VIEWER, 'ct-mako', conflict, 'This is intended'), 'not-supervisor');
    await svc.acknowledgeConflict(BLAKE, 'ct-mako', conflict, 'MAKO-only scanner at EAST, no general CT');
    expect(findConflicts(await store.listExams())).toEqual([]);
    const [latest] = await svc.history('ct-mako');
    expect(latest).toMatchObject({ affects: [], acknowledgedConflict: conflict.key, publishedBy: { name: 'Blake Sup' } });
    expect(latest.changeNote).toMatch(/MAKO-only scanner/);
  });

  it('brings the flag back when the values involved change', async () => {
    const exams = await store.listExams();
    const mri = exams.find((e) => e.id === 'mri-brain');
    mri.facilities[0].note = 'Not performed here';
    const [c] = findConflicts(exams);
    mri.acknowledged = { [c.key]: { reason: 'x' } };
    expect(findConflicts(exams)).toEqual([]);
    mri.facilities[0].note = 'Not performed after 5pm';
    expect(findConflicts(exams)).toHaveLength(1);
  });
});
