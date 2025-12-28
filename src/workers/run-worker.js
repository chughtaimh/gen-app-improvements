/**
 * Worker Service
 * Listens for new jobs and executes the agent.
 * Run with: node src/workers/run-worker.js
 */
require('dotenv').config({ path: '.env.local' });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } = require('firebase/firestore');
const { getAuth, signInAnonymously } = require('firebase/auth');
const BrowserAgent = require('../agent/browser');
const Analyst = require('../agent/analyst');

// Firebase Setup (Node.js context)
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

// Globals
let isProcessing = false;
const analyst = new Analyst(process.env.GEMINI_API_KEY);

async function startWorker() {
    console.log('Build the AI Agent (Worker) v1.0');
    console.log('Listening for queued projects...');

    // Sign in anonymously to satisfy basic security rules
    try {
        await signInAnonymously(auth);
        console.log('Worker signed in anonymously.');
    } catch (e) {
        console.error('Worker auth failed:', e.message);
    }

    const q = query(
        collection(db, "projects"),
        where("status", "==", "queued")
    );

    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) return;
        if (isProcessing) return; // Simple concurrency lock for MVP

        const job = snapshot.docs[0];
        const data = job.data();

        await processJob(job.id, data);
    });
}

async function processJob(projectId, data) {
    isProcessing = true;
    console.log(`\n[Job] Starting project: ${projectId} (${data.url})`);

    try {
        // 1. Update Status: Running
        await updateProject(projectId, { status: 'navigating' });

        // 2. Browser Agent
        const agent = new BrowserAgent(projectId);
        const results = await agent.navigateAndRecord(data.url, data.auth);
        results.projectId = projectId; // Inject ID for Analyst to find files

        // 3. Update Status: Analyzing
        await updateProject(projectId, { status: 'analyzing' });

        // 4. AI Analyst
        const analysis = await analyst.analyze(results);

        // 5. Complete
        await updateProject(projectId, {
            status: 'completed',
            results: results, // Should probably upload files and store URLs, but for MVP local path ok?
            // Actually front-end can't read local paths. 
            // For MVP Demo: We just store the filename and assume front-end serves from public/artifacts 
            // (This requires next.js config change to serve public/artifacts if it's outside?) 
            // Wait, BrowserAgent saves to `public/artifacts`. Next.js serves `public` folder automatically!
            // So path should be `/artifacts/${projectId}/${filename}`
            report: analysis,
            completedAt: serverTimestamp()
        });

        console.log(`[Job] Finished project: ${projectId}`);

    } catch (error) {
        console.error(`[Job] Failed: ${error.message}`);
        await updateProject(projectId, {
            status: 'failed',
            error: error.message
        });
    } finally {
        isProcessing = false;
    }
}

/**
 * Recursively removes undefined values from an object.
 * Firestore does not accept 'undefined' as a value.
 */
function sanitizePayload(obj) {
    if (obj && typeof obj === 'object') {
        const cleaned = Array.isArray(obj) ? [] : {};
        Object.keys(obj).forEach(key => {
            const value = obj[key];
            if (value !== undefined) {
                cleaned[key] = sanitizePayload(value);
            }
        });
        return cleaned;
    }
    return obj;
}

async function updateProject(id, data) {
    try {
        const cleanData = sanitizePayload(data);
        await updateDoc(doc(db, "projects", id), cleanData);
    } catch (e) {
        console.error(`[Worker] Firestore update failed for ${id}:`, e);
        // Fallback: try to save just the error if the payload was too complex or bad
        if (data.status !== 'failed') {
            await updateDoc(doc(db, "projects", id), {
                status: 'failed',
                error: `Persistence Error: ${e.message}`
            }).catch(err => console.error("Could not even save error state:", err));
        }
    }
}

// Start
startWorker();
