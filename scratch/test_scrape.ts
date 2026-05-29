import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  console.log('Navigating to CarDekho Hyundai page...');
  try {
    await page.goto('https://www.cardekho.com/cars/Hyundai', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded.');
    
    // Get all links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => ({
          text: a.innerText.trim(),
          href: a.href
        }))
        .filter(l => l.href.includes('/hyundai/'));
    });
    
    console.log('Found links count:', links.length);
    console.log('Sample links:', links.slice(0, 10));
    
    const title = await page.title();
    console.log('Page Title:', title);
  } catch (e) {
    console.error('Error navigating:', e);
  } finally {
    await browser.close();
  }
}

main();
