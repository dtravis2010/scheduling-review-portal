// emulatorBackend.js — editing against the LOCAL Firebase emulator, for
// developers (npm run dev:emulator). Only bundled when
// VITE_EDITING_BACKEND=emulator. The project id starts with "demo-", which
// Firebase treats as offline-only, so this can never reach production.
//
// Sign-in uses Firebase email links: the supervisor types their work email,
// gets a link, and opening it signs them in with a verified email. In the
// emulator the link is printed in the emulator's terminal instead of emailed.
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, sendSignInLinkToEmail,
  isSignInWithEmailLink, signInWithEmailLink, signOut,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { createFirestoreStore } from './firestoreStore';

const PROJECT_ID = 'demo-scheduling-review';
const EMAIL_KEY = 'portal-sign-in-email';

export async function createEmulatorBackend() {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key', authDomain: `${PROJECT_ID}.firebaseapp.com` }, 'editing');
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const store = createFirestoreStore(db);

  if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = null;
    try { email = localStorage.getItem(EMAIL_KEY); } catch { /* ignore */ }
    if (!email) email = window.prompt('Confirm your work email to finish signing in');
    if (email) {
      await signInWithEmailLink(auth, email, window.location.href);
      try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
      window.history.replaceState(null, '', `${window.location.pathname}#find`);
    }
  }

  const toUser = async (u) => {
    if (!u || !u.emailVerified) return null;
    const email = u.email.toLowerCase();
    const sup = await getDoc(doc(db, 'supervisors', email)).catch(() => null);
    return { uid: u.uid, email, name: sup?.exists() ? sup.data().name : u.email };
  };

  let user = await toUser(auth.currentUser);
  const listeners = new Set();
  onAuthStateChanged(auth, async (u) => {
    user = await toUser(u);
    for (const fn of listeners) fn(user);
  });

  return {
    mode: 'emulator',
    store,
    currentUser: () => user,
    onUserChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async sendSignInLink(email) {
      const url = `${window.location.origin}${window.location.pathname}`;
      await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
      try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
    },
    async signOut() { await signOut(auth); },
    subscribeExams(fn) {
      return onSnapshot(collection(db, 'exams'), (snap) => fn(snap.docs.map((d) => d.data())));
    },
  };
}
