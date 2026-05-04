// backfill_orderables.mjs
// Parse the LPF (lpf_orderables.txt) — 307 Epic orderables — and populate the
// Epic Orderables / Exam Variants table on every CR card in Firestore by
// matching CR procedure base names against orderable base names.
//
// Usage: node backfill_orderables.mjs

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

const { parseCRCard } = await import('./src/cardParser.js');
const { buildCRCardHTML } = await import('./src/cardBuilder.js');

// ─────────── Parse LPF ───────────

const LPF_PATH = './lpf_orderables.txt';
const text = readFileSync(LPF_PATH, 'utf8');
const lines = text.split(/\r?\n/).filter(Boolean);

// Each line: <num> TAB Procedures [1] TAB <ORXID> TAB <OTLID> TAB <SECTION> TAB <ROWID>
// ORXID example: " CT SPINE LUMBAR W CON [CAT8532132]" — name + bracketed code
const orderables = [];
for (const line of lines) {
  const cols = line.split('\t').map(s => s.trim());
  if (cols.length < 5) continue;
  const orx = cols[2];
  // Extract name + bracketed code
  const m = orx.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
  if (!m) continue;
  const fullName = m[1].trim();
  const epicId = m[2].trim();
  const section = cols[4].replace(/\s*\[.*\]\s*$/, '').trim();
  orderables.push({ fullName, epicId, section });
}
console.log(`Parsed ${orderables.length} orderables from LPF`);

// ─────────── Helpers ───────────

const CONTRAST_RE = /\s+(W\/WO|WWO|W|WO)\s+(CON|CONT|CONTRAST|CONTRAS)\b/i;
const LATERALITY_TRAILING_RE = /\s+(BILAT|BILATERAL|RT|LT|RIGHT|LEFT|UNI\s+RT|UNI\s+LT)$/i;
const HIGHRES_RE = /\s+HIGH\s+RES$/i;

function deriveContrast(name) {
  const m = name.match(CONTRAST_RE);
  if (!m) return '';
  const k = m[1].toUpperCase();
  if (k === 'W/WO' || k === 'WWO') return 'W/WO';
  if (k === 'WO') return 'WITHOUT';
  if (k === 'W') return 'WITH';
  return '';
}

// Strip contrast + laterality suffixes to get a base procedure name.
function deriveBaseName(name) {
  let s = name.trim();
  // Repeatedly strip trailing laterality
  let changed = true;
  while (changed) {
    changed = false;
    if (LATERALITY_TRAILING_RE.test(s)) {
      s = s.replace(LATERALITY_TRAILING_RE, '').trim();
      changed = true;
    }
  }
  // Strip contrast suffix (if at end)
  s = s.replace(/\s+(W\/WO|WWO|W|WO)\s+(CON|CONT|CONTRAST|CONTRAS)(\s+HIGH\s+RES)?$/i, '').trim();
  // Strip lone trailing "HIGH RES"
  s = s.replace(HIGHRES_RE, '').trim();
  return s;
}

// Map every orderable to its derived base + contrast
for (const o of orderables) {
  o.baseName = deriveBaseName(o.fullName);
  o.contrast = deriveContrast(o.fullName);
}

// ─────────── Firestore ───────────

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

const crItems = procedures.filter(p => p.Procedure && p.Procedure.endsWith('_CR'));
console.log(`  ${crItems.length} CR items`);

// ─────────── Match CR procedures to orderables ───────────

// Build a base → orderables index for O(1) lookup
const byBase = new Map();
for (const o of orderables) {
  const key = o.baseName.toUpperCase();
  if (!byBase.has(key)) byBase.set(key, []);
  byBase.get(key).push(o);
}

