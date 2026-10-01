// examSource.js — the one place the lookup gets its published exam records.
// Today it returns the fictional sample set. Publishing (or a real, approved
// dataset) swaps what these return without touching search or the UI.
import { SAMPLE_EXAMS, FACILITIES, CATEGORIES } from './sampleExams.js';

export const getPublishedExams = () => SAMPLE_EXAMS;
export const getFacilities = () => FACILITIES;
export const getCategories = () => CATEGORIES;
