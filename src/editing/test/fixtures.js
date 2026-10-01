// Fictional exams, facilities and people for tests. Not THR data.

export const SUPERVISORS = [
  { email: 'avery.lead@example.org', name: 'Avery Lead', active: true, canManageSupervisors: true },
  { email: 'blake.sup@example.org', name: 'Blake Sup', active: true, canManageSupervisors: false },
  { email: 'former.sup@example.org', name: 'Former Sup', active: false, canManageSupervisors: false },
];

export const AVERY = { uid: 'u-avery', email: 'avery.lead@example.org', name: 'Avery Lead' };
export const BLAKE = { uid: 'u-blake', email: 'Blake.Sup@example.org', name: 'Blake Sup' };
export const FORMER = { uid: 'u-former', email: 'former.sup@example.org', name: 'Former Sup' };
export const VIEWER = { uid: 'u-viewer', email: 'viewer@example.org', name: 'Just Looking' };

export const EXAMS = [
  {
    id: 'ct-lower-extremity',
    name: 'CT Lower Extremity',
    kind: 'orderable',
    category: 'CT',
    aliases: ['CT leg', 'CT knee'],
    orderables: ['CT LOWER EXTREMITY WO CONTRAST', 'CT LOWER EXTREMITY W CONTRAST'],
    scheduling: 'Schedule 30 minutes. No prep.',
    clinicalReview: 'Review for contrast allergy if with contrast.',
    facilities: [
      { code: 'NORTH', status: 'yes', note: '' },
      { code: 'SOUTH', status: 'yes', note: '' },
      { code: 'EAST', status: 'no', note: '' },
    ],
  },
  {
    id: 'ct-mako',
    name: 'CT MAKO Protocol',
    kind: 'protocol',
    parentId: 'ct-lower-extremity',
    category: 'CT',
    aliases: ['MAKO', 'MAKO knee'],
    orderables: ['CT MAKO KNEE'],
    scheduling: 'Schedule 45 minutes. Needs the surgeon-specific MAKO order.',
    clinicalReview: 'Confirm the surgeon office sent the MAKO protocol request.',
    facilities: [
      { code: 'NORTH', status: 'yes', note: '' },
      { code: 'SOUTH', status: 'no', note: '' },
      { code: 'EAST', status: 'no', note: '' },
    ],
  },
  {
    id: 'mri-brain',
    name: 'MRI Brain',
    kind: 'orderable',
    category: 'MRI',
    aliases: ['brain MRI', 'head MRI'],
    orderables: ['MRI BRAIN WO CONTRAST'],
    scheduling: 'Schedule 45 minutes. Complete the MRI safety screening.',
    clinicalReview: '',
    facilities: [
      { code: 'NORTH', status: 'yes', note: '' },
      { code: 'SOUTH', status: 'limited', note: 'Weekdays only' },
      { code: 'EAST', status: 'yes', note: '' },
    ],
  },
];