// Manual aliases — CR procedure base names that don't match the LPF base name verbatim
// (different naming conventions between sources). Map: CR base → LPF base
const ALIASES = {
  'CT ABD AND PELVIS': 'CT ABDOMEN AND PELVIS',
  'CT ABD/PLV/CHEST': 'CT CHEST, ABDOMEN, AND PELVIS',
  'CT CHEST ABDOMEN AND PELVIS': 'CT CHEST, ABDOMEN, AND PELVIS',
  'CT CHEST AND ABDOMEN': 'CT CHEST AND ABDOMEN',
  'CT CHEST HIGH RES': 'CT CHEST',
  'CT CHEST THORAX': 'CT CHEST',
  'CT CHEST': 'CT CHEST',
  'CTA ABD AND PELV ANGIO': 'CTA ABDOMEN AND PELVIS ANGIO',
  'CTA AORTA W RUNOFF': 'CTA AORTA RUNOFF',
  'CTA HEAD': 'CTA HEAD',
  'CTA NECK WWO (CAROTID)': 'CTA NECK',
  'CT VENOGRAPHY, VENOGRAM': 'CT VENOGRAM',
  'CT VIRTUAL COLONOSCOPY': 'CT DIAG COLNSCPY',
  'CT IVP': 'CT UROGRAM',
  'CT IAC MID EAR': 'CT IAC MIDDLE EAR',
  'CT MASTOID TMP BN': 'CT MASTOID TEMP BONE',
  'CT THORAX LUNG SCREEN': 'CT LOW DOSE LUNG SCREEN',
  'CT HEART WO CON QUAL (CALCIUM SCORE)': 'CT HEART WO CONT QUAL CAL',
  'CCTA/CT HEART ANGIO/CT CARDIAC': 'CCTA',
  'CT EXT LOWER': 'CT EXT LOWER',
  'CT EXT UPPER': 'CT EXT UPPER',
  'CTA EXT LOWER': 'CTA EXT LOWER',
  'CTA EXT UPPER': 'CTA EXT UPPER',
  'MRA EXT LOWER': 'MRA EXT LOWER',
  'MRA EXT UPPER': 'MRA EXT UPPER',
  'MRI EXT LOW JOINT': 'MRI EXT LOWER JOINT',
  'MRI EXT LOW NO JOINT': 'MRI EXT LOWER NO JOINT',
  'MRI EXT UP JOINT': 'MRI EXT UPPER JOINT',
  'MRI EXT UP NO JOINT': 'MRI EXT UPPER NO JOINT',
  'MRI BRAIN STUDY FUNCTION': 'MRI BRAIN STUDY FUNCTION',
  'MRI ELASTOGRAPHY': 'MR ELASTOGRAPHY',
  'MRI DEFOGRAM': 'MRI DEFOGRAM',
  'MRI VENOGRAM': 'MRV HEAD ANGIO',
  'MRI BREAST UNI': 'MRI BREAST',
  'MRI BREAST BILAT': 'MRI BREAST',
  'MRI SPINE CERVICAL': 'MRI SPINE CERVICAL',
  'MRI SPINE THORACIC': 'MRI SPINE THORACIC',
  'MRI SPINE LUMBAR': 'MRI SPINE LUMBAR',
  'MRCP': 'MRI MRCP',
  'MRI ARTHROGRAM': 'MRI EXT UPPER JOINT',
  'MRI URI BLADDER': 'US URINARY BLADDER',
  'BAGEL STUDY': null,
  'PACEMAKER CARD EXAMPLES': null,
  'CT BIOPSIES': null,
  'CT MYELOGRAMS': null,
  'CT LUMBAR PUNCTURE': null,
  'CT ASPIRATION': null,
  'CT CATH EXCHANGE': null,
  'CT SCANOGRAM': 'BONE LENGTH SCANOGRAM',
  'CT SELLA PITUITARY': null,
  'CT TMJ': null,
  'CT COLONOSCOPY DIAGNOSTIC': 'CT DIAG COLNSCPY',
  // US
  'US LIVER (HEPATIC)': 'US LIVER (HEPATIC)',
  'US ABDOMEN COMPLETE': 'US ABDOMEN COMPLETE'
};

// Tokenize a procedure name into significant words. Drops noise tokens.
const NOISE_TOKENS = new Set([
  'AND', 'OR', 'OF', 'THE', 'AT', 'WITH', 'WITHOUT', 'IN', 'A', 'AN',
  'BIL', 'BILAT', 'BILATERAL', 'UNI', 'RT', 'LT', 'RIGHT', 'LEFT',
  'COMP', 'COMPLETE', 'LIMITED', 'LTD', 'STD', 'SCREENING', 'DIAG', 'DIAGNOSTIC',
  'IV', 'CONTRAST', 'CON', 'CONT', 'WO', 'W', 'W/WO', 'WWO',
  'STUDY', 'STDY', 'LV', '1-2', '>2', '<14', '>14',
  'PROCEDURE', 'PROCEDURES'
]);

