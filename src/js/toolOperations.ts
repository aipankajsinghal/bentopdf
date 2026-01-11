import { PDFDocument, RotationTypes, StandardFonts, rgb, degrees } from 'pdf-lib';
import { showWatermarkModal, showStampModal, showSignModal } from './ui/editorModals.js';
import { showPlacementOverlay } from './ui/placementOverlay.js';
import Tesseract from 'tesseract.js';
import { showTextModal } from './ui/textModal.js';
import { showInputModal } from './ui/inputModal.js';
import { showOcrModal } from './ui/editorModals.js';
import {
  getActiveDocument,
  updateDocumentBytes,
  createDocumentFromBytes,
  openDocument,
  Document,
} from './documentManager.js';
import { getSelectedPages, clearPageSelection } from './state.js';
import { PDFImage } from 'pdf-lib';

// Helper: save PDFDocument to active document
async function savePdfDocToActive(doc: Document, pdfDoc: PDFDocument) {
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
  let img: PDFImage;
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

export async function addText(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  
  const text = await showInputModal('Add Text');
  if (!text) return;

  const placement = await showPlacementOverlay({ type: 'text', text, fontSize: 12, opacity: 1 });
  if (!placement) return;

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const selected = getSelectedPages();
  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];

  for (const i of targets) {
    if (i < 0 || i >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    
    const xPage = placement.xNorm * width;
    const yPage = height - (placement.yNorm * height) - (placement.hNorm * height);
    const rot = typeof placement.rotateDeg === 'number' ? placement.rotateDeg : 0;
    
    page.drawText(text, {
      x: xPage,
      y: yPage,
      size: 12, // TODO: Make size configurable in modal or overlay
      font,
      color: rgb(0, 0, 0),
      rotate: degrees(rot),
    });
  }

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function redact(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  // Let user place a rectangle over the rendered canvas to choose the area to redact
  const placement = await showPlacementOverlay({ type: 'text', text: 'REDACT', fontSize: 36, opacity: 1 });
  if (!placement) return;

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const selected = getSelectedPages();
  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];

  for (const i of targets) {
    if (i < 0 || i >= pdfDoc.getPageCount()) continue;
    const page = pdfDoc.getPage(i);
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();

    const xPage = placement.xNorm * pageWidth;
    const yPage = pageHeight - (placement.yNorm * pageHeight) - (placement.hNorm * pageHeight);
    const w = placement.wNorm * pageWidth;
    const h = placement.hNorm * pageHeight;

    page.drawRectangle({
      x: xPage,
      y: yPage,
      width: w,
      height: h,
      color: rgb(0, 0, 0),
      borderWidth: 0,
      opacity: 1,
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

  const logWorkerWarning = (message: string, error: unknown) => {
    const safeError = error instanceof Error ? { message: error.message, name: error.name } : { message: String(error) };
    console.warn(message, safeError);
  };

  const cancelListener = () => {
    cancelled = true;
    if (worker) {
      try {
        worker.postMessage({ id: 'cancel', action: 'terminate' });
      } catch (e) {
        logWorkerWarning('Failed to send terminate signal to OCR worker', e);
      }
    }
  };
  window.addEventListener('bentopdf-ocr-cancel', cancelListener);

  let workerTerminateTimeout: number | undefined;
  const scheduleWorkerTermination = () => {
    if (workerTerminateTimeout) {
      clearTimeout(workerTerminateTimeout);
    }
    if (worker) {
      workerTerminateTimeout = window.setTimeout(() => {
        try {
          worker?.terminate();
        } catch (e) {
          logWorkerWarning('Failed to terminate OCR worker after timeout', e);
        }
      }, 30000);
    }
  };

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
        await page.render({ canvasContext: ctx, viewport, canvas: off }).promise;
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
            scheduleWorkerTermination();
          });

          const r = result as { text?: string; data?: { text?: string } };
          const text = r?.text ?? r?.data?.text ?? '';
          fullText += `--- Page ${pageNum} ---\n` + (text || '') + '\n\n';
          modal.updateText(fullText);
        } else {
          // Fallback: run Tesseract on main thread
          const res = await Tesseract.recognize(dataUrl, lang, {
            logger: (m: Tesseract.LoggerMessage) => {
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
    if (workerTerminateTimeout) {
      clearTimeout(workerTerminateTimeout);
    }
    if (worker) {
      if (!cancelled) {
        try {
          worker.postMessage({ id: 'done', action: 'terminate' });
        } catch (e) {
          logWorkerWarning('Failed to post terminate message to OCR worker', e);
        }
      }
      try {
        worker.terminate();
      } catch (e) {
        logWorkerWarning('Failed to terminate OCR worker', e);
      }
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

export async function reversePages(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  // Create a new PDF with pages in reverse order
  const newPdf = await PDFDocument.create();
  for (let i = pageCount - 1; i >= 0; i--) {
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);
  }

  const bytes = await newPdf.save();
  await updateDocumentBytes(doc, new Uint8Array(bytes));
}

export async function duplicate(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const selected = getSelectedPages();
  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];

  // Sort targets in ascending order and duplicate each
  const sortedTargets = [...targets].sort((a, b) => a - b);
  let offset = 0;

  for (const idx of sortedTargets) {
    const targetIdx = idx + offset;
    if (targetIdx >= 0 && targetIdx < pdfDoc.getPageCount()) {
      const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [targetIdx]);
      pdfDoc.insertPage(targetIdx + 1, copiedPage);
      offset++;
    }
  }

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
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

export async function pageNumbers(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pageCount = pdfDoc.getPageCount();
  const selected = getSelectedPages();
  const targets = selected.length ? selected : Array.from({ length: pageCount }, (_, i) => i);

  for (const i of targets) {
    if (i < 0 || i >= pageCount) continue;
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    const text = `${i + 1}`;
    const textWidth = font.widthOfTextAtSize(text, 10);

    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: 20,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

export async function greyscale(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  // Convert each page to grayscale by re-rendering and embedding
  const pdfDoc = await PDFDocument.create();
  const pageCount = doc.pdfJsDoc.numPages;
  const selected = getSelectedPages();
  const targets = selected.length ? selected : Array.from({ length: pageCount }, (_, i) => i);

  for (let i = 0; i < pageCount; i++) {
    const pdfPage = await doc.pdfJsDoc.getPage(i + 1);
    const viewport = pdfPage.getViewport({ scale: 2 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;

    // Apply grayscale filter if this page is targeted
    if (targets.includes(i)) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let j = 0; j < data.length; j += 4) {
        const avg = (data[j] + data[j + 1] + data[j + 2]) / 3;
        data[j] = avg;     // R
        data[j + 1] = avg; // G
        data[j + 2] = avg; // B
      }
      ctx.putImageData(imageData, 0, 0);
    }

    const imgData = canvas.toDataURL('image/png');
    const imgBytes = Uint8Array.from(atob(imgData.split(',')[1]), c => c.charCodeAt(0));
    const img = await pdfDoc.embedPng(imgBytes);

    const page = pdfDoc.addPage([viewport.width / 2, viewport.height / 2]);
    page.drawImage(img, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
  }

  const bytes = await pdfDoc.save();
  await updateDocumentBytes(doc, new Uint8Array(bytes));
  clearPageSelection();
}

export async function flatten(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  // Flatten by re-rendering each page as an image
  const pdfDoc = await PDFDocument.create();
  const pageCount = doc.pdfJsDoc.numPages;

  for (let i = 0; i < pageCount; i++) {
    const pdfPage = await doc.pdfJsDoc.getPage(i + 1);
    const viewport = pdfPage.getViewport({ scale: 2 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;

    const imgData = canvas.toDataURL('image/png');
    const imgBytes = Uint8Array.from(atob(imgData.split(',')[1]), c => c.charCodeAt(0));
    const img = await pdfDoc.embedPng(imgBytes);

    const page = pdfDoc.addPage([viewport.width / 2, viewport.height / 2]);
    page.drawImage(img, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
  }

  const bytes = await pdfDoc.save();
  await updateDocumentBytes(doc, new Uint8Array(bytes));
}

export async function metadata(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const title = pdfDoc.getTitle() || 'N/A';
  const author = pdfDoc.getAuthor() || 'N/A';
  const subject = pdfDoc.getSubject() || 'N/A';
  const creator = pdfDoc.getCreator() || 'N/A';
  const producer = pdfDoc.getProducer() || 'N/A';
  const creationDate = pdfDoc.getCreationDate()?.toISOString() || 'N/A';
  const modificationDate = pdfDoc.getModificationDate()?.toISOString() || 'N/A';
  const pageCount = pdfDoc.getPageCount();

  const message = `Title: ${title}
Author: ${author}
Subject: ${subject}
Creator: ${creator}
Producer: ${producer}
Created: ${creationDate}
Modified: ${modificationDate}
Pages: ${pageCount}
File Size: ${(doc.pdfBytes.length / 1024).toFixed(2)} KB`;

  showAlert('PDF Metadata', message);
}

export async function dimensions(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  const selected = getSelectedPages();
  const targets = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];

  let message = '';
  for (const i of targets) {
    if (i >= 0 && i < pageCount) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      const rotation = page.getRotation().angle;
      // Convert points to inches and mm
      const widthIn = (width / 72).toFixed(2);
      const heightIn = (height / 72).toFixed(2);
      const widthMm = (width / 72 * 25.4).toFixed(1);
      const heightMm = (height / 72 * 25.4).toFixed(1);

      message += `Page ${i + 1}:
  Size: ${width.toFixed(0)} × ${height.toFixed(0)} pts
  Inches: ${widthIn}" × ${heightIn}"
  Millimeters: ${widthMm} × ${heightMm} mm
  Rotation: ${rotation}°\n\n`;
    }
  }

  showAlert('Page Dimensions', message.trim());
  clearPageSelection();
}

// PDF to Image export functions
async function exportPdfToImage(format: 'png' | 'jpg' | 'webp' | 'bmp'): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const selected = getSelectedPages();
  const pageNums = selected.length ? selected.map(i => i + 1) : [doc.currentPage];

  for (const pageNum of pageNums) {
    const pdfPage = await doc.pdfJsDoc.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: 2 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // White background for jpg/bmp
    if (format === 'jpg' || format === 'bmp') {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;

    const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
    const ext = format === 'jpg' ? 'jpg' : format;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.fileName.replace(/\.pdf$/i, '')}_page_${pageNum}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }, mimeType, 0.95);
  }

  clearPageSelection();
}

export async function pdfToJpg(): Promise<void> {
  await exportPdfToImage('jpg');
}

export async function pdfToPng(): Promise<void> {
  await exportPdfToImage('png');
}

export async function pdfToWebp(): Promise<void> {
  await exportPdfToImage('webp');
}

export async function pdfToBmp(): Promise<void> {
  await exportPdfToImage('bmp');
}

export async function pdfToTiff(): Promise<void> {
  // TIFF export - fallback to PNG with .tiff extension (browser limitation)
  showAlert('TIFF Export', 'TIFF format is not natively supported in browsers. Exporting as PNG instead.');
  await exportPdfToImage('png');
}

// Image to PDF conversion functions
async function convertImageToPdf(acceptTypes?: string): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = acceptTypes || 'image/*';
  input.multiple = true;

  input.onchange = async () => {
    if (!input.files || input.files.length === 0) return;

    const pdfDoc = await PDFDocument.create();

    for (const file of Array.from(input.files)) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let img: PDFImage;

        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.png')) {
          img = await pdfDoc.embedPng(bytes);
        } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
          img = await pdfDoc.embedJpg(bytes);
        } else {
          // For other formats, convert via canvas
          const imgEl = await loadImageElement(file);
          const canvas = document.createElement('canvas');
          canvas.width = imgEl.width;
          canvas.height = imgEl.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.drawImage(imgEl, 0, 0);
          const pngData = canvas.toDataURL('image/png');
          const pngBytes = Uint8Array.from(atob(pngData.split(',')[1]), c => c.charCodeAt(0));
          img = await pdfDoc.embedPng(pngBytes);
        }

        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, {
          x: 0,
          y: 0,
          width: img.width,
          height: img.height,
        });
      } catch (e) {
        console.error('Error embedding image:', file.name, e);
      }
    }

    if (pdfDoc.getPageCount() === 0) {
      showAlert('Error', 'No valid images could be converted.');
      return;
    }

    const pdfBytes = await pdfDoc.save();
    await createDocumentFromBytes(new Uint8Array(pdfBytes), 'converted_images.pdf');
  };

  input.click();
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function imageToPdf(): Promise<void> {
  await convertImageToPdf('image/*');
}

export async function jpgToPdf(): Promise<void> {
  await convertImageToPdf('.jpg,.jpeg,image/jpeg');
}

export async function pngToPdf(): Promise<void> {
  await convertImageToPdf('.png,image/png');
}

export async function webpToPdf(): Promise<void> {
  await convertImageToPdf('.webp,image/webp');
}

export async function svgToPdf(): Promise<void> {
  await convertImageToPdf('.svg,image/svg+xml');
}

export async function bmpToPdf(): Promise<void> {
  await convertImageToPdf('.bmp,image/bmp');
}

export async function heicToPdf(): Promise<void> {
  await convertImageToPdf('.heic,.heif,image/heic,image/heif');
}

export async function tiffToPdf(): Promise<void> {
  await convertImageToPdf('.tiff,.tif,image/tiff');
}

export async function textToPdf(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,text/plain';

  input.onchange = async () => {
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const text = await file.text();

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Courier);
    const fontSize = 10;
    const margin = 50;
    const lineHeight = fontSize * 1.2;

    const lines = text.split('\n');
    let page = pdfDoc.addPage();
    let { width, height } = page.getSize();
    let y = height - margin;

    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage();
        y = page.getHeight() - margin;
      }

      // Word wrap long lines
      const maxWidth = width - 2 * margin;
      let remainingLine = line;

      while (remainingLine.length > 0) {
        let fitLength = remainingLine.length;
        while (font.widthOfTextAtSize(remainingLine.substring(0, fitLength), fontSize) > maxWidth && fitLength > 1) {
          fitLength--;
        }

        const linePart = remainingLine.substring(0, fitLength);
        remainingLine = remainingLine.substring(fitLength);

        if (y < margin + lineHeight) {
          page = pdfDoc.addPage();
          y = page.getHeight() - margin;
        }

        page.drawText(linePart, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;
      }
    }

    const pdfBytes = await pdfDoc.save();
    const baseName = file.name.replace(/\.txt$/i, '') || 'text';
    await createDocumentFromBytes(new Uint8Array(pdfBytes), `${baseName}.pdf`);
  };

  input.click();
}

