// cardBuilder.js
// Build a v11-style Scheduling_x0020_Instructions HTML string from a structured object.
// IMPORTANT: SharePoint requires colons in inline styles to be encoded as &#58;
// (otherwise it strips them). This builder handles that automatically.

const C = '&#58;';   // encoded colon
const NBSP = '&#160;';

// Encode a string for safe inclusion as text inside an HTML element.
const esc = (s) => {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

// Encode colons in a CSS style string (for use inside style="..." attributes)
const styleAttr = (css) => css.replace(/:/g, C);

const headerSection = (procedureName, headerImage) => {
  const titleStyle = styleAttr(
    "padding:24px 36px;vertical-align:middle"
  );
  const labelStyle = styleAttr(
    "font-size:11px;color:#a3c4e0;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:2px"
  );
  const titleTextStyle = styleAttr(
    "font-size:32px;font-weight:700;color:#ffffff;margin-bottom:8px"
  );
  const accentStyle = styleAttr(
    "height:3px;width:60px;background:#009543;border-radius:2px"
  );
  const imgCellStyle = styleAttr(
    "padding:16px 28px 16px 0;vertical-align:middle;text-align:right;width:200px"
  );
  const imgStyle = styleAttr(
    "max-width:180px;max-height:120px;border-radius:8px;background:#ffffff;padding:4px;box-shadow:0 2px 6px rgba(0,0,0,0.15)"
  );
  const imgCell = headerImage
    ? `<td style="${imgCellStyle}"><img src="${esc(headerImage)}" alt="${esc(procedureName)}" style="${imgStyle}" /></td>`
    : '';
  return `<div style="${styleAttr('background:#003366;padding:0')}"><table style="${styleAttr('width:100%;border-collapse:collapse')}"><tr><td style="${titleStyle}"><div style="${labelStyle}">SCHEDULING INSTRUCTIONS</div><div style="${titleTextStyle}">${esc(procedureName)}</div><div style="${accentStyle}"></div></td>${imgCell}</tr></table></div>`;
};

const modalityBanner = (modality) => {
  const wrap = styleAttr("background:#e8f5e9;border-bottom:2px solid #009543;padding:14px 36px");
  const lbl = styleAttr("font-size:11px;color:#003366;font-weight:700;letter-spacing:1px;text-transform:uppercase");
  const val = styleAttr("font-size:16px;color:#003366;font-weight:700;margin-top:2px");
  return `<div style="${wrap}"><div style="${lbl}">Modality</div><div style="${val}">${esc(modality)}</div></div>`;
};

const orderOptionsSection = (rows) => {
  const sectionWrap = styleAttr("padding:18px 36px;border-bottom:1px solid #eee");
  const heading = styleAttr("font-size:13px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px");
  const tableStyle = styleAttr("width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-family:'Segoe UI', Arial, Helvetica, sans-serif");
  const headerRow = styleAttr("background:#003366;color:#ffffff");
  const th = styleAttr("text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366");
  const thCenter = styleAttr("text-align:center;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:70px");
  const thWide = styleAttr("text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:220px");
  const thMed = styleAttr("text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:200px");
  const td = styleAttr("padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:left");
  const tdCenter = styleAttr("padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:center");
  const tdMono = styleAttr("padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-family:Consolas, 'Courier New', monospace");
  const tdName = styleAttr("padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-weight:700;color:#003366");
  const badge = styleAttr("display:inline-block;padding:2px 10px;border-radius:12px;background:#e8f5e9;color:#2e7d32;font-weight:700;font-size:12px;border:1px solid #a5d6a7");

  const headerHTML = `<tr style="${headerRow}"><th style="${th}">Visit Type</th><th style="${thCenter}">Code</th><th style="${thWide}">CPT Codes</th><th style="${thMed}">Contrast</th><th style="${th}">Instructions</th></tr>`;

  const rowsHTML = rows.map((r, idx) => {
    const stripeStyle = styleAttr(`background:${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'}`);
    return `<tr style="${stripeStyle}"><td style="${tdName}">${esc(r.visitType)}</td><td style="${tdCenter}"><span style="${badge}">${esc(r.code)}</span></td><td style="${tdMono}">${esc(r.cpt)}</td><td style="${td}">${esc(r.contrast)}</td><td style="${td}">${esc(r.instructions)}</td></tr>`;
  }).join('');

  return `<div style="${sectionWrap}"><div style="${heading}">Order Options</div><table style="${tableStyle}">${headerHTML}${rowsHTML}</table></div>`;
};

const standardInstructionsSection = (text) => {
  const wrap = styleAttr("padding:18px 36px;border-bottom:1px solid #eee");
  const heading = styleAttr("font-size:13px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px");
  const body = styleAttr("font-size:14px;color:#333;line-height:1.6");
  return `<div style="${wrap}"><div style="${heading}">Standard Instructions</div><div style="${body}">${esc(text)}</div></div>`;
};

const entityMatrixSection = (rows) => {
  const wrap = styleAttr("padding:18px 36px;border-bottom:1px solid #eee");
  const heading = styleAttr("font-size:13px;font-weight:800;color:#003366;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px");
  const hint = styleAttr("font-size:12px;color:#666;margin-bottom:10px;font-style:italic");
  const tableStyle = styleAttr("width:100%;border-collapse:collapse;border:1px solid #e0e0e0;font-family:'Segoe UI', Arial, Helvetica, sans-serif;margin-top:12px");
  const headerRowStyle = styleAttr("background:#003366;color:#ffffff");
  const th = styleAttr("text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:90px");
  const thCenter = styleAttr("text-align:center;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366;width:110px");
  const thNotes = styleAttr("text-align:left;padding:10px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:1px solid #003366");
  const tdEntity = styleAttr("padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:left;font-weight:700;color:#003366");
  const tdYes = styleAttr("padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:center;background:#e8f5e9;color:#2e7d32;font-weight:700;letter-spacing:0.5px");
  const tdNo = styleAttr("padding:10px 12px;font-size:13px;line-height:1.5;border:1px solid #e0e0e0;text-align:center;background:#ffebee;color:#c62828;font-weight:700;letter-spacing:0.5px");
  const tdNotes = styleAttr("padding:10px 12px;font-size:13px;color:#333;line-height:1.5;border:1px solid #e0e0e0;text-align:left");

  const headerHTML = `<tr style="${headerRowStyle}"><th style="${th}">Entity</th><th style="${thCenter}">Performs</th><th style="${thNotes}">Entity Notes</th></tr>`;
  const rowsHTML = rows.map((r, idx) => {
    const stripe = styleAttr(`background:${idx % 2 === 0 ? '#ffffff' : '#f8f9fa'}`);
    const performsCell = r.performs === 'NO'
      ? `<td style="${tdNo}">NO</td>`
      : `<td style="${tdYes}">YES</td>`;
    const notesText = r.notes && r.notes.trim() ? esc(r.notes) : '&mdash;';
    return `<tr style="${stripe}"><td style="${tdEntity}">${esc(r.entity)}</td>${performsCell}<td style="${tdNotes}">${notesText}</td></tr>`;
  }).join('');

  return `<div style="${wrap}"><div style="${heading}">Entity Matrix</div><div style="${hint}">Edit any cell directly in SharePoint to update a single entity&#8217;s status or notes. Common notes are hoisted above the table.</div><table style="${tableStyle}">${headerHTML}${rowsHTML}</table></div>`;
};

const calloutBox = (heading, color, bullets) => {
  // color = { bg, border, label }
  const wrap = styleAttr(`background:${color.bg};border:2px solid ${color.border};border-radius:10px;padding:16px 18px`);
  const head = styleAttr(`font-size:13px;font-weight:800;color:${color.label};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px`);
  const ulStyle = styleAttr("margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#333");
  const empty = styleAttr("font-size:14px;line-height:1.7;color:#333");
  const body = bullets && bullets.length
    ? `<ul style="${ulStyle}">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
    : `<div style="${empty}">N/A</div>`;
  return `<div style="${wrap}"><div style="${head}">${esc(heading)}</div>${body}</div>`;
};

const sideBySideRow = (leftBox, rightBox) => {
  const wrap = styleAttr("padding:20px 36px;border-bottom:1px solid #eee");
  const tbl = styleAttr("width:100%;border-collapse:collapse");
  const tdL = styleAttr("width:50%;vertical-align:top;padding-right:10px");
  const tdR = styleAttr("width:50%;vertical-align:top;padding-left:10px");
  return `<div style="${wrap}"><table style="${tbl}"><tr><td style="${tdL}">${leftBox}</td><td style="${tdR}">${rightBox}</td></tr></table></div>`;
};

const reportFooter = () => {
  const wrap = styleAttr("text-align:center;padding:10px 0");
  const p = styleAttr("font-size:12px;color:#888;margin:0 0 8px");
  const a = styleAttr("display:inline-block;background:#003366;color:#fff;padding:8px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;border-bottom:3px solid #001a33");
  return `<div style="${wrap}"><p style="${p}"><em>To report a scheduling instruction issue, include the Exam, Entity, and Notes.</em></p><a href="mailto${C}THRESCommunications@texashealth.org?subject=Scheduling%20Issue&body=Entity%3A%0AExam%3A%0ANotes%3A" style="${a}">Report Issue</a></div>`;
};

export const buildCardHTML = (data) => {
  const orange = { bg: '#fff3e0', border: '#e65100', label: '#e65100' };
  const blue = { bg: '#e3f2fd', border: '#0077c8', label: '#0077c8' };
  const green = { bg: '#f0f7f3', border: '#009543', label: '#009543' };
  const gray = { bg: '#f5f5f5', border: '#888', label: '#555' };

  const outerWrap = styleAttr("font-family:'Segoe UI', Arial, Helvetica, sans-serif;max-width:1400px;margin:0 auto");
  const topAccent = styleAttr("background:#003366;height:6px;border-radius:12px 12px 0 0");
  const cardBox = styleAttr("background:#ffffff;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;margin-bottom:20px");

  const statasap = sideBySideRow(
    calloutBox('STAT Orders', orange, data.stat),
    calloutBox('ASAP / Same Day / Next Day (Non-STAT)', blue, data.asap)
  );
  const sncovid = sideBySideRow(
    calloutBox('Special Needs', green, data.specialNeeds),
    calloutBox('COVID STATUS', gray, data.covid)
  );

  return `<div style="${outerWrap}"><div style="${topAccent}"></div><div style="${cardBox}">${headerSection(data.procedureName, data.headerImage)}${modalityBanner(data.modality)}${orderOptionsSection(data.orderOptions)}${standardInstructionsSection(data.standardInstructions)}${entityMatrixSection(data.entityMatrix)}${statasap}${sncovid}</div>${reportFooter()}</div>`;
};
