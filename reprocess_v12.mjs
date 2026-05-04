// reprocess_v12.mjs
// Read Update_v11_SCH_ALL.json, parse each SCH card with the SAME parser the React
// site uses, regenerate it through the new buildCardHTML (v12 layout), and write
// every card back to Firestore. Also writes a refreshed JSON to disk so we keep an
// off-line snapshot of what's now in Firestore.
//
// Usage: node reprocess_v12.mjs <path-to-Update_v11_SCH_ALL.json> <out-path>

import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';

const inFile = process.argv[2];
const outFile = process.argv[3];
if (!inFile || !outFile) {
  console.error('Usage: node reprocess_v12.mjs <in.json> <out.json>');
  process.exit(1);
}

// Stand up a DOM so the parser's `document.createElement` calls work.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

// Dynamic imports so the global polyfills above are in place first.
const { parseCard } = await import('./src/cardParser.js');
const { buildCardHTML } = await import('./src/cardBuilder.js');

const firebaseConfig = {
  apiKey: 'AIzaSyDF0aNH6s3oMi8eWTMiI7OOB5vghKxExBs',
  authDomain: 'scheduling-review.firebaseapp.com',
  projectId: 'scheduling-review',
  storageBucket: 'scheduling-review.firebasestorage.app',
  messagingSenderId: '71175933232',
  appId: '1:71175933232:web:f410bfac6b4c38553a8cf5',
  measurementId: 'G-3N5L6XWT1M'
};

const items = JSON.parse(readFileSync(inFile, 'utf8'));
console.log(`Loaded ${items.length} items from ${inFile}`);

// Reprocess each SCH card
const reprocessed = items.map((item) => {
  if (!item.Procedure || !item.Procedure.endsWith('_SCH')) return item;
  const html = item.Scheduling_x0020_Instructions || '';
  if (!html) return item;
  try {
    const parsed = parseCard(html);
    if (!parsed.procedureName) {
      parsed.procedureName = item.Procedure.replace(/_SCH$/, '');
    }
    const newHtml = buildCardHTML(parsed);
    return { ...item, Scheduling_x0020_Instructions: newHtml };
  } catch (e) {
    console.error(`  parse/build failed for ${item.Procedure}: ${e.message}`);
    return item;
  }
});

writeFileSync(outFile, JSON.stringify(reprocessed, null, 2));
console.log(`Wrote refreshed snapshot → ${outFile}`);

// Push to Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHUNK = 200;
let written = 0;
for (let i = 0; i < reprocessed.length; i += CHUNK) {
  const slice = reprocessed.slice(i, i + CHUNK);
  const batch = writeBatch(db);
  for (const item of slice) {
    if (!item.Procedure) continue;
    const cleanId = item.Procedure.replace(/\//g, '-');
    batch.set(doc(db, 'procedures', cleanId), item, { merge: true });
    batch.set(doc(db, 'reviews', cleanId), { comment: '', isFinished: false }, { merge: true });
    written++;
  }
  await batch.commit();
  console.log(`  pushed ${written}/${reprocessed.length}`);
}
console.log(`Done — wrote ${written} procedures to Firestore.`);
process.exit(0);
