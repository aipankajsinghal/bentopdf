import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const SAMPLE_PDF = path.join(FIXTURE_DIR, 'sample.pdf');

test.beforeAll(async () => {
  // ensure fixtures dir
  try { fs.mkdirSync(FIXTURE_DIR, { recursive: true }); } catch (e) {}
  // create a small PDF with known text
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello BentoPDF OCR', { x: 50, y: 200, size: 24, font });
  const bytes = await pdfDoc.save();
  fs.writeFileSync(SAMPLE_PDF, Buffer.from(bytes));
});

test('OCR end-to-end produces text output', async ({ page }) => {
  await page.goto('http://localhost:5174/');

  // upload the sample pdf
  const input = await page.waitForSelector('#file-input');
  await input.setInputFiles(SAMPLE_PDF);

  // wait for pdf viewer to appear
  await page.waitForSelector('#pdf-viewer:not(.hidden)', { timeout: 10000 });

  // open ribbon OCR tool
  await page.click('[data-tool="ocr"]');

  // Wait for OCR options modal and click Run OCR
  await page.waitForSelector('#ocr-ok', { timeout: 5000 });
  await page.click('#ocr-ok');

  // Wait for OCR results modal and then for progress bar to update
  await page.waitForSelector('#text-modal', { timeout: 60000 });
  // wait until text area is non-empty or progress bar shows >0
  await page.waitForFunction(() => {
    const ta = document.getElementById('text-content') as HTMLTextAreaElement | null;
    if (!ta) return false;
    return ta.value && ta.value.length > 10;
  }, null, { timeout: 120000 });

  const content = await page.$eval('#text-content', (el: HTMLTextAreaElement) => el.value);
  expect(content).toContain('Hello BentoPDF');
});
