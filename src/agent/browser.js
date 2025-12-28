const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs-extra');

/**
 * Browsing Agent
 * Navigates to a URL, interacts with the page, and records the session.
 */
class BrowserAgent {
    constructor(projectId) {
        this.projectId = projectId;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.artifactsDir = path.resolve(process.cwd(), 'public', 'artifacts', projectId);
    }

    async init() {
        // Ensure artifacts dir exists
        await fs.ensureDir(this.artifactsDir);

        this.browser = await chromium.launch({
            headless: true, // Visible for MVP debugging? No, keep headless for speed unless requested.
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 800 },
            recordVideo: {
                dir: this.artifactsDir,
                size: { width: 1280, height: 800 }
            },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 UX-Agent/1.0'
        });

        this.page = await this.context.newPage();
    }

    async navigateAndRecord(url) {
        if (!this.page) await this.init();
        const results = {
            url,
            screenshots: [],
            videoPath: null,
            consoleLogs: [],
            networkErrors: [],
            title: '',
            metaDescription: ''
        };

        try {
            console.log(`[Agent] Navigating to ${url}...`);

            // Capture console logs
            this.page.on('console', msg => results.consoleLogs.push({ type: msg.type(), text: msg.text() }));
            this.page.on('pageerror', err => results.consoleLogs.push({ type: 'error', text: err.message }));

            // Navigate
            await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            results.title = await this.page.title();

            // Get Meta Description
            const metaDesc = await this.page.$('meta[name="description"]');
            if (metaDesc) results.metaDescription = await metaDesc.getAttribute('content');

            // 1. Initial Screenshot (Above the fold)
            const screenshotPath1 = path.join(this.artifactsDir, 'initial.png');
            await this.page.screenshot({ path: screenshotPath1 });
            results.screenshots.push('initial.png');

            // 2. Smart Scroll (Simulate reading)
            await this.smartScroll();

            // 2b. Accessibility Audit (Axe)
            try {
                console.log(`[Agent] Running Accessibility Audit...`);
                const axeSource = require.resolve('axe-core/axe.min.js');
                await this.page.addScriptTag({ path: axeSource });
                const a11yResults = await this.page.evaluate(async () => {
                    return await window.axe.run();
                });
                results.accessibility = {
                    violations: a11yResults.violations.map(v => ({
                        id: v.id,
                        impact: v.impact,
                        description: v.description,
                        count: v.nodes.length
                    })),
                    score: 100 - (a11yResults.violations.length * 2) // Rough scoring
                };
            } catch (e) {
                console.log(`[Agent] A11y Audit failed: ${e.message}`);
            }

            // 3. Full Page Screenshot
            const screenshotPath2 = path.join(this.artifactsDir, 'full_page.png');
            await this.page.screenshot({ path: screenshotPath2, fullPage: true });
            results.screenshots.push('full_page.png');

            // 4. Interaction (Simple click on a nav link if found, just to see what happens)
            // This is risky, so we catch errors
            try {
                const navLink = await this.page.$('nav a[href^="/"], header a[href^="/"]');
                if (navLink) {
                    console.log(`[Agent] Clicking nav link...`);
                    await navLink.click({ timeout: 2000 });
                    await this.page.waitForLoadState('domcontentloaded');
                    await this.page.waitForTimeout(1000);

                    const screenshotPath3 = path.join(this.artifactsDir, 'navigation.png');
                    await this.page.screenshot({ path: screenshotPath3 });
                    results.screenshots.push('navigation.png');
                }
            } catch (e) {
                console.log(`[Agent] Interaction skipped: ${e.message}`);
            }

        } catch (error) {
            console.error(`[Agent] Error during navigation: ${error.message}`);
            throw error;
        } finally {
            // Close context to save video
            await this.context.close();
            await this.browser.close();

            // Find video file (Playwright names it randomly)
            const files = await fs.readdir(this.artifactsDir);
            const videoFile = files.find(f => f.endsWith('.webm'));
            if (videoFile) results.videoPath = videoFile;
        }

        return results;
    }

    async smartScroll() {
        await this.page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    }
}

module.exports = BrowserAgent;
