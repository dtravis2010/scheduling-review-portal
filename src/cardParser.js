// cardParser.js
// Parse a v11 Scheduling_x0020_Instructions HTML string into a structured object
// the editor UI can bind to. Falls back gracefully on missing sections.

// 20 default THR entities. Used as starter rows when a card has no Entity Matrix yet.
// Cards may freely add more entities beyond this list — the editor supports it.
export const DEFAULT_ENTITIES = [
  'THA', 'THAL', 'THAMH', 'THAZ', 'THB', 'THC', 'THD', 'THDN', 'THF', 'THFM',
  'THFW', 'THHEB', 'THK', 'THP', 'THPPIC', 'THPS', 'THRW', 'THS', 'THSW', 'THWP'
];

const stripTags = (html) => {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
};

const innerHTMLOf = (el) => (el ? el.innerHTML : '');

const findTableContaining = (root, ...needles) => {
  const tables = root.querySelectorAll('table');
  for (const t of tables) {
    const text = (t.textContent || '').toLowerCase();
    if (needles.every(n => text.includes(n.toLowerCase()))) return t;
  }
  return null;
};

const findHeadingByText = (root, text) => {
  const target = text.toLowerCase().trim();
  const divs = root.querySelectorAll('div, p, span');
  for (const d of divs) {
    const t = (d.textContent || '').trim().toLowerCase();
    if (t === target) return d;
  }
  return null;
};

const parseOrderOptions = (table) => {
  if (!table) return [];
  const rows = [];
  const trs = table.querySelectorAll('tr');
  for (let i = 1; i < trs.length; i++) {
    const tds = trs[i].querySelectorAll('td');
    if (tds.length === 0) continue;
    rows.push({
      visitType: stripTags(innerHTMLOf(tds[0])),
      code: stripTags(innerHTMLOf(tds[1])),
      cpt: stripTags(innerHTMLOf(tds[2])),
      contrast: stripTags(innerHTMLOf(tds[3])),
      instructions: stripTags(innerHTMLOf(tds[4]))
    });
  }
  return rows;
};

// Parse the Entity Matrix table.
// Returns whatever entities are actually present in the HTML (preserving order).
// If the matrix is missing entirely OR has fewer than 5 rows, we seed with the 20 defaults
// so a brand-new card lands on a sensible starting grid the user can edit.
const parseEntityMatrix = (table) => {
  const rows = [];
  const seen = new Set();
  if (table) {
    const trs = table.querySelectorAll('tr');
    for (let i = 1; i < trs.length; i++) {
      const tds = trs[i].querySelectorAll('td');
      if (tds.length < 3) continue;
      const entity = stripTags(innerHTMLOf(tds[0])).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!entity || seen.has(entity)) continue;
      seen.add(entity);
      const performsText = stripTags(innerHTMLOf(tds[1])).toUpperCase();
      let performs = '';
      if (performsText === 'YES' || performsText.startsWith('YES')) performs = 'YES';
      else if (performsText === 'NO' || performsText.startsWith('NO')) performs = 'NO';
      let notes = stripTags(innerHTMLOf(tds[2]));
      if (notes === '—' || notes === '-' || notes === '–') notes = '';
      rows.push({ entity, performs: performs || 'YES', notes });
    }
  }

  // If no usable rows found, seed with the 20 defaults
  if (rows.length === 0) {
    return DEFAULT_ENTITIES.map(e => ({ entity: e, performs: 'YES', notes: '' }));
  }
  return rows;
};

// Find a colored callout box by its heading text, return the bullets inside it
const parseBulletBox = (root, headingText) => {
  const heading = findHeadingByText(root, headingText);
  if (!heading) return [];
  let cur = heading;
  for (let walked = 0; walked < 5 && cur; walked++) {
    const ul = cur.parentElement?.querySelector('ul');
    if (ul) {
      return Array.from(ul.querySelectorAll('li')).map(li => stripTags(innerHTMLOf(li)));
    }
    cur = cur.parentElement;
  }
  return [];
};

const parseStandardInstructions = (root) => {
  const heading = findHeadingByText(root, 'Standard Instructions');
  if (!heading) return '';
  const next = heading.nextElementSibling;
  return next ? stripTags(innerHTMLOf(next)) : '';
};

const parseHeaderImage = (root) => {
  const img = root.querySelector('img');
  return img ? (img.getAttribute('src') || '') : '';
};

const parseProcedureName = (root) => {
  const divs = root.querySelectorAll('div');
  for (const d of divs) {
    const style = d.getAttribute('style') || '';
    if (/font-size\s*[:&#58;]\s*32px/.test(style)) {
      return stripTags(innerHTMLOf(d));
    }
  }
  return '';
};

const parseModalityName = (root) => {
  const heading = findHeadingByText(root, 'Modality');
  if (!heading) return '';
  const next = heading.nextElementSibling;
  return next ? stripTags(innerHTMLOf(next)) : '';
};

export const parseCard = (htmlString) => {
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlString || '';
  return {
    procedureName: parseProcedureName(tmp),
    modality: parseModalityName(tmp),
    headerImage: parseHeaderImage(tmp),
    orderOptions: parseOrderOptions(findTableContaining(tmp, 'Visit Type', 'CPT')),
    standardInstructions: parseStandardInstructions(tmp),
    entityMatrix: parseEntityMatrix(findTableContaining(tmp, 'Entity', 'Performs')),
    stat: parseBulletBox(tmp, 'STAT Orders'),
    asap: parseBulletBox(tmp, 'ASAP / Same Day / Next Day (Non-STAT)'),
    specialNeeds: parseBulletBox(tmp, 'Special Needs'),
    covid: parseBulletBox(tmp, 'COVID STATUS')
  };
};
