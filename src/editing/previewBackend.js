// previewBackend.js — editing for the static preview. Everything stays in this
// browser (localStorage); there is no server and no Firebase. Sign-in is a
// pick-a-person list of fictional people.

import { createMemoryStore } from './memoryStore';
import { getPublishedExams } from '../lookup/examSource';
import { PREVIEW_PEOPLE, PREVIEW_SUPERVISORS } from './previewPeople';

const STORE_KEY = 'portal-preview-edits-v1';
const USER_KEY = 'portal-preview-user-v1';

const readUser = () => {
  try {
    const uid = localStorage.getItem(USER_KEY);
    return PREVIEW_PEOPLE.find((p) => p.uid === uid) || null;
  } catch {
    return null;
  }
};

export function createPreviewBackend() {
  const store = createMemoryStore({
    exams: getPublishedExams().map((e) => ({ ...e, updatedBy: { name: 'Sample data' }, updatedAt: `${e.lastReviewed}T12:00:00Z` })),
    supervisors: PREVIEW_SUPERVISORS,
    storageKey: STORE_KEY,
  });
  let user = readUser();
  const authListeners = new Set();
  const setUser = (next) => {
    user = next;
    try {
      if (next) localStorage.setItem(USER_KEY, next.uid);
      else localStorage.removeItem(USER_KEY);
    } catch { /* ignore */ }
    for (const fn of authListeners) fn(user);
  };

  return {
    mode: 'preview',
    store,
    people: PREVIEW_PEOPLE,
    currentUser: () => user,
    onUserChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },
    async signInAs(uid) { setUser(PREVIEW_PEOPLE.find((p) => p.uid === uid) || null); },
    async signOut() { setUser(null); },
    subscribeExams(fn) {
      const load = () => store.listExams().then(fn);
      load();
      return store.subscribe(load);
    },
    resetPreview() { store.reset(); },
  };
}
