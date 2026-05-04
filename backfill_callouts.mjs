// backfill_callouts.mjs
// For every non-OOS SCH card in Firestore, set the four standard callout-box bullet
// lists to the canonical text (STAT, ASAP, Special Needs, COVID), regenerate the HTML,
// and write back. OOS cards are left alone since they don't render those sections.
//
// Usage: node backfill_callouts.mjs

import { JSDOM } from 'jsdom';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

const { parseCard } = await import('./src/cardParser.js');
const { buildCardHTML } = await import('./src/cardBuilder.js');
const {
  STANDARD_STAT_BULLETS,
  STANDARD_ASAP_BULLETS,
  STANDARD_SPECIAL_NEEDS_BULLETS,
  STANDARD_COVID_BULLETS
} = await import('./src/standardCallouts.js');

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

console.log('Loading procedures from Firestore...');
const snap = await getDocs(collection(db, 'procedures'));
const procedures = [];
snap.forEach(d => procedures.push(d.data()));
console.log(`  loaded ${procedures.length} procedures`);

const schItems = procedures.filter(p => p.Procedure && p.Procedure.endsWith('_SCH'));
console.log(`  ${schItems.length} SCH items`);

const toWrite = [];
let oosSkipped = 0;
for (const sch of schItems) {
  const html = sch.Scheduling_x0020_Instructions || '';
  if (!html) continue;
  let parsed;
  try {
    parsed = parseCard(html);
  } catch (e) {
    console.warn(`  parse failed for ${sch.Procedure}: ${e.message}`);
    continue;
  }
  if (parsed.outOfScope) {
    oosSkipped++;
    continue;
  }
  // Force the standard callouts
  parsed.stat = [...STANDARD_STAT_BULLETS];
  parsed.asap = [...STANDARD_ASAP_BULLETS];
  parsed.specialNeeds = [...STANDARD_SPECIAL_NEEDS_BULLETS];
  parsed.covid = [...STANDARD_COVID_BULLETS];

  const newHtml = buildCardHTML(parsed);
  toWrite.push({ proc: sch.Procedure, newHtml });
}
console.log(`  ${toWrite.length} SCH cards to update (${oosSkipped} OOS skipped)`);

const CHUNK = 200;
let written = 0;
for (let i = 0; i < toWrite.length; i += CHUNK) {
  const slice = toWrite.slice(i, i + CHUNK);
  const batch = writeBatch(db);
  for (const { proc, newHtml } of slice) {
    const cleanId = proc.replace(/\//g, '-');
    batch.set(doc(db, 'procedures', cleanId), { Scheduling_x0020_Instructions: newHtml }, { merge: true });
    written++;
  }
  await batch.commit();
  console.log(`  pushed ${written}/${toWrite.length}`);
}
console.log(`Done — backfilled ${written} SCH cards with standard callouts.`);
process.exit(0);
