// seed_oos.mjs — bulk-insert the canonical 36 Out-of-Scope procedures into
// the new Firestore collection `oosProcedures`. One doc per procedure,
// keyed by name (with `/` replaced by `-`), fields { name, modalityId }.
//
// Source list comes from oos_consolidated_preview.html (the design preview
// generated 2026-05-06). Run once, after the OOS tab has been deployed:
//   node seed_oos.mjs --apply
// Without --apply it dry-runs and prints what it would write.
//
// Modality IDs match cardBuilder/App.jsx: 1=CT/NM, 2=MRI, 3=GI/Fluoros,
// 4=Vascular US, 5=Non-Vascular US, 6=Women's Services.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, getDocs } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');

const db = getFirestore(initializeApp({
  apiKey: 'AIzaSyDF0aNH6s3oMi8eWTMiI7OOB5vghKxExBs',
  projectId: 'scheduling-review',
  authDomain: 'scheduling-review.firebaseapp.com',
  appId: '1:71175933232:web:f410bfac6b4c38553a8cf5',
}));

// ─── Canonical OOS list (36 procedures from oos_consolidated_preview.html) ───
const OOS_SEED = [
  // CT / NM (14)
  { name: 'BONE SCAN (NM)', modalityId: 1 },
  { name: 'CISTERNOGRAM', modalityId: 1 },
  { name: 'CT ARTHROGRAM', modalityId: 1 },
  { name: 'CT ASPIRATION', modalityId: 1 },
  { name: 'CT BIOPSIES', modalityId: 1 },
  { name: 'CT CATH EXCHANGE', modalityId: 1 },
  { name: 'CT LUMBAR PUNCTURE', modalityId: 1 },
  { name: 'CT MYELOGRAMS', modalityId: 1 },
  { name: 'INFRARENAL WITH RUNOFF (CATH LAB)', modalityId: 1 },
  { name: 'IR ANGIOGRAMS / VENOGRAMS', modalityId: 1 },
  { name: 'PEG INSERTIONS', modalityId: 1 },
  { name: 'PET SCAN', modalityId: 1 },
  { name: 'SUBMANDIBULAR', modalityId: 1 },
  { name: 'TAVR PROTOCOL', modalityId: 1 },

  // MRI (2)
  { name: 'MRI ARTHROGRAM', modalityId: 2 },
  { name: 'MRI FETAL', modalityId: 2 },

  // GI / Fluoros (15)
  { name: 'ASPIRATION', modalityId: 3 },
  { name: 'BAGEL STUDY', modalityId: 3 },
  { name: 'ESOPHAGEAL MANOMETRY', modalityId: 3 },
  { name: 'ESOPHAGEAL MOTILITY W/ IMPEDANCE', modalityId: 3 },
  { name: 'ESOPHAGEAL MOTILITY W/ IMPEDENCE', modalityId: 3 }, // misspelled dup; preserved until SP cleanup
  { name: 'FINE NEEDLE ASPIRATIONS (FNA)', modalityId: 3 },
  { name: 'GASTRIC EMPTYING SCAN', modalityId: 3 },
  { name: 'GI BLEEDING SCAN', modalityId: 3 },
  { name: 'GI DEFOGRAM', modalityId: 3 },
  { name: 'HEPATOBILIARY SCAN (HIDA)', modalityId: 3 },
  { name: 'MARSHMALLOW STUDY', modalityId: 3 },
  { name: 'MODIFIED BARIUM SWALLOW (MBS)', modalityId: 3 },
  { name: 'NEPHROSTOGRAM', modalityId: 3 },
  { name: 'PULMONARY FUNCTION TEST (PFT)', modalityId: 3 },
  { name: 'THORANCENTESIS', modalityId: 3 }, // misspelled; sibling THORACENTESIS lives in Non-Vasc US below

  // Non-Vascular Ultrasound (5)
  { name: 'SINOGRAM', modalityId: 5 },
  { name: 'THORACENTESIS', modalityId: 5 },
  { name: 'US ASPIRATION', modalityId: 5 },
  { name: 'US BIOPSY', modalityId: 5 },
  { name: 'US EXT NON VASC COMPLETE', modalityId: 5 },
];

const docKey = (name) => name.replace(/\//g, '-');

console.log(`OOS seed: ${OOS_SEED.length} procedures`);
const existing = new Set();
(await getDocs(collection(db, 'oosProcedures'))).forEach((d) => existing.add(d.id));
console.log(`Existing oosProcedures docs: ${existing.size}`);

let toWrite = 0, toSkip = 0;
for (const p of OOS_SEED) {
  const key = docKey(p.name);
  if (existing.has(key)) {
    toSkip++;
    if (!APPLY) console.log(`  SKIP  ${key} (already exists)`);
    continue;
  }
  toWrite++;
  if (APPLY) {
    await setDoc(doc(db, 'oosProcedures', key), p);
    console.log(`  WROTE ${key}`);
  } else {
    console.log(`  WOULD WRITE ${key} -> ${JSON.stringify(p)}`);
  }
}

console.log(`\nDone. ${APPLY ? 'wrote' : 'would write'} ${toWrite}, skipped ${toSkip}.`);
if (!APPLY) console.log('Run with --apply to actually write to Firestore.');
process.exit(0);
