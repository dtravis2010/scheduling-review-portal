// cardBuilder.js
// Build v12 card HTML from a structured object. Two card kinds:
//   - SCH (Scheduling Instructions) — Order Options + Shared Entity Notes + Entity Matrix
//                                     + STAT/ASAP/Special Needs/COVID callouts
//   - CR  (Clinical Review Notes)   — Epic Orderables + Pertinent Tip Sheets
//                                     + Standard CR Notes + Entity Matrix
// Both share Header / Modality banner / Entity Matrix / Report footer.
//
// IMPORTANT: SharePoint requires colons in inline styles to be encoded as &#58;
// (otherwise it strips them). This builder handles that automatically.

const C = '&#58;';

const esc = (s) => {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

const styleAttr = (css) => css.replace(/:/g, C);

const safeHref = (raw) => {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!/^(https?:\/\/|mailto:|\/)/i.test(trimmed)) return '';
  return esc(trimmed);
};

// Render a notes string with markdown-style links — `[label](https://…)` becomes
// a clickable anchor. Non-link text is HTML-escaped. Used in the Entity Matrix
// notes column so an entity row can include a tip-sheet hyperlink.
// Colons in href URLs are encoded as &#58; to match the SharePoint-safe pattern
// already used elsewhere in this builder.
const notesWithLinks = (text) => {
  if (!text) return '';
  const linkStyle = styleAttr('color:#0077c8;text-decoration:underline');
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(esc(text.slice(last, m.index)));
    const label = m[1];
    const url = m[2].replace(/:/g, C); // SharePoint-safe colon encoding in href
    parts.push(`<a href="${url}" target="_blank" rel="noopener" style="${linkStyle}">${esc(label)}</a>`);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(esc(text.slice(last)));
  return parts.join('');
};

// ─────────── Shared sections ───────────

const headerSection = (procedureName, headerImage, label) => {
  const titleStyle = styleAttr('padding:24px 36px;vertical-align:middle');
  const labelStyle = styleAttr('font-size:11px;color:#a3c4e0;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:2px');
  const titleTextStyle = styleAttr('font-size:32px;font-weight:700;color:#ffffff;margin-bottom:8px');
  const accentStyle = styleAttr('height:3px;width:60px;background:#009543;border-radius:2px');
  const imgCellStyle = styleAttr('padding:16px 28px 16px 0;vertical-align:middle;text-align:right;width:200px');
  const imgStyle = styleAttr('max-width:180px;max-height:120px;border-radius:8px;background:#ffffff;padding:4px;box-shadow:0 2px 6px rgba(0,0,0,0.15)');
  const imgCell = headerImage
    ? `<td style="${imgCellStyle}"><img src="${esc(headerImage)}" alt="${esc(procedureName)}" style="${imgStyle}" /></td>`
    : `<td style="${imgCellStyle}"></td>`;
  return `<div style="${styleAttr('background:#003366;padding:0')}"><table style="${styleAttr('width:100%;border-collapse:collapse')}"><tr><td style="${titleStyle}"><div style="${labelStyle}">${esc(label)}</div><div style="${titleTextStyle}">${esc(procedureName)}</div><div style="${accentStyle}"></div></td>${imgCell}</tr></table></div>`;
};

// Modality banner with optional description text alongside the modality name.
// If `description` is provided, it shows below the modality in a slightly larger size.
const modalityBanner = (modality, description) => {
  const wrap = styleAttr('background:#e8f5e9;border-bottom:2px solid #009543;padding:14px 36px');
  const lbl = styleAttr('font-size:11px;color:#003366;font-weight:700;letter-spacing:1px;text-transform:uppercase');
  const val = styleAttr('font-size:16px;color:#003366;font-weight:700;margin-top:2px');
  const desc = styleAttr('font-size:14px;color:#003366;font-weight:500;margin-top:6px;line-height:1.5');
  const descBlock = description && description.trim()
    ? `<div style="${desc}">${esc(description)}</div>`
    : '';
  return `<div style="${wrap}"><div style="${lbl}">Modality</div><div style="${val}">${esc(modality || '')}</div>${descBlock}</div>`;
};

