import { chromium } from 'playwright';
import { load } from 'cheerio';
export async function scrapeUrl(url) {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        // Set a timeout for navigation
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        // Wait a brief moment to ensure dynamic content is loaded
        await new Promise(resolve => setTimeout(resolve, 2000));
        const html = await page.content();
        const $ = load(html);
        // Remove script, style, and noscript tags to get clean text
        $('script, style, noscript, iframe, svg').remove();
        // Extract text
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        // Extract images
        const images = [];
        $('img').each((_, element) => {
            const src = $(element).attr('src');
            if (src) {
                // Resolve relative URLs
                try {
                    const absoluteUrl = new URL(src, url).href;
                    images.push(absoluteUrl);
                }
                catch {
                    // Ignore invalid URLs
                }
            }
        });
        // Extract images from background-image CSS
        $('*').each((_, element) => {
            const style = $(element).attr('style');
            if (style) {
                const bgImgMatch = style.match(/background-image:\s*url\s*\(\s*['"]?(.*?)['"]?\s*\)/i);
                if (bgImgMatch && bgImgMatch[1]) {
                    try {
                        const absoluteUrl = new URL(bgImgMatch[1], url).href;
                        images.push(absoluteUrl);
                    }
                    catch {
                        // Ignore invalid URLs
                    }
                }
            }
        });
        return {
            images: Array.from(new Set(images)), // Deduplicate
            text,
        };
    }
    catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        throw new Error(`Failed to scrape URL: ${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
}
