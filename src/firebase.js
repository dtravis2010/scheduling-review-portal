import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDF0aNH6s3oMi8eWTMiI7OOB5vghKxExBs",
  authDomain: "scheduling-review.firebaseapp.com",
  projectId: "scheduling-review",
  storageBucket: "scheduling-review.firebasestorage.app",
  messagingSenderId: "71175933232",
  appId: "1:71175933232:web:f410bfac6b4c38553a8cf5",
  measurementId: "G-3N5L6XWT1M"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