// Three-state entity matrix: YES (green), NO (red), OOS (orange).
// Status rendered as colored bold text (matches the live SharePoint pattern).
// `kind` is 'SCH' or 'CR' — picks which side of the entity link to use.
// `entityLinks` is an optional map { THA: { sch: '...', cr: '...' }, ... }.
//   • When a URL exists for an entity, the abbreviation cell becomes a
//     clickable hyperlink. Missing/empty URLs render as plain text.
//   • When entityLinks has any keys, it ALSO serves as the canonical entity
//     list — the matrix is rebuilt to contain exactly those entities, sorted
//     alphabetically, with each row's performs/notes preserved from the input
//     `rows` (or defaulted to YES/empty if the entity is new).
//   • When entityLinks is null/empty, the input `rows` are rendered as-is —
//     keeps backwards compatibility for headless scripts that don't load the
//     canonical list.
const entityMatrixSection = (rows, kind = 'SCH', entityLinks = null) => {
  // If a canonical entity list is provided, rebuild the row set so:
  //   1. Every canonical entity appears (new entities propagate automatically).
  //   2. Order is strictly alphabetical (independent of save history).
  //   3. Per-entity performs/notes are preserved from the input rows.
  //   4. Legacy entities not in the canonical list are dropped.
  let displayRows = rows || [];
  if (entityLinks && Object.keys(entityLinks).length > 0) {
    const canonical = Object.keys(entityLinks).sort();
    const byEntity = {};
    for (const r of displayRows) byEntity[r.entity] = r;
    displayRows = canonical.map(e => byEntity[e] || { entity: e, performs: 'YES', notes: '' });
  }
  // Hide when there's no matrix at all (vs. the default 20-entity case which
  // is informative even with all-YES rows).
  if (!displayRows || displayRows.length === 0) return '';
  const wrap = styleAttr('padding:18px 36px;border-bottom:1px solid #eee');
  const heading = styleAttr('font-size:13px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px');
  const tableStyle = styleAttr("width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-family:'Segoe UI', Arial, Helvetica, sans-serif;margin-top:12px");
  const headerRowStyle = styleAttr('background:#003366;color:#ffffff');
  const th = styleAttr('text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:90px');
  const thCenter = styleAttr('text-align:center;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:110px');
  const thNotes = styleAttr('text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366');
  const tdEntity = styleAttr('padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-weight:700;color:#003366');
  const tdStatus = styleAttr('padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:center');
  const tdNotes = styleAttr('padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:left');
  const entityLinkStyle = styleAttr('color:#003366;text-decoration:underline');

  const colorFor = (status) => {
    if (status === 'YES') return '#009543';
    if (status === 'NO') return '#ed0033';
    if (status === 'OOS') return '#ff6600';
    return '#888';
  };

  // Wrap entity abbreviation in <a> when a URL is configured for the kind.
  const sideKey = kind === 'CR' ? 'cr' : 'sch';
  const entityCellInner = (entity) => {
    const link = entityLinks && entityLinks[entity];
    const url = link && link[sideKey];
    if (!url) return esc(entity);
    const safeUrl = String(url).replace(/:/g, C);
    return `<a href="${safeUrl}" target="_blank" rel="noopener" style="${entityLinkStyle}">${esc(entity)}</a>`;
  };

  const headerHTML = `<tr style="${headerRowStyle}"><th style="${th}">Entity</th><th style="${thCenter}">Performs</th><th style="${thNotes}">Entity Notes</th></tr>`;
  const rowsHTML = displayRows.map((r, idx) => {
    const stripe = styleAttr(`background:${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'}`);
    const status = (r.performs || 'YES').toUpperCase();
    const colorStyle = styleAttr(`color:${colorFor(status)}`);
    const statusCell = `<span style="${colorStyle}"><strong>${esc(status)}</strong></span>`;
    const notesText = r.notes && r.notes.trim() ? notesWithLinks(r.notes) : '<br />';
    return `<tr style="${stripe}"><td style="${tdEntity}">${entityCellInner(r.entity)}</td><td style="${tdStatus}">${statusCell}</td><td style="${tdNotes}">${notesText}</td></tr>`;
  }).join('');

  return `<div style="${wrap}"><div style="${heading}">Entity Matrix</div><table style="${tableStyle}">${headerHTML}${rowsHTML}</table></div>`;
};

// Report Issue footer — mailto link to THRES Communications. Subject line
// changes based on which kind of card the user is viewing so the receiving
// inbox can route SCH vs CR feedback differently.
//   SCH card → subject "EPSI SCH"
//   CR card  → subject "EPSI CR"
const reportFooter = (kind = 'SCH') => {
  const wrap = styleAttr('text-align:center;padding:10px 0');
  const p = styleAttr('font-size:12px;color:#888;margin:0 0 8px');
  const a = styleAttr('display:inline-block;background:#003366;color:#fff;padding:8px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:3px solid #001a33');
  const subject = kind === 'CR' ? 'EPSI%20CR' : 'EPSI%20SCH';
  return `<div style="${wrap}"><p style="${p}"><em>To report a scheduling instruction issue, include the Exam, Entity, and Notes.</em></p><a href="mailto${C}THRESCommunications@texashealth.org?subject=${subject}&body=Entity%3A%0AExam%3A%0ANotes%3A" style="${a}">Report Issue</a></div>`;
};

