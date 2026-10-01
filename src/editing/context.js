import { createContext, useContext } from 'react';
import { getFacilities } from '../lookup/examSource';

export const EditingContext = createContext(null);
export const useEditing = () => useContext(EditingContext);
export const facilityNames = Object.fromEntries(getFacilities().map((f) => [f.id, f.name]));
