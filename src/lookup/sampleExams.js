// FICTIONAL SAMPLE DATA — for the lookup preview only.
// Facility names, guidance text and orderable names are made up. Nothing here
// comes from THR, SharePoint or the live Firestore database.
//
// Record shape:
//   kind          'exam' (a standard orderable exam) or 'protocol' (a special
//                 protocol performed under a parent exam's orderable)
//   parentId      protocols only: the exam this protocol is ordered under
//   aliases       PROTOCOL MATCHING words — the everyday wording supervisors
//                 type. These are what search uses to find the record.
//   orderables    TRANSCRIPTION / ORDER names as they appear on the order.
//                 Searched for standard exams only. A protocol's orderables are
//                 shown for reference but never searched, so a generic order
//                 name can't pull up a specialized protocol.
//   facilities    availability per facility: 'yes' | 'no' | 'limited'

export const FACILITIES = [
  { id: 'NGM', name: 'Northgate Medical Center' },
  { id: 'LKS', name: 'Lakeside Hospital' },
  { id: 'CHI', name: 'Cedar Hill Imaging' },
  { id: 'RBO', name: 'Riverbend Outpatient Center' },
  { id: 'WFH', name: 'Westfield Hospital' },
];

export const CATEGORIES = [
  'CT',
  'MRI',
  'Ultrasound',
  'Vascular Ultrasound',
  'Nuclear Medicine',
  'Fluoroscopy',
  "Women's Imaging",
];

const all = (availability, note = '') =>
  FACILITIES.map((f) => ({ facilityId: f.id, availability, note }));

