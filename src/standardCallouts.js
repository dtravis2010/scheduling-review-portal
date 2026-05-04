// standardCallouts.js
// The canonical STAT / ASAP / Special Needs / COVID bullet text used on every
// non-OOS SCH card. Imported by both the editor (as defaults for empty fields)
// and the backfill scripts.

export const STANDARD_STAT_BULLETS = [
  'Contact the department for approval to add to the schedule, then send an Add-On email to the DL.',
  '"STAT" must be on a valid order (5 criteria). Ask if it has STAT.',
  "If no open slot, obtain approval to double-book (except THAllen) or refer to another location. Document the approving person's name in RAD Notes.",
  'Inform the caller of potential delay. Send an Add-On email to the facility and call the radiology department for a heads-up.'
];

export const STANDARD_ASAP_BULLETS = [
  "For same-day scheduling, obtain department permission. Document the approving person's name in RAD Notes and send an Add-On email.",
  "If it's 2:00 p.m. or later and the caller wants the next day before 10:00 a.m., obtain department permission. Document approver in RAD Notes and send an Add-On email.",
  "If it's 2:00 p.m. or later and the caller wants the next day after 10:00 a.m., schedule the appointment, call the department, and send an Add-On email.",
  'Valid order (5 criteria) must be faxed in with NO failed MN, an Add-On email sent, and the procedure must not require authorization. For modalities requiring auth, ASAP is typically 48 business hours unless permission is granted.'
];

export const STANDARD_SPECIAL_NEEDS_BULLETS = [
  'If answered yes, note the required assistance in RAD Notes: wheelchair, lift, interpreter, limited range of motion, cane, etc.',
  'For lift or interpreter, send an Add-On email.'
];

export const STANDARD_COVID_BULLETS = [
  "Ask for the patient's COVID status when scheduling 10 days or less out.",
  'If they answer yes, document the date of the positive result in the Appt. Notes.',
  'If the patient can wear a mask and symptoms are improving, schedule 5 days out from the date of symptom onset or from the date they tested positive.',
  'If the patient cannot wear a mask or symptoms are not improving, schedule 10 days out from symptom onset or from date they tested positive.'
];