// Shared Entity Notes — small blue-tinted callout block above the Entity Matrix.
// Empty array → returns empty string.
const sharedEntityNotesBlock = (bullets) => {
  if (!bullets || bullets.length === 0) return '';
  const box = styleAttr('margin:12px 0 0;background:#eef4fb;border:1px solid #c2d7eb;border-left:4px solid #0077c8;border-radius:6px;padding:12px 16px');
  const head = styleAttr('font-size:11px;color:#0077c8;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px');
  const ul = styleAttr('margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#333');
  const lis = bullets.map(b => `<li>${esc(b)}</li>`).join('');
  return `<div style="${box}"><div style="${head}">Shared Entity Notes &mdash; apply to all performing entities</div><ul style="${ul}">${lis}</ul></div>`;
};

// ─────────── SCH-specific sections ───────────

const orderOptionsSection = (rows, sharedEntityNotes) => {
  // Hide the section when there are no order options AND no shared entity
  // notes to display (avoids rendering an empty Visit Type / Code header table).
  const noRows = !rows || rows.length === 0;
  const noNotes = !sharedEntityNotes || sharedEntityNotes.length === 0;
  if (noRows && noNotes) return '';
  const sectionWrap = styleAttr('padding:18px 36px;border-bottom:1px solid #eee');
  const tableStyle = styleAttr("width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-family:'Segoe UI', Arial, Helvetica, sans-serif");
  const headerRow = styleAttr('background:#003366;color:#ffffff');
  const th = styleAttr('text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366');
  const thCenter = styleAttr('text-align:center;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:70px');
  const thWide = styleAttr('text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:220px');
  const thMed = styleAttr('text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:200px');
  const td = styleAttr('padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:left');
  const tdCenter = styleAttr('padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:center');
  const tdMono = styleAttr("padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-family:Consolas, 'Courier New', monospace");
  const tdName = styleAttr('padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-weight:700;color:#003366');

  const headerHTML = `<tr style="${headerRow}"><th style="${th}">Visit Type</th><th style="${thCenter}">Code</th><th style="${thWide}">CPT Codes</th><th style="${thMed}">Contrast</th><th style="${th}">Instructions</th></tr>`;
  const rowsHTML = rows.map((r, idx) => {
    const stripeStyle = styleAttr(`background:${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'}`);
    const codeCell = `<strong>${esc(r.code)}</strong>`;
    return `<tr style="${stripeStyle}"><td style="${tdName}">${esc(r.visitType)}</td><td style="${tdCenter}">${codeCell}</td><td style="${tdMono}">${esc(r.cpt)}</td><td style="${td}">${esc(r.contrast)}</td><td style="${td}">${esc(r.instructions)}</td></tr>`;
  }).join('');

  const noteBlock = sharedEntityNotesBlock(sharedEntityNotes);
  // Suppress the empty table when there are no order rows; only the shared
  // entity notes block remains visible.
  const tableHTML = noRows ? '' : `<table style="${tableStyle}">${headerHTML}${rowsHTML}</table>`;
  return `<div style="${sectionWrap}">${tableHTML}${noteBlock}</div>`;
};