function tokens(str) {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !NOISE_TOKENS.has(t));
}

function findOrderablesFor(procName) {
  const base = procName.replace(/_CR$/, '').trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(ALIASES, base) && ALIASES[base] === null) return [];
  const lookupKey = (ALIASES[base] || base).toUpperCase();

  // 1. Exact base-name match
  if (byBase.has(lookupKey)) return byBase.get(lookupKey);

  // 2. Prefix match — try all orderables whose base starts with the proc base
  const prefixHits = [];
  for (const [k, list] of byBase.entries()) {
    if (k === lookupKey) continue;
    if (k.startsWith(lookupKey + ' ') || lookupKey.startsWith(k + ' ')) {
      prefixHits.push(...list);
    }
  }
  if (prefixHits.length > 0) return prefixHits;

  // 3. Token-overlap fallback — find the orderable group with the highest
  //    proportion of CR-name tokens covered. Require >= 70% overlap.
  const procTokens = tokens(lookupKey);
  if (procTokens.length === 0) return [];
  let bestKey = null;
  let bestScore = 0;
  for (const [k] of byBase.entries()) {
    const orderTokens = tokens(k);
    if (orderTokens.length === 0) continue;
    const overlap = procTokens.filter(t => orderTokens.includes(t)).length;
    const ratio = overlap / Math.max(procTokens.length, orderTokens.length);
    if (ratio > bestScore && overlap >= 2 && ratio >= 0.6) {
      bestScore = ratio;
      bestKey = k;
    }
  }
  if (bestKey) return byBase.get(bestKey);
  return [];
}

// ─────────── Apply ───────────

let updated = 0;
let noMatch = [];
const toWrite = [];

for (const cr of crItems) {
  const html = cr.Clinical_x0020_Review_x0020_Notes || '';
  if (!html) continue;
  let parsed;
  try {
    parsed = parseCRCard(html);
  } catch (e) {
    console.warn(`  parseCR failed for ${cr.Procedure}: ${e.message}`);
    continue;
  }
  // Skip OOS cards
  if (parsed.outOfScope) continue;
  // Skip cards that already have orderables (don't overwrite manual edits)
  if (parsed.epicOrderables && parsed.epicOrderables.length > 0) continue;

  const matches = findOrderablesFor(cr.Procedure);
  if (matches.length === 0) {
    noMatch.push(cr.Procedure);
    continue;
  }

  // Sort: WITHOUT first, then WITH, then W/WO, then unknown
  const order = { 'WITHOUT': 1, 'WITH': 2, 'W/WO': 3, '': 4 };
  const sorted = [...matches].sort((a, b) => {
    const o = (order[a.contrast] ?? 4) - (order[b.contrast] ?? 4);
    if (o !== 0) return o;
    return a.fullName.localeCompare(b.fullName);
  });

  parsed.epicOrderables = sorted.map(o => ({
    orderableName: o.fullName,
    contrast: o.contrast,
    epicId: o.epicId
  }));
  const newHtml = buildCRCardHTML(parsed);
  toWrite.push({ proc: cr.Procedure, newHtml });
  updated++;
}

console.log(`  ${updated} CR cards will be updated with orderables`);
console.log(`  ${noMatch.length} CR procs had no matching orderables (will be left empty)`);
if (noMatch.length > 0) {
  console.log('  no-match CR procs (sample):');
  noMatch.slice(0, 30).forEach(p => console.log(`    - ${p}`));
}

const CHUNK = 200;
let written = 0;
for (let i = 0; i < toWrite.length; i += CHUNK) {
  const slice = toWrite.slice(i, i + CHUNK);
  const batch = writeBatch(db);
  for (const { proc, newHtml } of slice) {
    const cleanId = proc.replace(/\//g, '-');
    batch.set(doc(db, 'procedures', cleanId), { Clinical_x0020_Review_x0020_Notes: newHtml }, { merge: true });
    written++;
  }
  await batch.commit();
  console.log(`  pushed ${written}/${toWrite.length}`);
}
console.log(`Done — wrote ${written} CR cards with Epic Orderables.`);
process.exit(0);
