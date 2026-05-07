// cardParser.js
// Parse v11/v12 card HTML strings into structured objects the editor binds to.
// SCH cards are parsed by parseCard(); CR cards by parseCRCard(). Both fall back gracefully
// on missing sections so legacy or partial HTML still produces a usable structure.

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

const parseEpicOrderables = (table) => {
  if (!table) return [];
  const rows = [];
  const trs = table.querySelectorAll('tr');
  for (let i = 1; i < trs.length; i++) {
    const tds = trs[i].querySelectorAll('td');
    if (tds.length < 3) continue;
    rows.push({
      orderableName: stripTags(innerHTMLOf(tds[0])),
      contrast: stripTags(innerHTMLOf(tds[1])),
      epicId: stripTags(innerHTMLOf(tds[2]))
    });
  }
  return rows;
};

const parseTipSheets = (table) => {
  if (!table) return [];
  const rows = [];
  const trs = table.querySelectorAll('tr');
  for (let i = 1; i < trs.length; i++) {
    const tds = trs[i].querySelectorAll('td');
    if (tds.length < 2) continue;
    const title = stripTags(innerHTMLOf(tds[0]));
    const linkEl = tds[1].querySelector('a');
    const link = linkEl ? (linkEl.getAttribute('href') || '') : '';
    rows.push({ title, link });
  }
  return rows;
};

// Three-state status classifier — handles colored bold text (YES/NO/OOS) and legacy badges.
const classifyPerforms = (rawText) => {
  const t = (rawText || '').toUpperCase().trim();
  if (!t) return 'YES';
  if (t.startsWith('OOS') || t.startsWith('OUT OF SCOPE')) return 'OOS';
  if (t === 'NO' || t.startsWith('NO ')) return 'NO';
  if (t.startsWith('YES')) return 'YES';
  // Fallback by membership
  if (t.includes('YES')) return 'YES';
  if (t.includes('NO')) return 'NO';
  if (t.includes('OOS')) return 'OOS';
  return 'YES';
};

// Pull notes out of a <td>, converting any <a href="…">label</a> into
// markdown-style `[label](url)` so the URL round-trips through parse → build.
// Decodes the SharePoint colon-encoding (&#58;) back to literal ':' so the
// stored note matches what the user originally typed.
const notesCellToMarkdown = (td) => {
  if (!td) return '';
  let html = innerHTMLOf(td);
  html = html.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, (_m, href, label) => {
    const decoded = href.replace(/&#58;/g, ':');
    return `[${label}](${decoded})`;
  });
  return stripTags(html);
};

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
      const performs = classifyPerforms(stripTags(innerHTMLOf(tds[1])));
      let notes = notesCellToMarkdown(tds[2]);
      if (notes === '—' || notes === '-' || notes === '–') notes = '';
      rows.push({ entity, performs, notes });
    }
  }
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

