require('dotenv').config({ path: '.env.local' });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');
const { getAuth, signInAnonymously } = require('firebase/auth');

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function checkProjects() {
    try {
        await signInAnonymously(auth);
        console.log("Signed in anonymously");

        const q = query(collection(db, "projects"));
        console.log("Project ID:", firebaseConfig.projectId);
        const snapshot = await getDocs(q);

        console.log(`Found ${snapshot.size} queued projects.`);
        snapshot.forEach(doc => {
            console.log(doc.id, doc.data());
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

checkProjects();
