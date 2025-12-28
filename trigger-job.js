const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc } = require('firebase/firestore');
const { getAuth, signInAnonymously } = require('firebase/auth');
require('dotenv').config({ path: '.env.local' });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

async function main() {
    console.log('Initializing Firebase...');
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);

    console.log('Signing in...');
    await signInAnonymously(auth);

    console.log('Creating test job...');
    const docRef = await addDoc(collection(db, 'projects'), {
        url: 'http://localhost:3000', // Target local app
        status: 'queued',
        createdAt: new Date(),
        auth: {
            password: 'mock-password-123' // Just to test the logic attempts it
        }
    });

    console.log(`Job created with ID: ${docRef.id}`);
    process.exit(0);
}

main().catch(console.error);