export const SAMPLE_EXAMS = [
  {
    id: 'ct-lower-extremity',
    kind: 'exam',
    name: 'CT Lower Extremity',
    category: 'CT',
    aliases: ['ct leg', 'ct knee', 'ct ankle', 'ct foot', 'ct hip', 'ct tib fib', 'ct femur'],
    orderables: [
      'CT LOWER EXTREMITY WO CONTRAST',
      'CT LOWER EXTREMITY W CONTRAST',
      'CT LOWER EXTREMITY WO/W CONTRAST',
    ],
    scheduling: [
      'Schedule as a 30-minute CT slot.',
      'Confirm which side (left, right or both) before booking.',
      'With contrast: ask about kidney problems and contrast allergies.',
    ],
    clinicalReview: [
      'Without contrast is the usual choice for fractures and bone questions.',
      'With contrast needs a reason on the order (for example infection or a mass).',
    ],
    facilities: all('yes'),
    lastReviewed: '2026-09-02',
  },
  {
    id: 'ct-mako',
    kind: 'protocol',
    parentId: 'ct-lower-extremity',
    name: 'CT MAKO Knee/Hip Protocol',
    category: 'CT',
    aliases: ['mako', 'mako knee', 'mako hip', 'robotic knee planning', 'robotic hip planning'],
    orderables: ['CT LOWER EXTREMITY WO CONTRAST'],
    scheduling: [
      'Only book at a facility marked Offered below. Most sites cannot do MAKO.',
      'Schedule as a 45-minute CT slot; the scan covers hip, knee and ankle.',
      'Surgery date must be on the order. Book at least 7 days before surgery.',
    ],
    clinicalReview: [
      'Ordered under the CT Lower Extremity orderable. Look for "MAKO" in the order comments.',
      'Never with contrast. If the order says with contrast, call the ordering office.',
    ],
    facilities: [
      { facilityId: 'NGM', availability: 'yes', note: '' },
      { facilityId: 'LKS', availability: 'no', note: 'Scanner not set up for MAKO.' },
      { facilityId: 'CHI', availability: 'limited', note: 'Tuesdays and Thursdays only.' },
      { facilityId: 'RBO', availability: 'no', note: '' },
      { facilityId: 'WFH', availability: 'no', note: '' },
    ],
    lastReviewed: '2026-09-02',
  },
  {
    id: 'ct-upper-extremity',
    kind: 'exam',
    name: 'CT Upper Extremity',
    category: 'CT',
    aliases: ['ct arm', 'ct shoulder', 'ct elbow', 'ct wrist', 'ct hand'],
    orderables: ['CT UPPER EXTREMITY WO CONTRAST', 'CT UPPER EXTREMITY W CONTRAST'],
    scheduling: ['Schedule as a 30-minute CT slot.', 'Confirm which side before booking.'],
    clinicalReview: ['Without contrast is the usual choice for bone questions.'],
    facilities: all('yes'),
    lastReviewed: '2026-08-20',
  },
  {
    id: 'ct-head',
    kind: 'exam',
    name: 'CT Head',
    category: 'CT',
    aliases: ['ct brain', 'head ct', 'cat scan head'],
    orderables: ['CT HEAD WO CONTRAST', 'CT HEAD W CONTRAST', 'CT HEAD WO/W CONTRAST'],
    scheduling: [
      'Schedule as a 15-minute CT slot.',
      'STAT orders go to the next open slot; do not wait for a callback.',
    ],
    clinicalReview: ['Headache with no other symptoms: without contrast is expected.'],
    facilities: [
      ...all('yes').filter((f) => f.facilityId !== 'RBO'),
      { facilityId: 'RBO', availability: 'no', note: 'Outpatient site; send STAT orders to a hospital.' },
    ],
    lastReviewed: '2026-07-14',
  },
  {
    id: 'ct-abdomen-pelvis',
    kind: 'exam',
    name: 'CT Abdomen and Pelvis',
    category: 'CT',
    aliases: ['ct abd pelvis', 'ct belly', 'ct a/p', 'ct ap'],
    orderables: ['CT ABDOMEN PELVIS W CONTRAST', 'CT ABDOMEN PELVIS WO CONTRAST'],
    scheduling: [
      'Schedule as a 30-minute CT slot.',
      'With contrast: patient drinks oral contrast 1 hour before; tell them to arrive early.',
    ],
    clinicalReview: ['Kidney stone questions should be without contrast.'],
    facilities: all('yes'),
    lastReviewed: '2026-08-11',
  },
  {
    id: 'mri-brain',
    kind: 'exam',
    name: 'MRI Brain',
    category: 'MRI',
    aliases: ['mri head', 'brain mri', 'mr brain'],
    orderables: ['MRI BRAIN WO CONTRAST', 'MRI BRAIN WO/W CONTRAST'],
    scheduling: [
      'Schedule as a 45-minute MRI slot.',
      'Complete the MRI safety screening (implants, pacemaker, metal) before booking.',
    ],
    clinicalReview: ['With contrast needs a reason on the order (for example a known mass).'],
    facilities: all('yes'),
    lastReviewed: '2026-08-28',
  },
  {
    id: 'mri-brain-seizure',
    kind: 'protocol',
    parentId: 'mri-brain',
    name: 'MRI Brain Seizure Protocol',
    category: 'MRI',
    aliases: ['seizure protocol', 'epilepsy mri', 'seizure mri'],
    orderables: ['MRI BRAIN WO CONTRAST', 'MRI BRAIN WO/W CONTRAST'],
    scheduling: [
      'Schedule as a 60-minute MRI slot.',
      'Only book at a facility marked Offered below.',
    ],
    clinicalReview: ['Ordered under the MRI Brain orderable with "seizure" in the reason for exam.'],
    facilities: [
      { facilityId: 'NGM', availability: 'yes', note: '' },
      { facilityId: 'LKS', availability: 'yes', note: '' },
      { facilityId: 'CHI', availability: 'no', note: '' },
      { facilityId: 'RBO', availability: 'no', note: '' },
      { facilityId: 'WFH', availability: 'limited', note: 'Adults only.' },
    ],
    lastReviewed: '2026-08-28',
  },
  {
    id: 'mri-knee',
    kind: 'exam',
    name: 'MRI Knee',
    category: 'MRI',
    aliases: ['knee mri', 'mr knee'],
    orderables: ['MRI KNEE WO CONTRAST'],
    scheduling: ['Schedule as a 30-minute MRI slot.', 'Confirm which side before booking.'],
    clinicalReview: ['Arthrogram requests are a different exam; check the order.'],
    facilities: all('yes'),
    lastReviewed: '2026-06-30',
  },
  {
    id: 'mri-lumbar-spine',
    kind: 'exam',
    name: 'MRI Lumbar Spine',
    category: 'MRI',
    aliases: ['mri l spine', 'mri lower back', 'lumbar mri'],
    orderables: ['MRI LUMBAR SPINE WO CONTRAST', 'MRI LUMBAR SPINE WO/W CONTRAST'],
    scheduling: ['Schedule as a 45-minute MRI slot.'],
    clinicalReview: ['Prior back surgery: with and without contrast is usually expected.'],
    facilities: all('yes'),
    lastReviewed: '2026-06-30',
  },
  {
    id: 'us-abdomen-complete',
    kind: 'exam',
    name: 'Ultrasound Abdomen Complete',
    category: 'Ultrasound',
    aliases: ['us abdomen', 'abdominal ultrasound', 'us abd complete', 'gallbladder ultrasound'],
    orderables: ['US ABDOMEN COMPLETE'],
    scheduling: [
      'Schedule as a 45-minute ultrasound slot.',
      'Patient must not eat or drink for 8 hours before the exam.',
    ],
    clinicalReview: ['Gallbladder-only questions can be a limited abdomen exam instead.'],
    facilities: all('yes'),
    lastReviewed: '2026-07-21',
  },
  {
    id: 'us-venous-lower-extremity',
    kind: 'exam',
    name: 'Venous Doppler Lower Extremity',
    category: 'Vascular Ultrasound',
    aliases: ['dvt study', 'leg doppler', 'venous duplex leg', 'dvt ultrasound'],
    orderables: ['US VENOUS DOPPLER LOWER EXTREMITY BILATERAL', 'US VENOUS DOPPLER LOWER EXTREMITY UNILATERAL'],
    scheduling: ['Schedule as a 45-minute vascular slot.', 'Confirm one leg or both.'],
    clinicalReview: ['Suspected clot with leg swelling: treat as same-day.'],
    facilities: [
      ...all('yes').filter((f) => f.facilityId !== 'CHI'),
      { facilityId: 'CHI', availability: 'no', note: 'No vascular lab at this site.' },
    ],
    lastReviewed: '2026-09-10',
  },
  {
    id: 'mammo-screening',
    kind: 'exam',
    name: 'Screening Mammogram',
    category: "Women's Imaging",
    aliases: ['mammogram', 'mammo', 'annual mammogram', 'screening mammo', '3d mammogram'],
    orderables: ['MAMMO SCREENING BILATERAL W TOMO'],
    scheduling: [
      'Schedule as a 20-minute mammography slot.',
      'At least 12 months since the last screening mammogram.',
      'No lumps or symptoms; if there are symptoms, book a diagnostic mammogram.',
    ],
    clinicalReview: ['No order needed for patients 40 and older (fictional rule for the sample).'],
    facilities: all('yes'),
    lastReviewed: '2026-09-05',
  },
  {
    id: 'nm-bone-scan',
    kind: 'exam',
    name: 'Nuclear Medicine Bone Scan',
    category: 'Nuclear Medicine',
    aliases: ['bone scan', 'nm bone', 'whole body bone scan'],
    orderables: ['NM BONE SCAN WHOLE BODY'],
    scheduling: [
      'Two visits on the same day: injection, then scan about 3 hours later.',
      'Book the injection before 11 a.m.',
    ],
    clinicalReview: ['Check for a bone scan in the last 30 days.'],
    facilities: [
      { facilityId: 'NGM', availability: 'yes', note: '' },
      { facilityId: 'LKS', availability: 'yes', note: '' },
      { facilityId: 'CHI', availability: 'no', note: '' },
      { facilityId: 'RBO', availability: 'no', note: '' },
      { facilityId: 'WFH', availability: 'yes', note: '' },
    ],
    lastReviewed: '2026-05-18',
  },
  {
    id: 'fluoro-esophagram',
    kind: 'exam',
    name: 'Esophagram',
    category: 'Fluoroscopy',
    aliases: ['barium swallow', 'esophagus study', 'swallow study barium'],
    orderables: ['FL ESOPHAGRAM'],
    scheduling: [
      'Schedule as a 30-minute fluoroscopy slot.',
      'Nothing to eat or drink after midnight.',
    ],
    clinicalReview: ['A "modified barium swallow" is a speech therapy exam, not this one.'],
    facilities: [
      ...all('yes').filter((f) => f.facilityId !== 'RBO'),
      { facilityId: 'RBO', availability: 'no', note: '' },
    ],
    lastReviewed: '2026-04-09',
  },
];
