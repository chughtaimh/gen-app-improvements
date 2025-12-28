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
        this.visited = new Set();
        this.MAX_PAGES = 20; // Safety limit
    }

    async init() {
        await fs.ensureDir(this.artifactsDir);

        this.browser = await chromium.launch({
            headless: true,
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

    async navigateAndRecord(url, auth = null) {
        if (!this.page) await this.init();

        // Data collection
        const results = {
            url,
            screenshots: [],
            videoPath: null,
            consoleLogs: [],
            networkErrors: [],
            title: '',
            metaDescription: '',
            pagesVisited: []
        };

        // Event listeners
        this.page.on('console', msg => results.consoleLogs.push({ type: msg.type(), text: msg.text() }));
        this.page.on('pageerror', err => results.consoleLogs.push({ type: 'error', text: err.message }));

        try {
            console.log(`[Agent] Navigating to ${url}...`);
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Phase 1: Public Exploration (BFS Crawl)
            console.log('[Agent] Starting Phase 1: Public Exploration');
            await this.crawl(url, results);

            // Phase 2: Authenticated Exploration
            if (auth && (auth.password || auth.email)) {
                console.log('[Agent] Starting Phase 2: Authenticated Exploration');
                const loggedIn = await this.handleAuthentication(auth);

                if (loggedIn) {
                    // Reset visited for the start URL to ensure we re-analyze the dashboard/landing state
                    // We keep the rest of visited to avoid re-crawling static pages unless linked again
                    this.visited.delete(this.normalizeUrl(url));

                    // Resume crawling from the current page (which should be the dashboard after login)
                    const currentUrl = this.page.url();
                    await this.crawl(currentUrl, results);
                }
            }

        } catch (error) {
            console.error(`[Agent] Error during navigation: ${error.message}`);
            // Don't throw immediately, allow cleanup to save video/logs
        } finally {
            console.log('[Agent DEBUG] Inside finally. Type of this:', typeof this);
            console.log('[Agent DEBUG] keys of this:', Object.keys(this));
            console.log('[Agent DEBUG] Type of this.close:', typeof this.close);
            if (typeof this.close === 'function') {
                await this.close();
            } else {
                console.error('[Agent CRITICAL] this.close is NOT a function!');
                // Attempt manual cleanup if possible
                if (this.browser && this.browser.close) await this.browser.close();
            }

            // Find video
            if (await fs.pathExists(this.artifactsDir)) {
                const files = await fs.readdir(this.artifactsDir);
                const videoFile = files.find(f => f.endsWith('.webm'));
                if (videoFile) results.videoPath = videoFile;
            }
        }

        return results;
    }

    async handleAuthentication(auth) {
        console.log('[Agent] Attempting authentication...');
        try {
            // 1. Check if we are already on a login page, if not, try to find a login link
            // For MVP, we assume we might be on the login page OR we can find one.
            // If we are deep in the site, maybe we need to go back to home? 
            // Let's assume the agent is "smart" enough or the user provided the login URL? 
            // Actually, the user provides the "Target URL". 
            // If the agent crawled around, it might be anywhere.
            // Let's try to identify login inputs on the CURRENT page first.

            let emailInput = await this.page.$('input[type="email"], input[name="email"], input[name="username"], input[name="login"]');
            let passwordInput = await this.page.$('input[type="password"]');

            if (!emailInput && !passwordInput) {
                console.log('[Agent] No login fields found on current page. Searching for "Login" or "Sign In" links...');
                // Try to find a link
                const loginLink = await this.page.getByText(/log in|sign in/i).first();
                if (await loginLink.isVisible()) {
                    await loginLink.click();
                    await this.page.waitForTimeout(2000);
                    // Re-query inputs
                    emailInput = await this.page.$('input[type="email"], input[name="email"], input[name="username"], input[name="login"]');
                    passwordInput = await this.page.$('input[type="password"]');
                }
            }

            if (auth.email && emailInput) {
                console.log(`[Agent] Filling email: ${auth.email}`);
                await emailInput.fill(auth.email);
            }

            if (auth.password && passwordInput) {
                console.log('[Agent] Filling password...');
                await passwordInput.fill(auth.password);
                await this.page.keyboard.press('Enter');

                // Wait for navigation
                await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {
                    console.log('[Agent] Warning: Navigation timeout after login submit (might be SPA update).');
                });
                console.log('[Agent] Authentication process finished.');
                return true;
            } else {
                console.log('[Agent] Could not find password field. excessive auth attempt aborted.');
                return false;
            }

        } catch (e) {
            console.log(`[Agent] Auth attempt failed: ${e.message}`);
            return false;
        }
    }

    async crawl(startUrl, results) {
        const queue = [startUrl];
        this.visited.add(this.normalizeUrl(startUrl));

        let pageCount = 0;

        while (queue.length > 0 && pageCount < this.MAX_PAGES) {
            const currentUrl = queue.shift();
            console.log(`[Agent] Exploring (${pageCount + 1}/${this.MAX_PAGES}): ${currentUrl}`);

            // Navigate if not already there (first page is already loaded if it's startUrl)
            if (this.page.url() !== currentUrl) {
                try {
                    await this.page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await this.page.waitForTimeout(1000); // Settle
                } catch (e) {
                    console.log(`[Agent] Failed to load ${currentUrl}: ${e.message}`);
                    continue;
                }
            }

            // Analyze Page
            const pageData = await this.analyzePage(pageCount);
            results.pagesVisited.push(pageData.url);
            results.screenshots.push(pageData.screenshot);

            // Collect metadata if empty
            if (!results.title) results.title = pageData.title;

            // Find new links
            const links = await this.extractInternalLinks(startUrl);
            for (const link of links) {
                const normalized = this.normalizeUrl(link);
                if (!this.visited.has(normalized)) {
                    this.visited.add(normalized);
                    queue.push(link);
                }
            }

            pageCount++;
        }
    }

    async analyzePage(index) {
        const pageTitle = await this.page.title();
        const screenshotName = `screenshot_${index}.png`;
        const screenshotPath = path.join(this.artifactsDir, screenshotName);

        await this.page.screenshot({ path: screenshotPath, fullPage: true });

        // Run A11y (maybe just on the first few pages to save time/noise?)
        let a11y = null;
        if (index < 5) {
            a11y = await this.runAxe();
        }

        return {
            url: this.page.url(),
            title: pageTitle,
            screenshot: screenshotName,
            accessibility: a11y
        };
    }

    async runAxe() {
        try {
            const axeSource = require.resolve('axe-core/axe.min.js');
            await this.page.addScriptTag({ path: axeSource });
            const result = await this.page.evaluate(async () => {
                return await window.axe.run();
            });
            return {
                url: this.page.url(),
                violations: result.violations.length,
                score: 100 - (result.violations.length * 2)
            };
        } catch (e) {
            return null;
        }
    }

    async extractInternalLinks(subdomainBase) {
        try {
            const currentUrlBase = new URL(subdomainBase).origin;

            // Get all unique hrefs
            const hrefs = await this.page.$$eval('a', anchors => anchors.map(a => a.href));

            // Filter
            const unique = new Set(hrefs.filter(href => {
                try {
                    const u = new URL(href);
                    // Must be same origin
                    if (u.origin !== currentUrlBase) return false;
                    // Ignore anchors/hashes on same page
                    if (u.hash && u.pathname === new URL(document.location.href).pathname) return false;
                    // Ignore common non-pages
                    if (href.endsWith('.pdf') || href.endsWith('.jpg') || href.endsWith('.png')) return false;
                    return true;
                } catch { return false; }
            }));

            return Array.from(unique);

        } catch (e) {
            console.log(`[Agent] Link extraction failed: ${e.message}`);
            return [];
        }
    }

    normalizeUrl(url) {
        try {
            const u = new URL(url);
            // Remove trailing slash for consistency
            let path = u.pathname;
            if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
            return u.origin + path; // Ignore query params for visited check? Maybe keep them?
            // For simple site crawling, ignoring query params is safer to avoid infinite loops, 
            // but might miss dynamic content. Let's keep it simple: Origin + Path
        } catch {
            return url;
        }
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = BrowserAgent;
