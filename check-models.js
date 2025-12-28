require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("No API Key found");
        return;
    }

    // The SDK doesn't have a direct listModels helper on the main class in some versions, 
    // but strictly speaking, we can try to infer or use the REST API manually if needed.
    // However, older SDKs might not have it.
    // Let's try the fetch approach to be sure.

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("Error listing models:", data.error);
        } else {
            console.log("Available Models:");
            (data.models || []).forEach(m => {
                if (m.supportedGenerationMethods?.includes("generateContent")) {
                    console.log("- " + m.name);
                }
            });
        }
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

listModels();
