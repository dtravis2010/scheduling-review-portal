// modalities.js — single source of truth for ModalityId → display label.
// The OOS page relabels ID 1 as plain "CT" (NM gets its own bucket there);
// derive that variant here so the two can never drift apart.

export const MODALITY_NAME = {
  1: 'CT / NM',
  2: 'MRI',
  3: 'GI & Fluoro',
  4: 'Vascular Ultrasound',
  5: 'General Ultrasound',
  6: "Women's Services",
  7: 'NM',
  8: 'IR',
};

export const OOS_MODALITY_NAME = { ...MODALITY_NAME, 1: 'CT' };
