// Fictional exams, facilities and people for tests. Not THR data.

import { PREVIEW_SUPERVISORS } from '../previewPeople.js';

export const SUPERVISORS = PREVIEW_SUPERVISORS;

export const AVERY = { uid: 'u-avery', email: 'avery.lead@example.org', name: 'Avery Lead' };
export const BLAKE = { uid: 'u-blake', email: 'Blake.Sup@example.org', name: 'Blake Sup' };
export const FORMER = { uid: 'u-former', email: 'former.sup@example.org', name: 'Former Sup' };
export const VIEWER = { uid: 'u-viewer', email: 'viewer@example.org', name: 'Just Looking' };

export const FACILITIES = [
  { id: 'NORTH', name: 'North Clinic' },
  { id: 'SOUTH', name: 'South Hospital' },
  { id: 'EAST', name: 'East Imaging' },
];

const fac = (north, south, east, notes = {}) =>
  [['NORTH', north], ['SOUTH', south], ['EAST', east]].map(([facilityId, availability]) => ({
    facilityId, availability, note: notes[facilityId] || '',
  }));

export const EXAMS = [
  {
    id: 'ct-lower-extremity',
    name: 'CT Lower Extremity',
    kind: 'exam',
    category: 'CT',
    aliases: ['ct leg', 'ct knee'],
    orderables: ['CT LOWER EXTREMITY WO CONTRAST', 'CT LOWER EXTREMITY W CONTRAST'],
    scheduling: ['Schedule 30 minutes.', 'No prep.'],
    clinicalReview: ['Review for contrast allergy if with contrast.'],
    facilities: fac('yes', 'yes', 'no'),
    lastReviewed: '2026-09-02',
  },
  {
    id: 'ct-mako',
    name: 'CT MAKO Protocol',
    kind: 'protocol',
    parentId: 'ct-lower-extremity',
    category: 'CT',
    aliases: ['mako', 'mako knee'],
    orderables: ['CT LOWER EXTREMITY WO CONTRAST'],
    scheduling: ['Schedule 45 minutes.', 'Needs the surgeon-specific MAKO order.'],
    clinicalReview: ['Confirm the surgeon office sent the MAKO protocol request.'],
    facilities: fac('yes', 'no', 'no'),
    lastReviewed: '2026-09-02',
  },
  {
    id: 'mri-brain',
    name: 'MRI Brain',
    kind: 'exam',
    category: 'MRI',
    aliases: ['brain mri', 'head mri'],
    orderables: ['MRI BRAIN WO CONTRAST'],
    scheduling: ['Schedule 45 minutes.', 'Complete the MRI safety screening.'],
    clinicalReview: [],
    facilities: fac('yes', 'limited', 'yes', { SOUTH: 'Weekdays only' }),
    lastReviewed: '2026-09-02',
  },
];
