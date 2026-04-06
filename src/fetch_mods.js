import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

// Read firebase config from firebase.js
const firebaseConfigStr = fs.readFileSync('firebase.js', 'utf8');
const configMatch = firebaseConfigStr.match(/const firebaseConfig = ({[\s\S]+?});/);
if (!configMatch) {
  console.log("Could not find config");
  process.exit(1);
}

// eval it
let firebaseConfig;
eval("firebaseConfig = " + configMatch[1]);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  const querySnapshot = await getDocs(collection(db, "procedures"));
  const mods = new Set();
  const counts = {};
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    mods.add(data.ModalityId);
    counts[data.ModalityId] = (counts[data.ModalityId] || 0) + 1;
  });
  console.log(Array.from(mods));
  console.log(counts);
  process.exit(0);
}

main().catch(console.error);