const calloutBox = (heading, color, bullets) => {
  const wrap = styleAttr(`background:${color.bg};border:2px solid ${color.border};border-radius:10px;padding:16px 18px`);
  const head = styleAttr(`font-size:13px;font-weight:800;color:${color.label};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px`);
  const ulStyle = styleAttr('margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#333');
  const empty = styleAttr('font-size:14px;line-height:1.7;color:#333');
  const body = bullets && bullets.length
    ? `<ul style="${ulStyle}">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
    : `<div style="${empty}">N/A</div>`;
  return `<div style="${wrap}"><div style="${head}">${esc(heading)}</div>${body}</div>`;
};

const sideBySideRow = (leftBox, rightBox) => {
  const wrap = styleAttr('padding:20px 36px;border-bottom:1px solid #eee');
  const tbl = styleAttr('width:100%;border-collapse:collapse');
  const tdL = styleAttr('width:50%;vertical-align:top;padding-right:10px');
  const tdR = styleAttr('width:50%;vertical-align:top;padding-left:10px');
  return `<div style="${wrap}"><table style="${tbl}"><tr><td style="${tdL}">${leftBox}</td><td style="${tdR}">${rightBox}</td></tr></table></div>`;
};

// ─────────── CR-specific sections ───────────

const descriptionBlock = (text) => {
  if (!text || !text.trim()) return '';
  const wrap = styleAttr('padding:18px 36px;border-bottom:1px solid #eee');
  const body = styleAttr('font-size:14px;color:#333;line-height:1.6');
  return `<div style="${wrap}"><div style="${body}">${esc(text)}</div></div>`;
};

const epicOrderablesSection = (rows) => {
  // Hide the entire section when there's nothing to display — keeps unstyled
  // placeholder tables out of partially-filled cards.
  if (!rows || rows.length === 0) return '';
  const sectionWrap = styleAttr('padding:18px 36px;border-bottom:1px solid #eee');
  const heading = styleAttr('font-size:13px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px');
  const tableStyle = styleAttr("width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-family:'Segoe UI', Arial, Helvetica, sans-serif");
  const headerRow = styleAttr('background:#003366;color:#ffffff');
  const th = styleAttr('text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366');
  const thCenter = styleAttr('text-align:center;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:140px');
  const thMono = styleAttr('text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:180px');
  const tdName = styleAttr('padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-weight:700;color:#003366');
  const tdCenter = styleAttr('padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:center');
  const tdMono = styleAttr("padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-family:Consolas, 'Courier New', monospace");

  const headerHTML = `<tr style="${headerRow}"><th style="${th}">Orderable Name</th><th style="${thCenter}">Contrast</th><th style="${thMono}">Epic ID</th></tr>`;
  const rowsHTML = rows.map((r, idx) => {
    const stripe = styleAttr(`background:${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'}`);
    return `<tr style="${stripe}"><td style="${tdName}">${esc(r.orderableName)}</td><td style="${tdCenter}">${esc(r.contrast)}</td><td style="${tdMono}">${esc(r.epicId)}</td></tr>`;
  }).join('');

  return `<div style="${sectionWrap}"><div style="${heading}">Epic Orderables / Exam Variants</div><table style="${tableStyle}">${headerHTML}${rowsHTML}</table></div>`;
};

const tipSheetsSection = (rows) => {
  // Hide the entire section when there's no tip sheet content. Previous behavior
  // rendered "No tip sheets linked yet." which clutters partially-filled cards.
  if (!rows || rows.length === 0) return '';
  const sectionWrap = styleAttr('padding:18px 36px;border-bottom:1px solid #eee');
  const heading = styleAttr('font-size:13px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px');
  const tableStyle = styleAttr("width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-family:'Segoe UI', Arial, Helvetica, sans-serif");
  const headerRow = styleAttr('background:#003366;color:#ffffff');
  const thTitle = styleAttr('text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366');
  const thLink = styleAttr('text-align:center;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:180px');
  const tdTitle = styleAttr('padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-weight:700;color:#003366');
  const tdLink = styleAttr('padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:center');
  const linkBtn = styleAttr('display:inline-block;background:#0077c8;color:#ffffff;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none');
  const noLink = styleAttr('color:#888;font-style:italic');

  const headerHTML = `<tr style="${headerRow}"><th style="${thTitle}">Title</th><th style="${thLink}">Link</th></tr>`;
  const rowsHTML = rows.map((r, idx) => {
    const stripe = styleAttr(`background:${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'}`);
    const href = safeHref(r.link);
    const linkCell = href
      ? `<a href="${href}" target="_blank" rel="noopener" style="${linkBtn}">Open Tip Sheet</a>`
      : `<span style="${noLink}">No link</span>`;
    return `<tr style="${stripe}"><td style="${tdTitle}">${esc(r.title)}</td><td style="${tdLink}">${linkCell}</td></tr>`;
  }).join('');

  return `<div style="${sectionWrap}"><div style="${heading}">Pertinent Tip Sheets</div><table style="${tableStyle}">${headerHTML}${rowsHTML}</table></div>`;
};

const standardCRNotesSection = (text) => {
  if (!text || !text.trim()) return '';
  const wrap = styleAttr('padding:18px 36px;border-bottom:1px solid #eee');
  const head = styleAttr('font-size:13px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px');
  const body = styleAttr('font-size:14px;color:#333;line-height:1.6');
  return `<div style="${wrap}"><div style="${head}">Standard CR Notes</div><div style="${body}">${esc(text)}</div></div>`;
};

