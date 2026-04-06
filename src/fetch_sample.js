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
  let count5 = 0;
  let count3 = 0;
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.ModalityId === 5 && count5 < 3) {
      console.log("Modality 5:", data.Procedure);
      count5++;
    }
    if (data.ModalityId === 3 && count3 < 3) {
      console.log("Modality 3:", data.Procedure);
      count3++;
    }
  });
  process.exit(0);
}

main().catch(console.error);
