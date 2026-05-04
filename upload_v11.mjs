// Bulk-upload Update_v11_SCH_ALL.json to Firestore `procedures` collection.
// Mirrors the chunking + review-clear logic in App.jsx so the deployed site picks up immediately.
// Usage: node upload_v11.mjs <path-to-json>

import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDF0aNH6s3oMi8eWTMiI7OOB5vghKxExBs',
  authDomain: 'scheduling-review.firebaseapp.com',
  projectId: 'scheduling-review',
  storageBucket: 'scheduling-review.firebasestorage.app',
  messagingSenderId: '71175933232',
  appId: '1:71175933232:web:f410bfac6b4c38553a8cf5',
  measurementId: 'G-3N5L6XWT1M'
};

const file = process.argv[2];
if (!file) {
  console.error('Usage: node upload_v11.mjs <path-to-json>');
  process.exit(1);
}

const items = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(items)) {
  console.error('Expected an array');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHUNK = 200; // 2 ops/item, well under 500 cap
let written = 0;

for (let i = 0; i < items.length; i += CHUNK) {
  const slice = items.slice(i, i + CHUNK);
  const batch = writeBatch(db);
  for (const item of slice) {
    if (!item.Procedure) continue;
    const cleanId = item.Procedure.replace(/\//g, '-');
    batch.set(doc(db, 'procedures', cleanId), item, { merge: true });
    batch.set(doc(db, 'reviews', cleanId), { comment: '', isFinished: false }, { merge: true });
    written++;
  }
  await batch.commit();
  console.log(`  committed ${written}/${items.length}`);
}

console.log(`Done — wrote ${written} procedures + cleared ${written} review docs.`);
process.exit(0);
