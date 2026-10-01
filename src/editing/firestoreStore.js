// firestoreStore.js — the editing store on Firestore. Same interface as
// memoryStore. Pass it a Firestore instance from firebaseEditing.js, which only
// connects to the local emulator or a non-production project.
//
// Collections: exams, examVersions, examDrafts, supervisors (see
// firestore.rules for who may write what).

import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, runTransaction,
} from 'firebase/firestore';

const plain = (v) => JSON.parse(JSON.stringify(v));
const draftId = (examId, uid) => `${examId}__${uid}`;
const versionId = (examId, n) => `${examId}__v${n}`;

export function createFirestoreStore(db) {
  const data = (snap) => (snap.exists() ? snap.data() : null);

  return {
    async listExams() {
      return (await getDocs(collection(db, 'exams'))).docs.map((d) => d.data());
    },
    async getExam(id) {
      return data(await getDoc(doc(db, 'exams', id)));
    },

    async getDraft(examId, uid) {
      return data(await getDoc(doc(db, 'examDrafts', draftId(examId, uid))));
    },
    async listDraftsBy(uid) {
      const q = query(collection(db, 'examDrafts'), where('owner.uid', '==', uid));
      return (await getDocs(q)).docs.map((d) => d.data());
    },
    async saveDraft(draft) {
      await setDoc(doc(db, 'examDrafts', draftId(draft.examId, draft.owner.uid)), plain(draft));
    },
    async deleteDraft(examId, uid) {
      await deleteDoc(doc(db, 'examDrafts', draftId(examId, uid)));
    },

    async listVersions(examId) {
      const q = query(collection(db, 'examVersions'), where('examId', '==', examId));
      return (await getDocs(q)).docs.map((d) => d.data()).sort((a, b) => b.version - a.version);
    },

    // Exam + version in one transaction; fails if someone published first.
    async commitPublish({ exam, version, expectedVersion }) {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'exams', exam.id);
        const cur = await tx.get(ref);
        if ((cur.exists() ? cur.data().version : 0) !== expectedVersion) {
          const e = new Error('The published version moved.');
          e.code = 'version-moved';
          throw e;
        }
        tx.set(ref, plain(exam));
        tx.set(doc(db, 'examVersions', versionId(exam.id, version.version)), plain(version));
      });
    },

    async getSupervisor(email) {
      return data(await getDoc(doc(db, 'supervisors', email)));
    },
    async listSupervisors() {
      return (await getDocs(collection(db, 'supervisors'))).docs.map((d) => d.data());
    },
    async saveSupervisor(rec) {
      await setDoc(doc(db, 'supervisors', rec.email), plain(rec));
    },
  };
}
