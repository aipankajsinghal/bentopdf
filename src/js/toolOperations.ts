import { PDFDocument, RotationTypes, StandardFonts, rgb, degrees } from 'pdf-lib';
import { showWatermarkModal, showStampModal, showSignModal } from './ui/editorModals.js';
import { showPlacementOverlay } from './ui/placementOverlay.js';
import Tesseract from 'tesseract.js';
import { showTextModal } from './ui/textModal.js';
import { showOcrModal } from './ui/editorModals.js';
import {
  getActiveDocument,
  updateDocumentBytes,
  createDocumentFromBytes,
  openDocument,
} from './documentManager.js';
import { getSelectedPages, clearPageSelection } from './state.js';

// Helper: save PDFDocument to active document
async function savePdfDocToActive(doc: any, pdfDoc: PDFDocument) {
  const bytes = await pdfDoc.save();
  await updateDocumentBytes(doc, new Uint8Array(bytes));
}

export async function compress(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  // Re-serialize the PDF which often reduces size by removing unused objects
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  await savePdfDocToActive(doc, pdfDoc);
}

export async function watermark(text?: string): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const selected = getSelectedPages();
  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];

  // If no explicit text provided, show modal to get options
  let opts = null;
  if (!text) {
    opts = await showWatermarkModal('CONFIDENTIAL');
    if (!opts) return; // cancelled
  }

  const wmText = text || opts.text;
  const wmSize = opts ? opts.size : Math.min(72, Math.max(24, Math.floor(36)));
  const wmOpacity = opts ? opts.opacity / 100 : 0.12;
  const position = opts ? opts.position : 'center';

  for (const i of targets) {
    if (i < 0 || i >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    const size = wmSize;
    const textWidth = font.widthOfTextAtSize(wmText, size);
    let x = (width - textWidth) / 2;
    let y = height / 2;
    if (position === 'top-left') { x = 40; y = height - 80; }
    if (position === 'top-right') { x = width - textWidth - 40; y = height - 80; }
    if (position === 'bottom-left') { x = 40; y = 40; }
    if (position === 'bottom-right') { x = width - textWidth - 40; y = 40; }

      if (position === 'custom' && !text) {
      // Show placement overlay to get precise coords
      const placement = await showPlacementOverlay({ type: 'text', text: wmText, fontSize: wmSize, opacity: wmOpacity });
      if (!placement) continue;
      // Map normalized placement to PDF page coordinates
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      const xPage = placement.xNorm * pageWidth;
      // PDF coordinates have origin at bottom-left
      const yPage = pageHeight - (placement.yNorm * pageHeight) - (placement.hNorm * pageHeight);
      const drawSize = wmSize;
      const rot = typeof placement.rotateDeg === 'number' ? placement.rotateDeg : -45;
      page.drawText(wmText, {
        x: xPage,
        y: yPage,
        size: drawSize,
        font,
        color: rgb(0.2, 0.2, 0.2),
        rotate: degrees(rot),
        opacity: wmOpacity,
      });
    } else {
      page.drawText(wmText, {
        x,
        y,
        size,
        font,
        color: rgb(0.2, 0.2, 0.2),
        rotate: degrees(-45),
        opacity: wmOpacity,
      });
    }
  }

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function stamps(text?: string): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold || StandardFonts.Helvetica);
  const selected = getSelectedPages();
  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];

  let opts = null;
  if (!text) {
    opts = await showStampModal('APPROVED');
    if (!opts) return;
  }
  const stampText = text || opts.text;
  const size = opts ? opts.size : 18;
  const opacity = opts ? opts.opacity / 100 : 0.95;

  for (const i of targets) {
    if (i < 0 || i >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
      if (opts && opts.position === 'custom' && !text) {
      const placement = await showPlacementOverlay({ type: 'text', text: stampText, fontSize: size, opacity });
      if (!placement) continue;
      const xPage = placement.xNorm * width;
      const yPage = height - (placement.yNorm * height) - (placement.hNorm * height);
      const rot = typeof placement.rotateDeg === 'number' ? placement.rotateDeg : 0;
      page.drawText(stampText.toUpperCase(), {
        x: xPage,
        y: yPage,
        size,
        font,
        color: rgb(0.9, 0.1, 0.1),
        opacity,
        rotate: degrees(rot),
      });
    } else {
      page.drawText(stampText.toUpperCase(), {
        x: width - 160,
        y: 40,
        size,
        font,
        color: rgb(0.9, 0.1, 0.1),
        opacity,
      });
    }
  }

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function sign(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const sel = await showSignModal();
  if (!sel || !sel.file) return;
  const file = sel.file;
  const arr = new Uint8Array(await file.arrayBuffer());
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  let img: any;
  if (/\.png$/i.test(file.name)) {
    img = await pdfDoc.embedPng(arr);
  } else {
    img = await pdfDoc.embedJpg(arr);
  }

  const selected = getSelectedPages();
  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];
  for (const i of targets) {
    if (i < 0 || i >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();

    // Show placement overlay for signature placement
    const imgDims = img.scale(0.25);
    const placement = await showPlacementOverlay({ type: 'image', imageSrc: URL.createObjectURL(file), widthPx: imgDims.width, heightPx: imgDims.height, opacity: 0.95 });
    if (!placement) continue;
    const xPage = placement.xNorm * width;
    const yPage = height - (placement.yNorm * height) - (placement.hNorm * height);
    const rot = typeof placement.rotateDeg === 'number' ? placement.rotateDeg : 0;

    page.drawImage(img, {
      x: xPage,
      y: yPage,
      width: placement.wNorm * width,
      height: placement.hNorm * height,
      opacity: 0.95,
      rotate: degrees(rot),
    });
  }

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function annotate(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const text = prompt('Annotation text:');
  if (!text) return;

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const selected = getSelectedPages();
  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];

  for (const i of targets) {
    if (i < 0 || i >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(i);
    page.drawText(text, {
      x: 40,
      y: 40,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
  }

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function ocr(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) {
    showAlert('OCR', 'Open a PDF first to run OCR.');
    return;
  }
  // Ask user for language/options
  const ocrOpts = await showOcrModal('eng');
  if (!ocrOpts) return; // cancelled
  const lang = ocrOpts.lang || 'eng';

  const selected = getSelectedPages();
  const targets = selected.length ? selected.map(i => i + 1) : [doc.currentPage];

  // Show a modal that supports progress updates and cancellation
  const modal = showTextModal('OCR Results', { initialText: 'Starting OCR...', progress: true });

  // Try to create a dedicated worker for OCR so heavy work runs off the main thread
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./workers/ocrWorker.js', import.meta.url), { type: 'module' });
  } catch (e) {
    console.warn('Could not create OCR worker, falling back to main-thread Tesseract', e);
    worker = null;
  }

  let fullText = '';
  let cancelled = false;

  const cancelListener = () => { cancelled = true; if (worker) { try { worker.postMessage({ id: 'cancel', action: 'terminate' }); } catch (e) {} } };
  window.addEventListener('bentopdf-ocr-cancel', cancelListener);

  try {
    for (const pageNum of targets) {
      if (cancelled) break;
      try {
        const page = await doc.pdfJsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });
        const off = document.createElement('canvas');
        off.width = viewport.width;
        off.height = viewport.height;
        const ctx = off.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport } as any).promise;
        const dataUrl = off.toDataURL('image/png');

        if (worker) {
          const id = `ocr-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          const result = await new Promise((resolve, reject) => {
            const onMessage = (ev: MessageEvent) => {
              if (!ev.data || ev.data.id !== id) return;
              const { type, payload } = ev.data;
              if (type === 'progress') {
                const p = payload?.progress ?? (payload?.progress ? payload.progress : 0);
                modal.updateProgress(Math.round((p || 0) * 100));
              } else if (type === 'result') {
                worker?.removeEventListener('message', onMessage);
                resolve(payload);
              } else if (type === 'error') {
                worker?.removeEventListener('message', onMessage);
                reject(payload);
              }
            };
            worker.addEventListener('message', onMessage);
            worker.postMessage({ id, action: 'recognize', payload: { dataUrl, lang } });
            // small timeout could be added per-page if desired
          });

          const r: any = result;
          const text = r?.text ?? r?.data?.text ?? r?.data?.text ?? '';
          fullText += `--- Page ${pageNum} ---\n` + (text || '') + '\n\n';
          modal.updateText(fullText);
        } else {
          // Fallback: run Tesseract on main thread
          const res = await Tesseract.recognize(dataUrl, lang, {
            logger: (m: any) => {
              if (m && typeof m.progress === 'number') {
                modal.updateProgress(Math.round(m.progress * 100));
              }
            },
          });
          fullText += `--- Page ${pageNum} ---\n` + (res?.data?.text || '') + '\n\n';
          modal.updateText(fullText);
        }
      } catch (err) {
        console.error('OCR page error', err);
        fullText += `--- Page ${pageNum} ---\n[Error during OCR]\n\n`;
        modal.updateText(fullText);
      }
    }
  } finally {
    window.removeEventListener('bentopdf-ocr-cancel', cancelListener);
    modal.updateProgress(100);
    if (worker && !cancelled) {
      try { worker.postMessage({ id: 'done', action: 'terminate' }); } catch (e) {}
      try { worker.terminate(); } catch (e) {}
    }
  }

  if (!fullText) fullText = '[No text recognized]';
  modal.updateText(fullText);
}

export async function rotateLeft(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const selected = getSelectedPages();
  const pageCount = pdfDoc.getPageCount();

  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];
  targets.forEach((i) => {
    if (i >= 0 && i < pageCount) {
      const p = pdfDoc.getPage(i);
      const angle = ((p.getRotation().angle - 90) % 360 + 360) % 360;
      p.setRotation({ type: RotationTypes.Degrees, angle });
    }
  });

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function rotateRight(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const selected = getSelectedPages();
  const pageCount = pdfDoc.getPageCount();

  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];
  targets.forEach((i) => {
    if (i >= 0 && i < pageCount) {
      const p = pdfDoc.getPage(i);
      const angle = ((p.getRotation().angle + 90) % 360 + 360) % 360;
      p.setRotation({ type: RotationTypes.Degrees, angle });
    }
  });

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function rotate180(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const selected = getSelectedPages();
  const pageCount = pdfDoc.getPageCount();

  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];
  targets.forEach((i) => {
    if (i >= 0 && i < pageCount) {
      const p = pdfDoc.getPage(i);
      const angle = ((p.getRotation().angle + 180) % 360 + 360) % 360;
      p.setRotation({ type: RotationTypes.Degrees, angle });
    }
  });

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function addBlankPage(position?: number): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const page = pdfDoc.addPage();
  if (typeof position === 'number') {
    // Move the new page to requested position
    const idx = pdfDoc.getPageCount() - 1;
    pdfDoc.removePage(idx);
    pdfDoc.insertPage(position, page);
  }
  await savePdfDocToActive(doc, pdfDoc);
}

export async function deletePages(indices?: number[]): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const selected = indices && indices.length ? indices : getSelectedPages();
  if (selected.length === 0) {
    // default to current page
    selected.push(Math.max(0, doc.currentPage - 1));
  }
  // Sort desc so removal indexes stay valid
  selected.sort((a, b) => b - a);
  for (const idx of selected) {
    if (idx >= 0 && idx < pdfDoc.getPageCount()) {
      pdfDoc.removePage(idx);
    }
  }
  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function extractPages(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const selected = getSelectedPages();
  if (selected.length === 0) {
    showAlert('No Pages Selected', 'Please select pages to extract.');
    return;
  }

  const src = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  const copied = await newPdf.copyPages(src, selected);
  copied.forEach((p) => newPdf.addPage(p));
  const bytes = await newPdf.save();

  await createDocumentFromBytes(new Uint8Array(bytes), doc.fileName.replace(/\.pdf$/i, '') + '_extracted.pdf');
  clearPageSelection();
}

export async function splitPDF(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const count = pdfDoc.getPageCount();
  // Simple split: create single-page documents for each page
  for (let i = 0; i < count; i++) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(pdfDoc, [i]);
    single.addPage(copied);
    const bytes = await single.save();
    await createDocumentFromBytes(new Uint8Array(bytes), `${doc.fileName.replace(/\.pdf$/i, '')}_page_${i + 1}.pdf`);
  }
}

export async function mergeFiles(fileList: FileList | File[]): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });

  const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
  for (const f of files) {
    const bytes = new Uint8Array(await (f as File).arrayBuffer());
    const other = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await pdfDoc.copyPages(other, other.getPageIndices());
    copied.forEach(p => pdfDoc.addPage(p));
  }

  await savePdfDocToActive(doc, pdfDoc);
}

// Minimal UI helper (deferred to main.ts alert)
function showAlert(title: string, message: string) {
  const event = new CustomEvent('bentopdf-show-alert', { detail: { title, message } });
  window.dispatchEvent(event);
}

export default {
  compress,
  rotateLeft,
  rotateRight,
  rotate180,
  addBlankPage,
  deletePages,
  extractPages,
  splitPDF,
  mergeFiles,
};
