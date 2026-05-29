import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  const url = 'https://www.cardekho.com/hyundai/creta';
  console.log('Navigating to', url);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Loaded.');
    
    const ogImage = await page.evaluate(() => {
      const meta = document.querySelector('meta[property="og:image"]');
      return meta ? meta.getAttribute('content') : null;
    });
    
    console.log('og:image:', ogImage);
    
    // Check all image srcs containing 'creta'
    const imgUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map(img => img.src)
        .filter(src => src.includes('creta') && src.includes('.jpg'));
    });
    
    console.log('Images containing "creta":', imgUrls.slice(0, 10));
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

main();
