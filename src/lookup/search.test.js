// Run with `npm test` (Node's built-in test runner, no extra packages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchExams, protocolsFor, tokenize, pickSelectedExam } from './search.js';
import { SAMPLE_EXAMS, FACILITIES, CATEGORIES } from './sampleExams.js';

const ids = (query, opts = {}) =>
  searchExams(SAMPLE_EXAMS, { query, ...opts }).results.map((r) => r.exam.id);

test('plain "CT lower extremity" finds the parent exam and never MAKO', () => {
  for (const q of ['CT lower extremity', 'ct lower extremity', 'CT LOWER EXTREMITY WO CONTRAST', 'ct lower', 'lower extremity']) {
    const found = ids(q);
    assert.ok(found.includes('ct-lower-extremity'), `${q} should find CT Lower Extremity`);
    assert.ok(!found.includes('ct-mako'), `${q} must not match MAKO`);
  }
  assert.equal(ids('CT lower extremity')[0], 'ct-lower-extremity');
});

test('generic CT and body-part wording does not match MAKO', () => {
  for (const q of ['ct', 'ct knee', 'ct hip', 'knee', 'hip', 'ct leg', 'ct ankle', 'ct lower extremity wo']) {
    assert.ok(!ids(q).includes('ct-mako'), `${q} must not match MAKO`);
  }
});

test('MAKO wording finds the MAKO protocol first', () => {
  for (const q of ['mako', 'MAKO', 'ct mako', 'mako knee', 'robotic knee planning', 'mak']) {
    assert.equal(ids(q)[0], 'ct-mako', `${q} should rank MAKO first`);
  }
});

test('protocol orderables are not searchable (MAKO shares the parent order name)', () => {
  const mako = SAMPLE_EXAMS.find((e) => e.id === 'ct-mako');
  const parent = SAMPLE_EXAMS.find((e) => e.id === 'ct-lower-extremity');
  assert.ok(parent.orderables.includes(mako.orderables[0]), 'fixture: shared orderable');
  assert.deepEqual(ids(mako.orderables[0]), ['ct-lower-extremity']);
});

test('same rule holds for MRI Brain vs the seizure protocol', () => {
  assert.ok(!ids('mri brain').includes('mri-brain-seizure'));
  assert.ok(!ids('MRI BRAIN WO CONTRAST').includes('mri-brain-seizure'));
  assert.equal(ids('seizure')[0], 'mri-brain-seizure');
  assert.equal(ids('epilepsy mri')[0], 'mri-brain-seizure');
});

test('ranking: name beats alias beats orderable', () => {
  const r = searchExams(SAMPLE_EXAMS, { query: 'mri brain' }).results;
  assert.equal(r[0].exam.id, 'mri-brain');
  assert.equal(r[0].matchedOn, 'name');

  const alias = searchExams(SAMPLE_EXAMS, { query: 'barium swallow' }).results;
  assert.equal(alias[0].exam.id, 'fluoro-esophagram');
  assert.equal(alias[0].matchedOn, 'alias');

  const orderable = searchExams(SAMPLE_EXAMS, { query: 'tomo' }).results;
  assert.equal(orderable[0].exam.id, 'mammo-screening');
  assert.equal(orderable[0].matchedOn, 'orderable');

  // "lower extremity" hits two names; the CT one and the venous one both rank as name matches.
  const both = searchExams(SAMPLE_EXAMS, { query: 'lower extremity' }).results;
  assert.ok(both.every((m) => m.matchedOn === 'name'));
});

test('common wording (aliases) finds the right exam', () => {
  assert.equal(ids('dvt study')[0], 'us-venous-lower-extremity');
  assert.equal(ids('bone scan')[0], 'nm-bone-scan');
  assert.equal(ids('mammo')[0], 'mammo-screening');
  assert.equal(ids('ct belly')[0], 'ct-abdomen-pelvis');
});

test('partial words and case are forgiving', () => {
  assert.equal(ids('Ct Abd')[0], 'ct-abdomen-pelvis');
  assert.equal(ids('ultras abd')[0], 'us-abdomen-complete');
  assert.deepEqual(tokenize('CT HEAD W/O'), ['ct', 'head', 'wo']);
});

test('no match returns an empty list', () => {
  assert.deepEqual(ids('pet scan'), []);
});