export async function jsonToPdf(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';

  input.onchange = async () => {
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const jsonText = await file.text();

    // Pretty-print JSON
    let prettyJson: string;
    try {
      const parsed = JSON.parse(jsonText);
      prettyJson = JSON.stringify(parsed, null, 2);
    } catch {
      prettyJson = jsonText;
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Courier);
    const fontSize = 9;
    const margin = 40;
    const lineHeight = fontSize * 1.3;

    const lines = prettyJson.split('\n');
    let page = pdfDoc.addPage();
    let { height } = page.getSize();
    let y = height - margin;

    for (const line of lines) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage();
        y = page.getHeight() - margin;
      }

      page.drawText(line.substring(0, 100), { // Truncate very long lines
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineHeight;
    }

    const pdfBytes = await pdfDoc.save();
    const baseName = file.name.replace(/\.json$/i, '') || 'json';
    await createDocumentFromBytes(new Uint8Array(pdfBytes), `${baseName}.pdf`);
  };

  input.click();
}

export async function pdfToJson(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });

  const output = {
    fileName: doc.fileName,
    pageCount: pdfDoc.getPageCount(),
    metadata: {
      title: pdfDoc.getTitle() || null,
      author: pdfDoc.getAuthor() || null,
      subject: pdfDoc.getSubject() || null,
      creator: pdfDoc.getCreator() || null,
      producer: pdfDoc.getProducer() || null,
      creationDate: pdfDoc.getCreationDate()?.toISOString() || null,
      modificationDate: pdfDoc.getModificationDate()?.toISOString() || null,
    },
    pages: [] as Array<{ pageNumber: number; width: number; height: number; rotation: number }>,
  };

  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    output.pages.push({
      pageNumber: i + 1,
      width,
      height,
      rotation: page.getRotation().angle,
    });
  }

  const jsonStr = JSON.stringify(output, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName.replace(/\.pdf$/i, '') + '.json';
  a.click();
  URL.revokeObjectURL(url);
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
  reversePages,
  duplicate,
  pageNumbers,
  greyscale,
  flatten,
  metadata,
  dimensions,
  pdfToJpg,
  pdfToPng,
  pdfToWebp,
  pdfToBmp,
  pdfToTiff,
  imageToPdf,
  jpgToPdf,
  pngToPdf,
  webpToPdf,
  svgToPdf,
  bmpToPdf,
  heicToPdf,
  tiffToPdf,
  textToPdf,
  jsonToPdf,
  pdfToJson,
};