// Parse the Shared Entity Notes box (above the Entity Matrix). It has a heading like
// "Shared Entity Notes — apply to all performing entities" and contains a UL.
const parseSharedEntityNotes = (root) => {
  const divs = root.querySelectorAll('div');
  for (const d of divs) {
    const txt = (d.textContent || '').toLowerCase();
    if (txt.includes('shared entity notes')) {
      const ul = d.querySelector('ul');
      if (ul) {
        return Array.from(ul.querySelectorAll('li')).map(li => stripTags(innerHTMLOf(li)));
      }
    }
  }
  return [];
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

// Returns { modality, modalityDescription }. The modality banner has a Label "Modality"
// followed by a bold value, optionally followed by a longer description block.
const parseModality = (root) => {
  const heading = findHeadingByText(root, 'Modality');
  if (!heading) return { modality: '', modalityDescription: '' };

  const parent = heading.parentElement;
  if (!parent) return { modality: '', modalityDescription: '' };

  const valueDivs = parent.querySelectorAll('div');
  const texts = Array.from(valueDivs)
    .map(d => stripTags(innerHTMLOf(d)))
    .filter(t => t && t.toLowerCase() !== 'modality');

  const modality = texts[0] || '';
  const modalityDescription = texts.slice(1).join(' ').trim();
  return { modality, modalityDescription };
};

// Parse the description paragraph that lives in CR cards between the modality banner
// and the Epic Orderables table. It's just the first non-table div in that region.
const parseDescription = (root) => {
  // Find all section divs (the ones that have "padding:18px 36px" pattern)
  const sectionDivs = root.querySelectorAll('div');
  for (const d of sectionDivs) {
    const style = d.getAttribute('style') || '';
    if (!style.includes('padding') || !style.includes('36px')) continue;
    // Skip sections that contain headings like "Standard CR Notes", tables, etc.
    if (d.querySelector('table')) continue;
    if (d.querySelector('div')) {
      const inner = d.querySelector('div');
      const innerStyle = inner.getAttribute('style') || '';
      if (innerStyle.includes('text-transform') && innerStyle.includes('uppercase')) continue;
    }
    const text = stripTags(innerHTMLOf(d));
    if (text.length > 20 && text.length < 1000) return text;
  }
  return '';
};

// Detect a procedure-level Out of Scope banner. We render it as a centered orange box
// containing the literal phrase "OUT OF SCOPE — ALL ENTITIES" — that's the marker.
const parseOutOfScope = (root) => {
  const text = (root.textContent || '').toUpperCase();
  if (!text.includes('OUT OF SCOPE') || !text.includes('ALL ENTITIES')) {
    return { outOfScope: false, outOfScopeReason: '' };
  }
  // Pull the reason text — the body div sits right after the title div in our banner.
  const divs = root.querySelectorAll('div');
  for (const d of divs) {
    const t = (d.textContent || '').trim().toUpperCase();
    if (t === 'OUT OF SCOPE — ALL ENTITIES' || t === 'OUT OF SCOPE - ALL ENTITIES' || t === 'OUT OF SCOPE — ALL ENTITIES') {
      const next = d.nextElementSibling;
      const reason = next ? stripTags(innerHTMLOf(next)) : '';
      return { outOfScope: true, outOfScopeReason: reason };
    }
  }
  return { outOfScope: true, outOfScopeReason: '' };
};

// Strip out any modality-warning banners (added by cardBuilder.modalityWarningBanner)
// before parsing the rest. The warning is auto-generated from MODALITY_WARNINGS at
// build time based on data.modality, NOT a stored field — so we don't want it to
// leak into description / standardCRNotes / anywhere else on round-trip.
const removeModalityWarnings = (root) => {
  const banners = root.querySelectorAll('[data-modality-warning="1"]');
  banners.forEach((b) => b.remove());
};

// ─────────── Public parsers ───────────

export const parseCard = (htmlString) => {
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlString || '';
  removeModalityWarnings(tmp);
  const { modality, modalityDescription } = parseModality(tmp);
  const oos = parseOutOfScope(tmp);
  return {
    outOfScope: oos.outOfScope,
    outOfScopeReason: oos.outOfScopeReason,
    procedureName: parseProcedureName(tmp),
    modality,
    modalityDescription,
    headerImage: parseHeaderImage(tmp),
    orderOptions: parseOrderOptions(findTableContaining(tmp, 'Visit Type', 'CPT')),
    sharedEntityNotes: parseSharedEntityNotes(tmp),
    entityMatrix: parseEntityMatrix(findTableContaining(tmp, 'Entity', 'Performs')),
    stat: parseBulletBox(tmp, 'STAT Orders'),
    asap: parseBulletBox(tmp, 'ASAP / Same Day / Next Day (Non-STAT)'),
    specialNeeds: parseBulletBox(tmp, 'Special Needs'),
    covid: parseBulletBox(tmp, 'COVID STATUS')
  };
};

export const parseCRCard = (htmlString) => {
  const tmp = document.createElement('div');
  tmp.innerHTML = htmlString || '';
  removeModalityWarnings(tmp);
  const { modality, modalityDescription } = parseModality(tmp);
  const oos = parseOutOfScope(tmp);

  // Standard CR Notes lives in a section with that heading
  const standardCRNotesHeading = findHeadingByText(tmp, 'Standard CR Notes');
  let standardCRNotes = '';
  if (standardCRNotesHeading) {
    // Two layout shapes are supported on round-trip:
    //   OLD (pre-callout): heading is a <div>, content is its sibling <div>.
    //   NEW (callout):     heading is a <span> inside a headRow <div>; siblings of that
    //                      row are paragraph <div>s and <ul> blocks. Bullet items become
    //                      "- text" lines so the textarea can re-edit them as markdown.
    if (standardCRNotesHeading.tagName === 'SPAN') {
      const row = standardCRNotesHeading.parentElement;
      const box = row && row.parentElement;
      if (box) {
        const lines = [];
        for (const child of box.children) {
          if (child === row) continue;
          if (child.tagName === 'UL') {
            for (const li of child.querySelectorAll('li')) {
              lines.push('- ' + (li.textContent || '').trim());
            }
          } else {
            lines.push(child.textContent || '');
          }
        }
        standardCRNotes = lines.join('\n').trim();
      }
    } else {
      const next = standardCRNotesHeading.nextElementSibling;
      standardCRNotes = next ? (next.textContent || '').trim() : '';
    }
  }

  return {
    outOfScope: oos.outOfScope,
    outOfScopeReason: oos.outOfScopeReason,
    procedureName: parseProcedureName(tmp),
    modality,
    modalityDescription,
    headerImage: parseHeaderImage(tmp),
    description: parseDescription(tmp),
    epicOrderables: parseEpicOrderables(findTableContaining(tmp, 'Orderable', 'Epic')),
    tipSheets: parseTipSheets(findTableContaining(tmp, 'Title', 'Link')),
    standardCRNotes,
    entityMatrix: parseEntityMatrix(findTableContaining(tmp, 'Entity', 'Performs'))
  };
};