test('empty query lists every exam alphabetically', () => {
  const found = ids('');
  assert.equal(found.length, SAMPLE_EXAMS.length);
  const names = searchExams(SAMPLE_EXAMS, {}).results.map((r) => r.exam.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('category filter narrows results', () => {
  const found = searchExams(SAMPLE_EXAMS, { category: 'MRI' }).results;
  assert.ok(found.length > 0);
  assert.ok(found.every((r) => r.exam.category === 'MRI'));
  assert.deepEqual(ids('lower extremity', { category: 'Vascular Ultrasound' }), ['us-venous-lower-extremity']);
});

test('facility filter keeps offered/limited exams and reports the rest', () => {
  const lks = searchExams(SAMPLE_EXAMS, { query: 'mako', facilityId: 'LKS' });
  assert.deepEqual(lks.results, []);
  assert.deepEqual(lks.notOfferedAtFacility.map((r) => r.exam.id), ['ct-mako']);

  assert.deepEqual(ids('mako', { facilityId: 'NGM' }), ['ct-mako']);
  assert.deepEqual(ids('mako', { facilityId: 'CHI' }), ['ct-mako'], 'limited still counts as offered');

  // Parent offered everywhere even where MAKO is not.
  assert.deepEqual(ids('ct lower extremity', { facilityId: 'LKS' }), ['ct-lower-extremity']);
});

test('facility and category filters combine', () => {
  const r = searchExams(SAMPLE_EXAMS, { facilityId: 'CHI', category: 'Vascular Ultrasound' });
  assert.deepEqual(r.results, []);
  assert.deepEqual(r.notOfferedAtFacility.map((m) => m.exam.id), ['us-venous-lower-extremity']);
});

test('parent exam lists its special protocols', () => {
  assert.deepEqual(protocolsFor(SAMPLE_EXAMS, 'ct-lower-extremity').map((e) => e.id), ['ct-mako']);
  assert.deepEqual(protocolsFor(SAMPLE_EXAMS, 'ct-head'), []);
});

test('sample data is well-formed', () => {
  const facilityIds = new Set(FACILITIES.map((f) => f.id));
  const examIds = new Set(SAMPLE_EXAMS.map((e) => e.id));
  assert.equal(examIds.size, SAMPLE_EXAMS.length, 'unique ids');
  for (const e of SAMPLE_EXAMS) {
    assert.ok(CATEGORIES.includes(e.category), `${e.id} category`);
    assert.ok(Array.isArray(e.aliases) && Array.isArray(e.orderables), `${e.id} lists`);
    assert.deepEqual(new Set(e.facilities.map((f) => f.facilityId)), facilityIds, `${e.id} covers every facility`);
    for (const f of e.facilities) assert.ok(['yes', 'no', 'limited'].includes(f.availability));
    if (e.kind === 'protocol') assert.ok(examIds.has(e.parentId), `${e.id} parent exists`);
  }
});

test('regression: "ct a/p" finds CT Abdomen and Pelvis only, not MAKO', () => {
  assert.deepEqual(ids('ct a/p'), ['ct-abdomen-pelvis']);
  // One- and two-letter words must match a whole word, never the start of one.
  for (const q of ['ct p', 'ct k', 'ct h', 'ct m', 'ct ma']) {
    assert.ok(!ids(q).includes('ct-mako'), `${q} must not match MAKO`);
  }
  assert.equal(ids('ct mak')[0], 'ct-mako', 'three letters still work as a prefix');
});

test('regression: opening a protocol link after a search opens that protocol', () => {
  // Searching "knee" shows MRI Knee and CT Lower Extremity, but not MAKO.
  const { results } = searchExams(SAMPLE_EXAMS, { query: 'knee' });
  assert.ok(!results.some((r) => r.exam.id === 'ct-mako'));
  // Clicking the MAKO link on CT Lower Extremity must open MAKO, not a result by position.
  assert.equal(pickSelectedExam(SAMPLE_EXAMS, 'ct-mako', results).id, 'ct-mako');
  assert.equal(pickSelectedExam(SAMPLE_EXAMS, 'ct-lower-extremity', []).id, 'ct-lower-extremity');
  // Nothing picked: top result.
  assert.equal(pickSelectedExam(SAMPLE_EXAMS, '', results).id, results[0].exam.id);
  assert.equal(pickSelectedExam(SAMPLE_EXAMS, '', []), null);
});