// Big orange "Out of Scope for all entities" banner. Used when a procedure is flagged
// outOfScope=true at the top level — the card collapses to header + modality + this banner.
const outOfScopeBanner = (reason) => {
  const wrap = styleAttr('padding:32px 36px;border-bottom:1px solid #eee');
  const box = styleAttr('background:#fff3e0;border:2px solid #e65100;border-radius:12px;padding:28px 32px;text-align:center');
  const label = styleAttr('font-size:12px;color:#e65100;font-weight:800;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px');
  const title = styleAttr('font-size:28px;color:#e65100;font-weight:800;margin-bottom:14px;letter-spacing:0.5px');
  const body = styleAttr('font-size:16px;color:#5d3a00;line-height:1.6;font-weight:500');
  const defaultReason = 'This procedure is Out of Scope for all entities. Transfer to entities.';
  const text = (reason && reason.trim()) ? reason : defaultReason;
  return `<div style="${wrap}"><div style="${box}"><div style="${label}">Status</div><div style="${title}">OUT OF SCOPE &mdash; ALL ENTITIES</div><div style="${body}">${esc(text)}</div></div></div>`;
};

// ─────────── Card builders ───────────

const cardShell = (innerSections, kind = 'SCH') => {
  const outerWrap = styleAttr("font-family:'Segoe UI', Arial, Helvetica, sans-serif;max-width:1400px;margin:0 auto");
  const topAccent = styleAttr('background:#003366;height:6px;border-radius:12px 12px 0 0');
  const cardBox = styleAttr('background:#ffffff;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;margin-bottom:20px');
  return `<div style="${outerWrap}"><div style="${topAccent}"></div><div style="${cardBox}">${innerSections}</div>${reportFooter(kind)}</div>`;
};

// `entityLinks` (optional) — passed through to entityMatrixSection so each
// entity abbreviation becomes a clickable hyperlink to the appropriate
// (SCH or CR) entity reference page. Pass an object like
//   { THA: { sch: 'https://…', cr: 'https://…' }, … }
// from the React App layer; it stays optional so headless callers (scripts)
// can omit it and get plain-text entity cells (backwards compatible).
export const buildCardHTML = (data, entityLinks = null) => {
  if (data.outOfScope) {
    const sections = [
      headerSection(data.procedureName, data.headerImage, 'SCHEDULING INSTRUCTIONS'),
      modalityBanner(data.modality, data.modalityDescription),
      outOfScopeBanner(data.outOfScopeReason)
    ].join('');
    return cardShell(sections, 'SCH');
  }

  const orange = { bg: '#fff3e0', border: '#e65100', label: '#e65100' };
  const blue = { bg: '#e3f2fd', border: '#0077c8', label: '#0077c8' };
  const green = { bg: '#f0f7f3', border: '#009543', label: '#009543' };
  const gray = { bg: '#f5f5f5', border: '#888', label: '#555' };

  const statasap = sideBySideRow(
    calloutBox('STAT Orders', orange, data.stat),
    calloutBox('ASAP / Same Day / Next Day (Non-STAT)', blue, data.asap)
  );
  const sncovid = sideBySideRow(
    calloutBox('Special Needs', green, data.specialNeeds),
    calloutBox('COVID STATUS', gray, data.covid)
  );

  const sections = [
    headerSection(data.procedureName, data.headerImage, 'SCHEDULING INSTRUCTIONS'),
    modalityBanner(data.modality, data.modalityDescription),
    orderOptionsSection(data.orderOptions || [], data.sharedEntityNotes || []),
    entityMatrixSection(data.entityMatrix || [], 'SCH', entityLinks),
    statasap,
    sncovid
  ].join('');

  return cardShell(sections, 'SCH');
};

export const buildCRCardHTML = (data, entityLinks = null) => {
  if (data.outOfScope) {
    const sections = [
      headerSection(data.procedureName, data.headerImage, 'CLINICAL REVIEW NOTES'),
      modalityBanner(data.modality, data.modalityDescription),
      outOfScopeBanner(data.outOfScopeReason)
    ].join('');
    return cardShell(sections, 'CR');
  }
  const sections = [
    headerSection(data.procedureName, data.headerImage, 'CLINICAL REVIEW NOTES'),
    modalityBanner(data.modality, data.modalityDescription),
    descriptionBlock(data.description || ''),
    epicOrderablesSection(data.epicOrderables || []),
    tipSheetsSection(data.tipSheets || []),
    standardCRNotesSection(data.standardCRNotes || ''),
    entityMatrixSection(data.entityMatrix || [], 'CR', entityLinks)
  ].join('');

  return cardShell(sections, 'CR');
};
