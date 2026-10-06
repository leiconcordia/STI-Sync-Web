import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyCW-g385o-RT7GE_z-Q0FpMz9P5HR4LUuo",
  authDomain:        "sti-sync.firebaseapp.com",
  projectId:         "sti-sync",
  storageBucket:     "sti-sync.firebasestorage.app",
  messagingSenderId: "821083100323",
  appId:             "1:821083100323:web:b18bb485a6df1bb5d31b16",
  measurementId:     "G-51X2P4CQV7",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

async function check() {
  console.log("=== ACTIVITIES ===");
  const actSnap = await getDocs(collection(db, "activities"));
  console.log(`activities count: ${actSnap.size}`);
  for (const d of actSnap.docs) {
    const data = d.data();
    console.log(`[ACTIVITY] ${d.id}: "${data.title}" | date: ${data.date} | isPublished: ${data.isPublished} | status: ${data.status} | proposalStatus: ${data.proposalStatus} | sessions: ${(data.sessions || []).length} | scanners: ${(data.scannerUserIds || []).length}`);
  }

  console.log("\n=== EVENTS ===");
  const evtSnap = await getDocs(collection(db, "events"));
  console.log(`events count: ${evtSnap.size}`);
  for (const d of evtSnap.docs) {
    const data = d.data();
    console.log(`[EVENT] ${d.id}: "${data.title}" | date: ${data.date} | isPublished: ${data.isPublished} | status: ${data.status} | proposalStatus: ${data.proposalStatus} | sessions: ${(data.sessions || []).length} | scanners: ${(data.scannerUserIds || []).length}`);
  }

  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
