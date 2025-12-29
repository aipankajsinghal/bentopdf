import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, '..', 'tests', 'e2e', 'fixtures');
const SAMPLE_PDF = path.join(FIXTURE_DIR, 'sample.pdf');

(async () => {
  try {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    const pdfDoc = await PDFDocument.create();
    const pdfPage = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    pdfPage.drawText('Hello BentoPDF OCR', { x: 50, y: 200, size: 24, font });
    const bytes = await pdfDoc.save();
    fs.writeFileSync(SAMPLE_PDF, Buffer.from(bytes));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', (msg) => {
      try { console.log('PAGE LOG>', msg.text()); } catch (e) {}
    });
    page.on('pageerror', (err) => { console.error('PAGE ERROR>', err); });
    await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 30000 });

    // ensure input is not hidden so Playwright can set files
    await page.waitForSelector('#file-input', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => { const el = document.getElementById('file-input'); if (el) el.classList.remove('hidden'); });
    const input = await page.$('#file-input');
    await input.setInputFiles(SAMPLE_PDF);
    // dispatch change event so app responds to programmatic file set
    await page.evaluate(() => {
      const el = document.getElementById('file-input');
      if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForSelector('#pdf-viewer:not(.hidden)', { timeout: 20000 });

    // switch to the Convert tab where OCR lives
    await page.waitForSelector('#ribbon', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      const tab = document.querySelector('[data-tab="convert"]');
      if (tab) tab.click();
    });
    // allow ribbon to re-render
    await page.waitForTimeout(300);
    const toolDetails = await page.evaluate(() => Array.from(document.querySelectorAll('[data-tool]')).map((el) => ({
      tool: el.dataset.tool,
      className: el.className,
      html: el.outerHTML,
    })));
    console.log('Tool details:', JSON.stringify(toolDetails.slice(0,50), null, 2));
    const found = toolDetails.find(t => t.tool === 'ocr');
    if (!found) {
      throw new Error('OCR tool not present in DOM; tools found: ' + toolDetails.map(t=>t.tool).join(','));
    }
    if (found.className && found.className.includes('pointer-events-none')) {
      throw new Error('OCR tool present but disabled; class: ' + found.className);
    }
    // Click via DOM in case button is not fully visible to Playwright
    await page.evaluate(() => { const el = document.querySelector('[data-tool="ocr"]'); if (el) el.click(); });
    await page.waitForSelector('#ocr-ok', { timeout: 5000 });
    await page.click('#ocr-ok');

    await page.waitForSelector('#text-modal', { timeout: 120000 });
    await page.waitForFunction(() => {
      const ta = document.getElementById('text-content');
      return ta && ta.value && ta.value.length > 10;
    }, null, { timeout: 120000 });

    const content = await page.$eval('#text-content', (el) => el.value);
    console.log('OCR content length:', content.length);
    console.log('Sample of OCR content:', content.slice(0, 200));

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('E2E error', err);
    process.exit(2);
  }
})();
