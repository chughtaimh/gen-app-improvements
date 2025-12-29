const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs-extra');
const path = require('path');

/**
 * AI Analyst
 * Uses Gemini 1.5 Pro to analyze session data.
 */
class Analyst {
    constructor(apiKey) {
        if (!apiKey || apiKey === 'PLACEHOLDER') {
            console.warn('[Analyst] No valid API Key provided. AI features will fail.');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }

    async analyze(agentResults) {
        console.log('[Analyst] Analyzing session data for:', agentResults.url);

        if (!this.model) {
            return { error: "AI Model not initialized" };
        }

        // 1. Prepare Images
        const imageParts = [];
        const artifactsDir = path.resolve(process.cwd(), 'public', 'artifacts', path.basename(path.dirname(agentResults.videoPath || 'x/x')));
        // Wait, agentResults doesn't have projectId directly, but videoPath is in the dir.
        // Actually BrowserAgent stores screenshots in `this.artifactsDir`. 
        // Let's assume agentResults has the screenshots list, and we know the dir structure.
        // We can pass the full path or reconstructing it.
        // For safety, let's look at browser.js again. 
        // `this.artifactsDir = path.resolve(process.cwd(), 'public', 'artifacts', projectId);`
        // And `results.screenshots` contains filenames.
        // We need projectId here.

        // workaround: We can find the dir using the video path if available, or pass projectId to analyze()
        // but looking at usage in run-worker.js: `analyst.analyze(results)`
        // Let's rely on finding the file in the `public/artifacts` folder if possible.
        // Actually, `run-worker.js` knows the projectId. Maybe we should pass it?
        // Let's try to assume relative paths from cwd + public/artifacts/...?
        // Actually `agentResults` does NOT contain the full path.
        // Let's update run-worker to pass projectId or full paths.
        // BUT since I can't edit run-worker easily without another tool call, I'll try to deduce it or just fix run-worker later.
        // Actually I can edit run-worker later. 
        // Let's assume agentResults includes `projectId` (I'll add it in run-worker).

        const projectId = agentResults.projectId;
        const projectDir = path.resolve(process.cwd(), 'public', 'artifacts', projectId);

        for (const file of agentResults.screenshots) {
            const filePath = path.join(projectDir, file);
            if (await fs.pathExists(filePath)) {
                const mimeType = "image/png";
                const data = await fs.readFile(filePath);
                imageParts.push({
                    inlineData: {
                        data: data.toString("base64"),
                        mimeType
                    }
                });
            }
        }

        if (imageParts.length === 0) {
            console.warn('[Analyst] No screenshots to analyze.');
        }

        // 2. Construct Prompt
        // 2. Construct Prompt
        const prompt = `
    You are an expert Product Manager and UX Researcher.
    I have an agent that navigated a website (${agentResults.url}).
    
    Here is the data captured:
    - Page Title: ${agentResults.title}
    - Meta Description: ${agentResults.metaDescription}
    - Accessibility Violations: ${JSON.stringify(agentResults.accessibility?.violations?.length || 0)}
    - Console Errors: ${agentResults.consoleLogs.filter(l => l.type === 'error').length}
    
    ### Action Log (User Journey)
    The agent attempted to interact with the page. Here is the log of actions:
    ${JSON.stringify(agentResults.actionLog || [], null, 2)}

    Attached are screenshots of the user journey (Initial view -> Scroll -> Navigation -> Interactions).

    YOUR TASK:
    1. **Infer Intent**: If not obvious, deduce the target audience and value proposition.
    2. **Evaluate Journey**: Analyze the 'Action Log'. Did the agent get stuck? Did buttons work? Did forms have validation?
    3. **Evaluate UI/UX**: Analyze the screenshots for design quality, hierarchy, and clarity.
    4. **Report**: Output a JSON object with the following structure:
    
    {
      "summary": "Executive summary of the experience...",
      "score": 0-100,
      "intent": "Inferred intent...",
      "uxIssues": [
        { "severity": "high"|"medium"|"low", "title": "...", "description": "..." }
      ],
      "workingWell": ["..."],
      "opportunities": ["..."]
    }

    Return ONLY the valid JSON. Do not use markdown code blocks.
    `;

        // 3. Generate
        try {
            const result = await this.model.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            const text = response.text();

            // Clean up markdown code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);

        } catch (e) {
            console.error("[Analyst] Gemini generation failed:", e);
            return {
                summary: "AI Analysis failed due to an error.",
                score: 0,
                error: e.message
            };
        }
    }
}

module.exports = Analyst;
