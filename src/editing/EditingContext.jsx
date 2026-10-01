// EditingContext — who is signed in, whether they can edit, the live published
// exams, and the editing service, for every screen.
//
// The backend is chosen at build time. Keep the env check inline so Vite can
// drop the emulator (Firebase) code from preview builds.
import { useEffect, useMemo, useState } from 'react';
import { createEditingService } from './editingService';
import { findConflicts } from './conflicts';
import { getFacilities } from '../lookup/examSource';
import { createPreviewBackend } from './previewBackend';
import { EditingContext, facilityNames } from './context';

// One backend per page load (React StrictMode runs effects twice in dev, and an
// email sign-in link can only be used once).
let backendPromise = null;
const loadBackend = () => {
  backendPromise ||=
    import.meta.env.VITE_EDITING_BACKEND === 'emulator'
      ? import('./emulatorBackend.js').then((m) => m.createEmulatorBackend())
      : Promise.resolve(createPreviewBackend());
  return backendPromise;
};

export function EditingProvider({ children, backend: injected }) {
  const [backend, setBackend] = useState(injected || null);
  const [user, setUser] = useState(() => injected?.currentUser() ?? null);
  const [access, setAccess] = useState({ canEdit: false, canManage: false, checked: false });
  const [exams, setExams] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (backend) return undefined;
    let cancelled = false;
    loadBackend().then(
      (b) => { if (!cancelled) { setUser(b.currentUser()); setBackend(b); } },
      (e) => setError(e.message),
    );
    return () => { cancelled = true; };
  }, [backend]);

  const service = useMemo(
    () => (backend ? createEditingService(backend.store, { facilities: getFacilities() }) : null),
    [backend],
  );

  useEffect(() => {
    if (!backend) return undefined;
    const offUser = backend.onUserChange(setUser);
    const offExams = backend.subscribeExams(setExams);
    return () => { offUser(); offExams(); };
  }, [backend]);

  useEffect(() => {
    if (!service) return undefined;
    let cancelled = false;
    Promise.all([service.canEdit(user), service.canManageSupervisors(user)]).then(
      ([canEdit, canManage]) => { if (!cancelled) setAccess({ canEdit, canManage, checked: true }); },
      () => { if (!cancelled) setAccess({ canEdit: false, canManage: false, checked: true }); },
    );
    return () => { cancelled = true; };
    // `exams` re-checks access after any publish (e.g. a supervisor list change).
  }, [service, user, exams]);

  const conflicts = useMemo(() => (exams ? findConflicts(exams, facilityNames) : []), [exams]);

  const value = useMemo(
    () => ({ backend, service, user, exams, conflicts, error, ...access }),
    [backend, service, user, exams, conflicts, error, access],
  );
  return <EditingContext.Provider value={value}>{children}</EditingContext.Provider>;
}
