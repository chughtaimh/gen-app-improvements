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

            // 1. Handle Auth
            if (auth && auth.password) {
                await this.handleAuthentication(auth);
            }

            // 2. Exploration (BFS Crawl)
            await this.crawl(url, results);

        } catch (error) {
            console.error(`[Agent] Error during navigation: ${error.message}`);
            // Don't throw immediately, allow cleanup to save video/logs
        } finally {
            await this.close();

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
        console.log('[Agent] Checking for authentication...');
        try {
            const passwordInput = await this.page.$('input[type="password"]');
            if (passwordInput) {
                console.log('[Agent] Password field found. Authenticating...');
                await passwordInput.fill(auth.password);
                await this.page.keyboard.press('Enter');
                await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => { });
                console.log('[Agent] Authentication step complete.');
            }
        } catch (e) {
            console.log(`[Agent] Auth attempt failed (or not needed): ${e.message}`);
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
