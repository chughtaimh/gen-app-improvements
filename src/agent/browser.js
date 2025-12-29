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
        this.MAX_PAGES = 50; // Increased depth
        this.MAX_DURATION_MS = 90 * 1000; // 90 Seconds cap (User Request)
        this.MIN_DURATION_MS = 15 * 1000; // 15 Seconds minimum (SPA User Request)
        this.startTime = 0;
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
            pagesVisited: [],
            actionLog: []
        };

        // Event listeners
        this.page.on('console', msg => results.consoleLogs.push({ type: msg.type(), text: msg.text() }));
        this.page.on('pageerror', err => results.consoleLogs.push({ type: 'error', text: err.message }));

        this.startTime = Date.now();

        try {
            console.log(`[Agent] Navigating to ${url}...`);
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Phase 1: Public Exploration (BFS Crawl)
            console.log('[Agent] Starting Phase 1: Public Exploration');
            await this.crawl(url, results);

            // Phase 2: Authenticated Exploration
            if (auth && (auth.password || auth.email)) {
                console.log('[Agent] Starting Phase 2: Authenticated Exploration');

                // CRITICAL FIX: Ensure we are back at the start URL (or intended login page) 
                // because Phase 1 might have navigated away.
                if (this.page.url() !== url) {
                    console.log(`[Agent] Returning to ${url} for authentication...`);
                    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
                }

                const loggedIn = await this.handleAuthentication(auth, results);

                if (loggedIn) {
                    // Reset visited for the start URL to ensure we re-analyze the dashboard/landing state
                    // We need to be careful with normalized URLs for SPAs here
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
            // ... cleanup ...
            if (typeof this.close === 'function') {
                await this.close();
            } else {
                // ...
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

    async handleAuthentication(auth, results) {
        console.log('[Agent] Attempting authentication...');
        try {
            // Helper to log actions
            const logAction = (type, desc, selector = '') => {
                results.actionLog.push({
                    timestamp: new Date().toISOString(),
                    type,
                    selector,
                    description: desc
                });
            };

            // 1. Wait for inputs to appear (handle simple SPAs/hydration)
            // We use a small timeout to "wait" for them, but don't fail hard if not found immediately,
            // so we can try looking for a "Login" link.

            // Helper to safe-wait
            const getField = async (selector) => {
                try {
                    return await this.page.waitForSelector(selector, { state: 'visible', timeout: 3000 });
                } catch { return null; }
            };

            let emailInput = await getField('input[type="email"], input[name="email"], input[name="username"], input[name="login"]');
            let passwordInput = await getField('input[type="password"]');

            if (!emailInput && !passwordInput) {
                console.log('[Agent] No login fields found on current page. Searching for "Login" or "Sign In" links...');
                // Try to find a link
                const loginLink = await this.page.getByText(/log in|sign in/i).first();
                if (await loginLink.isVisible()) {
                    await loginLink.click();
                    logAction('click', 'Clicked Login/Sign In link');
                    // Wait for navigation or modal
                    await this.page.waitForTimeout(2000);
                    // Re-query inputs
                    emailInput = await getField('input[type="email"], input[name="email"], input[name="username"], input[name="login"]');
                    passwordInput = await getField('input[type="password"]');
                }
            }

            if (auth.email && emailInput) {
                console.log(`[Agent] Filling email: ${auth.email}`);
                await emailInput.fill(auth.email);
                logAction('input', `Filled email: ${auth.email}`, 'input[name="email"]');
            }

            if (auth.password && passwordInput) {
                console.log('[Agent] Filling password...');
                await passwordInput.fill(auth.password);
                logAction('input', 'Filled password', 'input[type="password"]');
                await this.page.keyboard.press('Enter');
                logAction('keypress', 'Pressed Enter to submit');

                // SMART WAIT: Poll for success indicators
                console.log('[Agent] Waiting for authentication success...');
                const startUrl = this.page.url();
                let success = false;
                const startTime = Date.now();
                const TIMEOUT = 10000; // 10s max wait

                while (Date.now() - startTime < TIMEOUT) {
                    await this.page.waitForTimeout(500);

                    // Check 1: URL Changed
                    if (this.page.url() !== startUrl) {
                        console.log('[Agent] Auth Success: URL changed');
                        success = true;
                        break;
                    }

                    // Check 2: Password field gone (modal closed / form replaced)
                    // Note: This relies on passwordInput element handle. If page refreshed, handle is stale (throws error) which assumes success too.
                    try {
                        if (!(await passwordInput.isVisible())) {
                            console.log('[Agent] Auth Success: Password field disappeared');
                            success = true;
                            break;
                        }
                    } catch (e) {
                        // Stale element means page changed!
                        console.log('[Agent] Auth Success: Input element stale (page reloaded)');
                        success = true;
                        break;
                    }

                    // Check 3: Dashboard indicators? (Too specific, skipping)
                }

                if (success) {
                    logAction('auth', 'Authentication successful');
                    console.log('[Agent] Authentication process finished successfully.');
                    return true;
                } else {
                    console.log('[Agent] Warning: No obvious auth success detected, but proceeding anyway.');
                    logAction('auth', 'Authentication finished (unsure of success)');
                    return true; // Proceed anyway in case we just missed the signal
                }

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

        // Main Loop
        while (true) {
            // 1. DURATION CHECKS
            const elapsed = Date.now() - this.startTime;

            if (elapsed > this.MAX_DURATION_MS) {
                console.log('[Agent] Time limit reached. Stopping crawl.');
                break;
            }

            // 2. QUEUE PROCESSING
            if (queue.length === 0) {
                if (elapsed < this.MIN_DURATION_MS) {
                    console.log(`[Agent] Queue empty but only ${Math.round(elapsed / 1000)}s elapsed. Entering Deep Exploration...`);

                    // DEEP EXPLORATION / ACTIVE WAITING
                    // Scroll to bottom and top to trigger possible lazy loads
                    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await this.page.waitForTimeout(1000);
                    await this.page.evaluate(() => window.scrollTo(0, 0));
                    await this.page.waitForTimeout(1000);

                    // Re-scan for links (maybe new ones appeared?)
                    const links = await this.extractInternalLinks(startUrl);
                    let foundNew = false;
                    for (const link of links) {
                        const normalized = this.normalizeUrl(link);
                        if (!this.visited.has(normalized)) {
                            this.visited.add(normalized);
                            queue.push(link);
                            foundNew = true;
                        }
                    }

                    if (foundNew) {
                        console.log('[Agent] Deep exploration found new links! Continuing...');
                        continue;
                    }

                    // Scan for interactions AGAIN if we are truly stuck
                    // Maybe we missed some or they are dynamic
                    await this.exploreInteractions(results);

                    // Still empty? Just wait a bit to consume min duration time
                    await this.page.waitForTimeout(2000);
                    continue;
                } else {
                    console.log('[Agent] Queue empty and minimum duration met. Finishing.');
                    break;
                }
            }

            if (pageCount >= this.MAX_PAGES) {
                console.log('[Agent] Page limit reached.');
                break;
            }

            const currentUrl = queue.shift();
            // console.log(`[Agent] Exploring (${pageCount + 1}/${this.MAX_PAGES}): ${currentUrl}`);

            // Navigate if not already there (first page is already loaded if it's startUrl)
            // Note: For SPAs, currentUrl might just be a hash change
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

            // Log navigation
            results.actionLog.push({
                timestamp: new Date().toISOString(),
                type: 'navigation',
                url: currentUrl,
                description: `Navigated to ${currentUrl}`
            });

            // Explore Interactions (Depth)
            await this.exploreInteractions(results);

            // Find new links (Breadth)
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

    async exploreInteractions(results) {
        console.log('[Agent] Exploring interactions on page...');

        // 1. Interactive Elements Discovery
        // Look for buttons, links that look like buttons, etc.
        const candidates = await this.page.$$('button, input[type="submit"], input[type="button"], a[role="button"], [role="button"]');

        // Limit interactions per page to avoid getting stuck
        const MAX_INTERACTIONS = 10;
        let interactions = 0;

        for (const el of candidates) {
            if (interactions >= MAX_INTERACTIONS) break;

            // Time limit check also here
            if (Date.now() - this.startTime > this.MAX_DURATION_MS) break;

            try {
                const isVisible = await el.isVisible();
                if (!isVisible) continue;

                const text = await el.innerText().catch(() => 'element');
                // Skip dangerous interactions or common nav interactions we pick up otherwise
                if (text.match(/delete|remove|sign out|log out/i)) continue;

                // Log BEFORE action
                console.log(`[Agent] Interaction candidates: clicking "${text}"`);

                // Screenshot before? Maybe too expensive.

                await el.click({ timeout: 1000 }).catch(e => console.log('Click failed', e.message));
                interactions++;

                const timestamp = new Date().toISOString();
                results.actionLog.push({
                    timestamp,
                    type: 'click',
                    selector: await el.evaluate(e => e.tagName), // Simple tag name
                    description: `Clicked "${text.substring(0, 30)}..."`
                });

                await this.page.waitForTimeout(500); // Observe effect

                // POST-INTERACTION SCREENSHOT
                // We use a unique name based on timestamp
                const screenshotName = `interaction_${Date.now()}.png`;
                const screenshotPath = path.join(this.artifactsDir, screenshotName);
                await this.page.screenshot({ path: screenshotPath });

                // Add to results
                results.screenshots.push(screenshotName); // Add to analysis queue

                // Log screenshot action
                results.actionLog.push({
                    timestamp: new Date().toISOString(),
                    type: 'screenshot',
                    description: `Captured state after interaction: ${screenshotName}`
                });

                // Simple state check (did modal appear?)
                // For MVP, just interactions are recorded.
            } catch (e) {
                // Ignore
            }
        }

        // 2. Form Exploration (with Guardrails)
        const inputs = await this.page.$$('input:not([type="hidden"]), textarea');
        for (const input of inputs) {
            try {
                if (!(await input.isVisible())) continue;

                const type = await input.getAttribute('type') || 'text';
                const name = await input.getAttribute('name') || '';
                const placeholder = await input.getAttribute('placeholder') || '';

                // GUARDRAIL: Skip Password Fields
                if (type === 'password' || name.match(/password|pwd/i)) {
                    console.log('[Agent GUARDRAIL] Skipping password field');
                    continue;
                }

                // GUARDRAIL: Use Safe Dummy Data
                let safeValue = 'Test Input';
                if (type === 'email' || name.match(/email/i)) safeValue = 'test_visitor@example.com';
                else if (name.match(/name/i)) safeValue = 'Test User';
                else if (name.match(/phone|tel/i)) safeValue = '555-0199';
                else if (type === 'number') safeValue = '10';

                // Only fill if empty
                const currentVal = await input.inputValue();
                if (!currentVal) {
                    await input.fill(safeValue);
                    results.actionLog.push({
                        timestamp: new Date().toISOString(),
                        type: 'input',
                        selector: `input[name="${name}"]`,
                        description: `Filled "${safeValue}" into ${name || placeholder || 'input'}`
                    });
                }
            } catch (e) {
                // ignore
            }
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

                    // SPA SUPPORT: Allow hashes now!
                    // But prevent identical page loops
                    const currentU = new URL(this.page.url());
                    if (u.href === currentU.href) return false; // Exactly same

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

            // SPA SUPPORT: Include HASH in the normalization key now
            // so #/dashboard and #/settings are seen as different
            return u.origin + path + u.hash;
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
