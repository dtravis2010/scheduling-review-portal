// seed_cr.mjs
// Generate paired _CR Firestore entries for every _SCH procedure currently in the
// procedures collection. Pulls the SCH card's parsed structure (procedure name,
// modality, modality description, header image, entity matrix) and builds a
// matching v12 CR card with empty Epic Orderables, empty Pertinent Tip Sheets,
// empty description, empty Standard CR Notes — ready for the user to edit on
// the live site.
//
// Usage: node seed_cr.mjs

import { JSDOM } from 'jsdom';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

const { parseCard } = await import('./src/cardParser.js');
const { buildCRCardHTML } = await import('./src/cardBuilder.js');

const firebaseConfig = {
  apiKey: 'AIzaSyDF0aNH6s3oMi8eWTMiI7OOB5vghKxExBs',
  authDomain: 'scheduling-review.firebaseapp.com',
  projectId: 'scheduling-review',
  storageBucket: 'scheduling-review.firebasestorage.app',
  messagingSenderId: '71175933232',
  appId: '1:71175933232:web:f410bfac6b4c38553a8cf5',
  measurementId: 'G-3N5L6XWT1M'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Pull every procedure currently in Firestore
console.log('Loading procedures from Firestore...');
const snap = await getDocs(collection(db, 'procedures'));
const procedures = [];
snap.forEach(d => procedures.push({ id: d.id, data: d.data() }));
console.log(`  loaded ${procedures.length} procedures`);

const schItems = procedures.filter(p => p.data.Procedure && p.data.Procedure.endsWith('_SCH'));
const crItemsByProc = new Map();
for (const p of procedures) {
  if (p.data.Procedure && p.data.Procedure.endsWith('_CR')) {
    crItemsByProc.set(p.data.Procedure, p.data);
  }
}
console.log(`  ${schItems.length} SCH items, ${crItemsByProc.size} existing CR items`);

// A CR item needs (re)generation if its notes are empty OR if it's in the old layout
// (no Pertinent Tip Sheets section, which is unique to the v12 CR builder).
const needsRegen = (cr) => {
  const html = cr.Clinical_x0020_Review_x0020_Notes || '';
  if (!html || html.trim().length < 50) return true;
  if (!html.includes('Pertinent Tip Sheets')) return true;
  return false;
};

// SCH-by-base-name lookup so orphan CRs can still pick up modality / entity matrix
const schByBase = new Map();
for (const p of schItems) {
  const base = p.data.Procedure.replace(/_SCH$/, '');
  schByBase.set(base, p.data);
}

// Build the new CR docs — iterate by SCH first (so we cover SCH-driven creates), then
// sweep any orphan CR docs that still need regen (CR exists but no matching SCH).
const toWrite = [];
const handledCRProcs = new Set();

for (const p of schItems) {
  const sch = p.data;
  const baseName = sch.Procedure.replace(/_SCH$/, '');
  const crProcedure = `${baseName}_CR`;
  handledCRProcs.add(crProcedure);
  const existingCR = crItemsByProc.get(crProcedure);
  if (existingCR && !needsRegen(existingCR)) continue;

  // Parse SCH so we can carry over procedureName/modality/entity matrix
  let parsed = {};
  try {
    parsed = parseCard(sch.Scheduling_x0020_Instructions || '');
  } catch (e) {
    console.warn(`  parse failed for ${sch.Procedure}: ${e.message}`);
  }
  const crData = {
    procedureName: parsed.procedureName || baseName,
    modality: parsed.modality || '',
    modalityDescription: '',
    headerImage: parsed.headerImage || '',
    description: '',
    epicOrderables: [],
    tipSheets: [],
    standardCRNotes: '',
    entityMatrix: parsed.entityMatrix || []
  };
  const crHtml = buildCRCardHTML(crData);

  toWrite.push({
    Entity0Id: sch.Entity0Id ?? 24,
    ModalityId: sch.ModalityId,
    Procedure: crProcedure,
    Scheduling_x0020_Instructions: '',
    Clinical_x0020_Review_x0020_Notes: crHtml
  });
}

// Sweep orphan CR docs (have no matching SCH) — still need v12 layout
for (const [crProcedure, existingCR] of crItemsByProc.entries()) {
  if (handledCRProcs.has(crProcedure)) continue;
  if (!needsRegen(existingCR)) continue;

  const baseName = crProcedure.replace(/_CR$/, '');
  const crData = {
    procedureName: baseName,
    modality: '',
    modalityDescription: '',
    headerImage: '',
    description: '',
    epicOrderables: [],
    tipSheets: [],
    standardCRNotes: '',
    entityMatrix: []  // empty → builder will leave the matrix blank, editor seeds defaults on Edit
  };
  const crHtml = buildCRCardHTML(crData);
  // Try to inherit ModalityId from a sibling SCH if one exists (some orphan CRs
  // lost their counterpart but a related SCH may exist). Fallback to null.
  let modalityId = existingCR.ModalityId;
  if (modalityId === undefined || modalityId === null) {
    const sibling = schByBase.get(baseName) || schByBase.get(baseName.replace(/\s+/g, ' ').trim());
    modalityId = sibling?.ModalityId ?? null;
  }

  toWrite.push({
    Entity0Id: existingCR.Entity0Id ?? 24,
    ModalityId: modalityId,
    Procedure: crProcedure,
    Scheduling_x0020_Instructions: existingCR.Scheduling_x0020_Instructions || '',
    Clinical_x0020_Review_x0020_Notes: crHtml
  });
}

console.log(`  ${toWrite.length} new CR entries to write`);

if (toWrite.length === 0) {
  console.log('Nothing to write. Exiting.');
  process.exit(0);
}

const CHUNK = 200;
let written = 0;
for (let i = 0; i < toWrite.length; i += CHUNK) {
  const slice = toWrite.slice(i, i + CHUNK);
  const batch = writeBatch(db);
  for (const item of slice) {
    const cleanId = item.Procedure.replace(/\//g, '-');
    batch.set(doc(db, 'procedures', cleanId), item, { merge: true });
    batch.set(doc(db, 'reviews', cleanId), { comment: '', isFinished: false }, { merge: true });
    written++;
  }
  await batch.commit();
  console.log(`  pushed ${written}/${toWrite.length}`);
}
console.log(`Done — wrote ${written} CR entries.`);
process.exit(0);
