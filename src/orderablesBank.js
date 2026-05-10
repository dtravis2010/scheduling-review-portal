// orderablesBank.js
// Loads and parses lpf_orderables.txt at build time so the CR editor's
// Epic Orderables picker can offer the full LPF as a searchable dropdown.
//
// Re-run / redeploy after replacing lpf_orderables.txt to refresh the bank.

import lpfRaw from '../lpf_orderables.txt?raw';

const CONTRAST_RE = /\s+(W\/WO|WWO|W|WO)\s+(CON|CONT|CONTRAST|CONTRAS)\b/i;

function deriveContrast(name) {
  const m = name.match(CONTRAST_RE);
  if (!m) return '';
  const k = m[1].toUpperCase();
  if (k === 'W/WO' || k === 'WWO') return 'W/WO';
  if (k === 'WO') return 'WITHOUT';
  if (k === 'W') return 'WITH';
  return '';
}

// Normalize the LPF section column to one of the modality buckets the
// editor uses, so we can filter the dropdown by the card's modality.
function deriveModalityBucket(section) {
  const s = (section || '').toUpperCase();
  if (s.includes('CT')) return 'CT';
  if (s.includes('MRI') || s === 'MR') return 'MRI';
  if (s.includes('ULTRASOUND') || s === 'US') return 'US';
  if (s.includes('DIAGNOSTIC') || s.includes('FLUORO') || s.includes('GI')) return 'GI';
  if (s.includes('WOMEN') || s.includes('MAMMO') || s.includes('BREAST')) return 'WOMENS';
  if (s.includes('NUC') || s.includes('NM')) return 'NM';
  return 'OTHER';
}

function parseLpf(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const cols = line.split('\t').map((s) => s.trim());
    if (cols.length < 5) continue;
    const orx = cols[2];
    const m = orx.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
    if (!m) continue;
    const fullName = m[1].trim();
    const epicId = m[2].trim();
    const sectionRaw = (cols[4] || '').replace(/\s*\[.*\]\s*$/, '').trim();
    out.push({
      fullName,
      epicId,
      contrast: deriveContrast(fullName),
      section: sectionRaw,
      modalityBucket: deriveModalityBucket(sectionRaw),
    });
  }
  // De-dupe by epicId (LPF is already unique but be defensive)
  const seen = new Set();
  const dedup = [];
  for (const o of out) {
    if (seen.has(o.epicId)) continue;
    seen.add(o.epicId);
    dedup.push(o);
  }
  dedup.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return dedup;
}

export const ORDERABLES_BANK = parseLpf(lpfRaw);

// Lookup by full name (case-insensitive) — used to detect when a user picks
// an entry from the datalist so we can auto-fill contrast + Epic ID.
export const ORDERABLES_BY_NAME = (() => {
  const m = new Map();
  for (const o of ORDERABLES_BANK) m.set(o.fullName.toUpperCase(), o);
  return m;
})();

// Map a card's free-text modality field ("CT", "MRI", "GI/Fluoros", ...) onto
// the same bucket used in the bank. Returns null when we can't tell — caller
// should treat that as "show everything."
export function modalityFieldToBucket(modality) {
  const s = (modality || '').toUpperCase();
  if (!s) return null;
  if (s.includes('CT')) return 'CT';
  if (s.includes('MRI') || s.includes('MR')) return 'MRI';
  if (s.includes('VASCULAR') || s.includes('US') || s.includes('ULTRASOUND')) return 'US';
  if (s.includes('GI') || s.includes('FLUORO') || s.includes('DIAG')) return 'GI';
  if (s.includes('WOMEN') || s.includes('MAMMO') || s.includes('BREAST') || s.includes('DEXA')) return 'WOMENS';
  if (s.includes('NUC') || s.includes('NM')) return 'NM';
  return null;
}
