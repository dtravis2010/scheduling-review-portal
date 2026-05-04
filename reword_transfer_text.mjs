// reword_transfer_text.mjs
// Replace every occurrence of "Transfer to the entity schedulers" /
// "Transfer to entity schedulers" with "Transfer to entities" across all
// SCH and CR HTML in Firestore.
//
// Usage: node reword_transfer_text.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

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
snap.forEach(d => procedures.push({ id: d.id, data: d.data() }));
console.log(`  loaded ${procedures.length} procedures`);

const PATTERNS = [
  // Most-specific first so longer phrases get rewritten before shorter substrings
  { from: /Transfer the caller to the entity schedulers/g, to: 'Transfer to entities' },
  { from: /Transfer the caller to entity schedulers/g, to: 'Transfer to entities' },
  { from: /Transfer to the entity schedulers/g, to: 'Transfer to entities' },
  { from: /Transfer to entity schedulers/g, to: 'Transfer to entities' }
];

function rewrite(html) {
  if (!html) return html;
  let out = html;
  for (const { from, to } of PATTERNS) out = out.replace(from, to);
  return out;
}

const toWrite = [];
for (const { data } of procedures) {
  if (!data.Procedure) continue;
  const sch = data.Scheduling_x0020_Instructions || '';
  const cr = data.Clinical_x0020_Review_x0020_Notes || '';
  const newSch = rewrite(sch);
  const newCr = rewrite(cr);
  if (newSch === sch && newCr === cr) continue;
  const patch = {};
  if (newSch !== sch) patch.Scheduling_x0020_Instructions = newSch;
  if (newCr !== cr) patch.Clinical_x0020_Review_x0020_Notes = newCr;
  toWrite.push({ proc: data.Procedure, patch });
}

console.log(`  ${toWrite.length} procedures need rewording`);

const CHUNK = 200;
let written = 0;
for (let i = 0; i < toWrite.length; i += CHUNK) {
  const slice = toWrite.slice(i, i + CHUNK);
  const batch = writeBatch(db);
  for (const { proc, patch } of slice) {
    const cleanId = proc.replace(/\//g, '-');
    batch.set(doc(db, 'procedures', cleanId), patch, { merge: true });
    written++;
  }
  await batch.commit();
  console.log(`  pushed ${written}/${toWrite.length}`);
}
console.log(`Done — reworded ${written} procedures.`);
process.exit(0);
