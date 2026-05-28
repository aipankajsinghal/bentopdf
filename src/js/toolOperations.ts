import { PDFDocument, RotationTypes, StandardFonts, rgb, degrees, PDFName, PDFDict, PDFArray, PDFNumber, PDFString } from 'pdf-lib';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { pdfjsLib } from './utils/pdfjs-init.js';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { showWatermarkModal, showStampModal, showSignModal } from './ui/editorModals.js';
import { showPlacementOverlay } from './ui/placementOverlay.js';
import Tesseract from 'tesseract.js';
import { showTextModal } from './ui/textModal.js';
import { showInputModal } from './ui/inputModal.js';
import { showOcrModal } from './ui/editorModals.js';
import {
  getActiveDocument,
  getAllDocuments,
  updateDocumentBytes,
  createDocumentFromBytes,
  openDocument,
  Document,
} from './documentManager.js';
import { getSelectedPages, clearPageSelection, setClipboard, getClipboard, clearClipboard, ClipboardData } from './state.js';
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

// ============================================================================
// PDF to Text / DOCX export
// ============================================================================

export async function pdfToTxt(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const selected = getSelectedPages();
  const pageNums = selected.length
    ? selected.map(i => i + 1)
    : Array.from({ length: doc.pdfJsDoc.numPages }, (_, i) => i + 1);

  const pageTexts: string[] = [];
  for (const pageNum of pageNums) {
    const page = await doc.pdfJsDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = (content.items as any[]).map(item => item.str).join(' ');
    pageTexts.push(`--- Page ${pageNum} ---\n${text}`);
  }

  const fullText = pageTexts.join('\n\n');
  const blob = new Blob([fullText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName.replace(/\.pdf$/i, '') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  clearPageSelection();
}

export async function pdfToDocx(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const selected = getSelectedPages();
  const pageNums = selected.length
    ? selected.map(i => i + 1)
    : Array.from({ length: doc.pdfJsDoc.numPages }, (_, i) => i + 1);

  const children: Paragraph[] = [];
  for (const pageNum of pageNums) {
    if (children.length > 0) {
      children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    }
    children.push(
      new Paragraph({
        text: `Page ${pageNum}`,
        heading: HeadingLevel.HEADING_2,
      })
    );
    const page = await doc.pdfJsDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const text = (content.items as any[]).map(item => item.str).join(' ');
    children.push(new Paragraph({ children: [new TextRun(text)] }));
  }

  const docx = new DocxDocument({ sections: [{ children }] });
  const blob = await Packer.toBlob(docx);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName.replace(/\.pdf$/i, '') + '.docx';
  a.click();
  URL.revokeObjectURL(url);
  clearPageSelection();
}

// ============================================================================
// Alternate Merge — interleave pages from two PDFs
// ============================================================================

export async function alternateMerge(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) { showAlert('Alternate Merge', 'Open a PDF first.'); return; }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.click();
  const file = await new Promise<File | null>(res => {
    input.onchange = () => res(input.files?.[0] ?? null);
    input.oncancel = () => res(null);
    // fallback if oncancel not supported
    setTimeout(() => res(null), 60000);
  });
  if (!file) return;

  const aDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const bBytes = new Uint8Array(await file.arrayBuffer());
  const bDoc = await PDFDocument.load(bBytes, { ignoreEncryption: true });

  const aPages = await aDoc.copyPages(aDoc, aDoc.getPageIndices());
  const bPages = await bDoc.copyPages(bDoc, bDoc.getPageIndices());

  const merged = await PDFDocument.create();
  const maxLen = Math.max(aPages.length, bPages.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < aPages.length) merged.addPage(aPages[i]);
    if (i < bPages.length) merged.addPage(bPages[i]);
  }

  await savePdfDocToActive(doc, merged);
  clearPageSelection();
}

// ============================================================================
// Add Page Labels — write named labels into the PDF catalog
// ============================================================================

export async function addPageLabels(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const raw = await showInputModal(
    'Add Page Labels',
    'prefix:, style: D | r | R | a | A, start: 1\nExample:  prefix:Appendix-, style:D, start:1\nLeave blank for plain Arabic from page 1.'
  );
  if (raw === null) return;

  // Parse the simple "key:value, key:value" format
  const params: Record<string, string> = {};
  raw.split(',').forEach(part => {
    const [k, v] = part.split(':').map(s => s.trim());
    if (k && v !== undefined) params[k.toLowerCase()] = v;
  });

  const prefix = params['prefix'] ?? '';
  const style  = ['D','r','R','a','A'].includes(params['style'] ?? '') ? params['style'] : 'D';
  const start  = parseInt(params['start'] ?? '1', 10) || 1;

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });

  // Build /PageLabels << /Nums [ 0 << /S /X /P (prefix) /St N >> ] >>
  const labelDict = pdfDoc.context.obj({
    S: PDFName.of(style!),
    ...(prefix ? { P: PDFString.of(prefix) } : {}),
    ...(start !== 1 ? { St: PDFNumber.of(start) } : {}),
  }) as PDFDict;

  const numsArray = pdfDoc.context.obj([PDFNumber.of(0), labelDict]) as PDFArray;
  const pageLabels = pdfDoc.context.obj({ Nums: numsArray }) as PDFDict;
  pdfDoc.catalog.set(PDFName.of('PageLabels'), pageLabels);

  await savePdfDocToActive(doc, pdfDoc);
}

// ============================================================================
// Bates Numbering — stamp sequential legal numbers on each page
// ============================================================================

export async function batesNumbering(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const raw = await showInputModal('Bates Numbering', 'prefix:BATES, start:1, digits:6\nExample:  prefix:DOC-, start:1, digits:6');
  if (raw === null) return;

  const params: Record<string, string> = {};
  raw.split(',').forEach(part => {
    const [k, v] = part.split(':').map(s => s.trim());
    if (k && v !== undefined) params[k.toLowerCase()] = v;
  });

  const prefix = params['prefix'] ?? 'BATES';
  const start  = parseInt(params['start']  ?? '1', 10) || 1;
  const digits = Math.max(1, parseInt(params['digits'] ?? '6', 10) || 6);

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const font   = await pdfDoc.embedFont(StandardFonts.Courier);
  const selected = getSelectedPages();
  const targets  = selected.length
    ? selected
    : Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);

  targets.forEach((i, seq) => {
    if (i < 0 || i >= pdfDoc.getPageCount()) return;
    const page    = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    const label   = `${prefix}${String(start + seq).padStart(digits, '0')}`;
    const fontSize = 8;
    const textWidth = font.widthOfTextAtSize(label, fontSize);
    page.drawText(label, {
      x: width - textWidth - 14,
      y: 10,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

// ============================================================================
// Custom Rotation — rotate by any arbitrary angle
// ============================================================================

export async function rotateCustom(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const raw = await showInputModal('Custom Rotation', 'Enter angle in degrees (e.g. 45, -30, 270):');
  if (raw === null) return;
  const angle = parseFloat(raw.trim());
  if (!isFinite(angle)) { showAlert('Custom Rotation', 'Invalid angle.'); return; }

  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const selected = getSelectedPages();
  const targets  = selected.length ? selected : [Math.max(0, doc.currentPage - 1)];

  // PDF rotation must be a multiple of 90; for arbitrary angles use page.setRotation with degrees()
  // pdf-lib only supports multiples of 90 in setRotation, so we normalize to nearest 90
  // For true arbitrary rotation we draw on a transformed page — keep it to 90-step snapping for now
  const snapped = Math.round(angle / 90) * 90;
  targets.forEach(i => {
    if (i < 0 || i >= pdfDoc.getPageCount()) return;
    const p    = pdfDoc.getPage(i);
    const base = p.getRotation().angle;
    const next = ((base + snapped) % 360 + 360) % 360;
    p.setRotation({ type: RotationTypes.Degrees, angle: next });
  });

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

// ============================================================================
// Bundle to ZIP — pack all open documents into a single ZIP download
// ============================================================================

export async function bundleToZip(): Promise<void> {
  const docs = getAllDocuments();
  if (docs.length === 0) { showAlert('Bundle to ZIP', 'No open documents.'); return; }

  const zip = new JSZip();
  // Deduplicate file names
  const seen = new Map<string, number>();
  for (const d of docs) {
    const base = d.fileName || 'document.pdf';
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const name = count === 1 ? base : base.replace(/\.pdf$/i, '') + `_${count}.pdf`;
    zip.file(name, d.pdfBytes);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `nexuspdf-bundle-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// PDF Overlay / Underlay — stamp a second PDF on every page
// ============================================================================

export async function pdfOverlay(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  // Pick mode
  const mode = await new Promise<'overlay' | 'underlay' | null>(resolve => {
    const wrapper = document.createElement('div');
    wrapper.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    wrapper.innerHTML = `
      <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-2xl w-full max-w-sm p-6">
        <h3 class="text-lg font-bold text-white mb-4">PDF Overlay / Underlay</h3>
        <p class="text-sm text-gray-400 mb-4">Pick a second PDF and how to composite it with each page of the active document.</p>
        <div class="flex gap-3 justify-end">
          <button id="btn-cancel" class="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded">Cancel</button>
          <button id="btn-underlay" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded">Underlay</button>
          <button id="btn-overlay" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded">Overlay</button>
        </div>
      </div>`;
    document.body.appendChild(wrapper);
    wrapper.querySelector('#btn-overlay')!.addEventListener('click', () => { wrapper.remove(); resolve('overlay'); });
    wrapper.querySelector('#btn-underlay')!.addEventListener('click', () => { wrapper.remove(); resolve('underlay'); });
    wrapper.querySelector('#btn-cancel')!.addEventListener('click', () => { wrapper.remove(); resolve(null); });
  });
  if (!mode) return;

  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/pdf,.pdf'; input.click();
  const file = await new Promise<File | null>(res => {
    input.onchange = () => res(input.files?.[0] ?? null);
    setTimeout(() => res(null), 60000);
  });
  if (!file) return;

  const stampBytes = new Uint8Array(await file.arrayBuffer());
  const pdfDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const stampDoc = await PDFDocument.load(stampBytes, { ignoreEncryption: true });
  const stampPageCount = stampDoc.getPageCount();

  for (let i = 0; i < pdfDoc.getPageCount(); i++) {
    const stampIdx = i % stampPageCount;
    const [embedded] = await pdfDoc.embedPdf(stampBytes, [stampIdx]);
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    const drawOpts = { x: 0, y: 0, width, height, opacity: 0.6 };
    if (mode === 'overlay') {
      page.drawPage(embedded, drawOpts);
    } else {
      // Underlay: draw stamp first, then re-embed original page content on top
      // pdf-lib can't reorder existing content, so we create a new page with stamp then original
      const [origEmbedded] = await pdfDoc.embedPdf(doc.pdfBytes, [i]);
      const blank = pdfDoc.insertPage(i + 1, [width, height]);
      blank.drawPage(embedded, { x: 0, y: 0, width, height, opacity: 0.6 });
      blank.drawPage(origEmbedded, { x: 0, y: 0, width, height });
      pdfDoc.removePage(i); // remove original page
    }
  }

  await savePdfDocToActive(doc, pdfDoc);
}

// ============================================================================
// Extract Images — pull embedded images out of a PDF
// ============================================================================

export async function extractImages(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const selected = getSelectedPages();
  const pageNums = selected.length
    ? selected.map(i => i + 1)
    : Array.from({ length: doc.pdfJsDoc.numPages }, (_, i) => i + 1);

  let count = 0;
  const { OPS } = pdfjsLib as any;

  for (const pageNum of pageNums) {
    const page = await doc.pdfJsDoc.getPage(pageNum);
    const opList = await page.getOperatorList();
    const seen = new Set<string>();

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (fn !== OPS.paintImageXObject && fn !== OPS.paintJpegXObject &&
          fn !== OPS.paintImageMaskXObject) continue;
      const name: string = opList.argsArray[i][0];
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const imgObj = await new Promise<any>(resolve => {
        (page as any).objs.get(name, (obj: any) => resolve(obj));
      });
      if (!imgObj) continue;

      const canvas = document.createElement('canvas');

      if (imgObj.bitmap) {
        // pdfjs v5 returns ImageBitmap
        canvas.width  = imgObj.bitmap.width;
        canvas.height = imgObj.bitmap.height;
        canvas.getContext('2d')!.drawImage(imgObj.bitmap, 0, 0);
      } else if (imgObj.data && imgObj.width && imgObj.height) {
        canvas.width  = imgObj.width;
        canvas.height = imgObj.height;
        const ctx  = canvas.getContext('2d')!;
        const idat = ctx.createImageData(imgObj.width, imgObj.height);
        const src  = imgObj.data as Uint8ClampedArray | Uint8Array;
        const kind: number = imgObj.kind ?? 3;
        if (kind === 2) {
          // RGB_24BPP → RGBA
          for (let j = 0, k = 0; j < src.length; j += 3, k += 4) {
            idat.data[k] = src[j]; idat.data[k+1] = src[j+1];
            idat.data[k+2] = src[j+2]; idat.data[k+3] = 255;
          }
        } else {
          idat.data.set(src.length === idat.data.length ? src : src.subarray(0, idat.data.length));
        }
        ctx.putImageData(idat, 0, 0);
      } else {
        continue;
      }

      count++;
      const idx = count;
      const baseName = doc.fileName.replace(/\.pdf$/i, '');
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}_p${pageNum}_img${idx}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    }
  }

  if (count === 0)
    showAlert('Extract Images', 'No embedded images were found in the selected pages.');
  else
    showAlert('Extract Images', `Extracted ${count} image${count > 1 ? 's' : ''}.`);
}

// ============================================================================
// PDF Booklet — reorder pages for saddle-stitch printing
// ============================================================================

export async function pdfBooklet(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const srcBytes = doc.pdfBytes;
  const srcDoc   = await PDFDocument.load(srcBytes, { ignoreEncryption: true });

  // Pad to nearest multiple of 4
  while (srcDoc.getPageCount() % 4 !== 0) srcDoc.addPage();
  const n = srcDoc.getPageCount();

  // Build sheet pairs (leftPage, rightPage) as 0-based indices
  const pairs: [number, number][] = [];
  let lo = 0, hi = n - 1, flip = false;
  while (lo < hi) {
    pairs.push(flip ? [lo, hi] : [hi, lo]);
    lo++; hi--; flip = !flip;
  }

  // Embed all source pages once
  const paddedBytes = await srcDoc.save();
  const allPages    = await (await PDFDocument.create()).embedPdf(paddedBytes, srcDoc.getPageIndices());
  const bookletDoc  = await PDFDocument.create();

  // Use first page size (portrait); sheet is 2× wide (landscape)
  const firstSrc  = srcDoc.getPage(0);
  const { width: pw, height: ph } = firstSrc.getSize();

  for (const [leftIdx, rightIdx] of pairs) {
    const sheet = bookletDoc.addPage([pw * 2, ph]);
    if (leftIdx < allPages.length)
      sheet.drawPage(allPages[leftIdx],  { x: 0,  y: 0, width: pw, height: ph });
    if (rightIdx < allPages.length)
      sheet.drawPage(allPages[rightIdx], { x: pw, y: 0, width: pw, height: ph });
  }

  await savePdfDocToActive(doc, bookletDoc);
}

// ============================================================================
// Scanner Effect — make pages look like photocopied scans
// ============================================================================

export async function scannerEffect(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const pdfDoc   = await PDFDocument.create();
  const pageCount = doc.pdfJsDoc.numPages;
  const selected  = getSelectedPages();
  const targets   = selected.length ? selected : Array.from({ length: pageCount }, (_, i) => i);

  for (let i = 0; i < pageCount; i++) {
    const pdfPage = await doc.pdfJsDoc.getPage(i + 1);
    const viewport = pdfPage.getViewport({ scale: 1.5 });
    const canvas  = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    const ctx     = canvas.getContext('2d')!;
    await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;

    if (targets.includes(i)) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let j = 0; j < d.length; j += 4) {
        // Desaturate with warm tint
        const gray = 0.299 * d[j] + 0.587 * d[j+1] + 0.114 * d[j+2];
        // Slight contrast boost then warm tint
        const c = Math.max(0, Math.min(255, (gray - 128) * 1.15 + 128));
        d[j]   = Math.min(255, c + 8);   // R warmer
        d[j+1] = Math.min(255, c + 2);   // G neutral
        d[j+2] = Math.max(0,   c - 8);   // B cooler
        // Subtle noise
        const noise = (Math.random() - 0.5) * 10;
        d[j]   = Math.max(0, Math.min(255, d[j]   + noise));
        d[j+1] = Math.max(0, Math.min(255, d[j+1] + noise));
        d[j+2] = Math.max(0, Math.min(255, d[j+2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const jpegData  = canvas.toDataURL('image/jpeg', 0.82);
    const jpegBytes = Uint8Array.from(atob(jpegData.split(',')[1]), c => c.charCodeAt(0));
    const img  = await pdfDoc.embedJpg(jpegBytes);
    const page = pdfDoc.addPage([viewport.width / 1.5, viewport.height / 1.5]);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }

  await savePdfDocToActive(doc, pdfDoc);
  clearPageSelection();
}

// ============================================================================
// Markdown to PDF — convert .md files using pdf-lib
// ============================================================================

interface MdToken { type: 'h1'|'h2'|'h3'|'p'|'li'|'code'|'hr'|'blank'; text: string }

function parseMd(src: string): MdToken[] {
  const tokens: MdToken[] = [];
  const lines = src.split('\n');
  let inCode = false;
  let codeBuf: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      if (inCode) {
        tokens.push({ type: 'code', text: codeBuf.join('\n') });
        codeBuf = []; inCode = false;
      } else { inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) { tokens.push({ type: 'hr', text: '' }); continue; }
    if (line.startsWith('### ')) { tokens.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## '))  { tokens.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# '))   { tokens.push({ type: 'h1', text: line.slice(2) }); continue; }
    if (/^[-*+] /.test(line))    { tokens.push({ type: 'li', text: '• ' + line.slice(2) }); continue; }
    if (/^\d+\. /.test(line))    { tokens.push({ type: 'li', text: line.replace(/^\d+\. /, '  ') }); continue; }
    if (line.trim() === '')      { tokens.push({ type: 'blank', text: '' }); continue; }
    // strip inline markdown (bold/italic)
    const text = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
                     .replace(/__(.+?)__/g, '$1').replace(/_(.+?)_/g, '$1')
                     .replace(/`(.+?)`/g, '$1');
    tokens.push({ type: 'p', text });
  }
  return tokens;
}

export async function markdownToPdf(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.md,.markdown,text/markdown';
  input.click();
  const file = await new Promise<File | null>(res => {
    input.onchange = () => res(input.files?.[0] ?? null);
    setTimeout(() => res(null), 60000);
  });
  if (!file) return;

  const src    = await file.text();
  const tokens = parseMd(src);

  const pdfDoc  = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const mono    = await pdfDoc.embedFont(StandardFonts.Courier);

  const margin = 56, pageW = 595, pageH = 842;
  const contentW = pageW - margin * 2;
  let page = pdfDoc.addPage([pageW, pageH]);
  let y    = pageH - margin;

  const newPage = () => {
    page = pdfDoc.addPage([pageW, pageH]);
    y    = pageH - margin;
  };
  const ensureSpace = (needed: number) => { if (y - needed < margin) newPage(); };

  const drawWrapped = (text: string, font: typeof regular, size: number, indent = 0, leading = 1.4) => {
    const lh    = size * leading;
    const avail = contentW - indent;
    const words = text.split(' ');
    let line    = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > avail && line) {
        ensureSpace(lh);
        page.drawText(line, { x: margin + indent, y, size, font, color: rgb(0,0,0) });
        y -= lh; line = w;
      } else { line = test; }
    }
    if (line) {
      ensureSpace(lh);
      page.drawText(line, { x: margin + indent, y, size, font, color: rgb(0,0,0) });
      y -= lh;
    }
  };

  for (const tok of tokens) {
    switch (tok.type) {
      case 'h1': ensureSpace(32); drawWrapped(tok.text, bold,    22); y -= 4; break;
      case 'h2': ensureSpace(28); drawWrapped(tok.text, bold,    17); y -= 3; break;
      case 'h3': ensureSpace(22); drawWrapped(tok.text, bold,    13); y -= 2; break;
      case 'p':                   drawWrapped(tok.text, regular, 10);         break;
      case 'li':                  drawWrapped(tok.text, regular, 10, 12);     break;
      case 'code': {
        const lines2 = tok.text.split('\n');
        const boxH   = lines2.length * 13 + 10;
        ensureSpace(boxH);
        page.drawRectangle({ x: margin - 2, y: y - boxH + 13, width: contentW + 4, height: boxH,
                             color: rgb(0.94, 0.94, 0.94), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
        for (const l of lines2) {
          page.drawText(l, { x: margin + 4, y, size: 9, font: mono, color: rgb(0.15, 0.15, 0.15) });
          y -= 13;
        }
        y -= 4; break;
      }
      case 'hr':
        ensureSpace(16);
        page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y },
                        thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        y -= 12; break;
      case 'blank': y -= 6; break;
    }
  }

  const baseName = file.name.replace(/\.(md|markdown)$/i, '') || 'document';
  await createDocumentFromBytes(await pdfDoc.save(), `${baseName}.pdf`);
}

// ============================================================================
// PDF to SVG — export pages as SVG files (image-backed)
// ============================================================================

export async function pdfToSvg(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const selected  = getSelectedPages();
  const pageNums  = selected.length ? selected.map(i => i + 1) : [doc.currentPage];
  const baseName  = doc.fileName.replace(/\.pdf$/i, '');

  for (const pageNum of pageNums) {
    const pdfPage  = await doc.pdfJsDoc.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: 2 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    const ctx      = canvas.getContext('2d')!;
    await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;

    const pngDataUrl = canvas.toDataURL('image/png');
    const w = viewport.width / 2, h = viewport.height / 2;
    const svg = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `     width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
      `  <image x="0" y="0" width="${w}" height="${h}" xlink:href="${pngDataUrl}"/>`,
      `</svg>`,
    ].join('\n');

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${baseName}_page_${pageNum}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }
  clearPageSelection();
}

// ============================================================================
// Deskew PDF — detect and correct page skew using projection profile method
// ============================================================================

/**
 * Detect the skew angle of a rendered page canvas.
 * Uses the horizontal projection profile variance method:
 * the angle that makes text lines most "sharp" (highest row-sum variance)
 * is the deskew angle.
 *
 * Returns angle in degrees (positive = clockwise skew that needs CCW correction).
 */
function detectSkewAngle(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  const { width: W, height: H } = canvas;
  const data = ctx.getImageData(0, 0, W, H).data;

  // Build binary image: 1 = dark pixel (ink), 0 = light (background)
  const binary = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    binary[i] = (0.299 * r + 0.587 * g + 0.114 * b) < 180 ? 1 : 0;
  }

  // Collect dark pixel coordinates for efficient rotation
  const xs: number[] = [];
  const ys: number[] = [];
  const cx = W / 2, cy = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (binary[y * W + x]) {
        xs.push(x - cx);
        ys.push(y - cy);
      }
    }
  }

  let bestAngle = 0;
  let bestScore = -1;

  // Coarse scan: -12° to +12° in 1° steps
  const testAngles: number[] = [];
  for (let a = -12; a <= 12; a += 1) testAngles.push(a);

  const measure = (angleDeg: number): number => {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const projSize = Math.round(Math.abs(W * sin) + Math.abs(H * cos)) + 2;
    const half = projSize / 2;
    const proj = new Int32Array(projSize);
    for (let i = 0; i < xs.length; i++) {
      // Rotate pixel around centre
      const ry = xs[i] * sin + ys[i] * cos;
      const row = Math.round(ry + half);
      if (row >= 0 && row < projSize) proj[row]++;
    }
    // Variance of projection = sharpness score
    let sum = 0, sum2 = 0;
    for (let j = 0; j < projSize; j++) { sum += proj[j]; sum2 += proj[j] * proj[j]; }
    const mean = sum / projSize;
    return sum2 / projSize - mean * mean;
  };

  for (const a of testAngles) {
    const score = measure(a);
    if (score > bestScore) { bestScore = score; bestAngle = a; }
  }

  // Fine scan: ±1° around best coarse angle in 0.2° steps
  for (let a = bestAngle - 1; a <= bestAngle + 1; a += 0.2) {
    const score = measure(a);
    if (score > bestScore) { bestScore = score; bestAngle = a; }
  }

  return bestAngle;
}

export async function deskewPdf(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const selected = getSelectedPages();
  const pageIndices = selected.length > 0
    ? selected
    : Array.from({ length: doc.pdfJsDoc.numPages }, (_, i) => i);

  const THRESHOLD = 0.4; // minimum angle (degrees) worth correcting
  const DETECT_SCALE = 0.8; // scale for angle-detection render
  const RENDER_SCALE = 1.5; // scale for final high-quality render

  const srcDoc = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const newDoc = await PDFDocument.create();
  const srcPages = srcDoc.getPages();
  const totalPages = srcPages.length;

  let correctedCount = 0;

  for (let i = 0; i < totalPages; i++) {
    if (!pageIndices.includes(i)) {
      // Keep page as-is
      const [copied] = await newDoc.copyPages(srcDoc, [i]);
      newDoc.addPage(copied);
      continue;
    }

    const pdfPage = await doc.pdfJsDoc.getPage(i + 1);

    // --- Step 1: detect skew on a small render ---
    const detViewport = pdfPage.getViewport({ scale: DETECT_SCALE });
    const detCanvas = document.createElement('canvas');
    detCanvas.width  = Math.round(detViewport.width);
    detCanvas.height = Math.round(detViewport.height);
    const detCtx = detCanvas.getContext('2d')!;
    detCtx.fillStyle = 'white';
    detCtx.fillRect(0, 0, detCanvas.width, detCanvas.height);
    await pdfPage.render({ canvasContext: detCtx, viewport: detViewport, canvas: detCanvas }).promise;

    const angle = detectSkewAngle(detCanvas);

    if (Math.abs(angle) < THRESHOLD) {
      // Straight enough — copy without change
      const [copied] = await newDoc.copyPages(srcDoc, [i]);
      newDoc.addPage(copied);
      continue;
    }

    correctedCount++;

    // --- Step 2: render page at full quality ---
    const fullViewport = pdfPage.getViewport({ scale: RENDER_SCALE });
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width  = Math.round(fullViewport.width);
    fullCanvas.height = Math.round(fullViewport.height);
    const fullCtx = fullCanvas.getContext('2d')!;
    fullCtx.fillStyle = 'white';
    fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
    await pdfPage.render({ canvasContext: fullCtx, viewport: fullViewport, canvas: fullCanvas }).promise;

    // --- Step 3: rotate canvas by -angle to correct skew ---
    const rad = (-angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const FW = fullCanvas.width, FH = fullCanvas.height;
    const newW = Math.round(FW * cos + FH * sin);
    const newH = Math.round(FH * cos + FW * sin);

    const rotCanvas = document.createElement('canvas');
    rotCanvas.width  = newW;
    rotCanvas.height = newH;
    const rotCtx = rotCanvas.getContext('2d')!;
    rotCtx.fillStyle = 'white';
    rotCtx.fillRect(0, 0, newW, newH);
    rotCtx.save();
    rotCtx.translate(newW / 2, newH / 2);
    rotCtx.rotate(rad);
    rotCtx.drawImage(fullCanvas, -FW / 2, -FH / 2);
    rotCtx.restore();

    // --- Step 4: embed rotated image into a new page ---
    const jpegBytes = await new Promise<Uint8Array>((resolve) => {
      rotCanvas.toBlob(blob => {
        blob!.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
      }, 'image/jpeg', 0.92);
    });
    const embedded = await newDoc.embedJpg(jpegBytes);

    // Keep original page dimensions (aspect may shift slightly — crop to original size)
    const srcPage = srcPages[i];
    const { width: pgW, height: pgH } = srcPage.getSize();
    const newPage = newDoc.addPage([pgW, pgH]);
    newPage.drawImage(embedded, { x: 0, y: 0, width: pgW, height: pgH });
  }

  clearPageSelection();
  await savePdfDocToActive(doc, newDoc);

  const msg = correctedCount > 0
    ? `Deskewed ${correctedCount} page(s). ${totalPages - correctedCount - (totalPages - pageIndices.length)} page(s) were already straight.`
    : 'No significant skew detected — all selected pages are already straight.';
  showAlert('Deskew Complete', msg);
}

// Minimal UI helper (deferred to main.ts alert)
function showAlert(title: string, message: string) {
  const event = new CustomEvent('bentopdf-show-alert', { detail: { title, message } });
  window.dispatchEvent(event);
}

// ============================================================================
// Clipboard Operations (Copy/Cut/Paste Pages)
// ============================================================================

export async function copyPages(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const selected = getSelectedPages();
  if (selected.length === 0) {
    showAlert('No Selection', 'Please select pages to copy.');
    return;
  }

  // Create a new PDF with just the selected pages
  const srcPdf = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const clipboardPdf = await PDFDocument.create();

  const copiedPages = await clipboardPdf.copyPages(srcPdf, selected);
  copiedPages.forEach(page => clipboardPdf.addPage(page));

  const clipboardBytes = await clipboardPdf.save();

  setClipboard({
    docId: doc.id,
    pageIndices: [...selected],
    pdfBytes: new Uint8Array(clipboardBytes),
    operation: 'copy',
  });

  showAlert('Copied', `${selected.length} page(s) copied to clipboard.`);
}

export async function cutPages(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const selected = getSelectedPages();
  if (selected.length === 0) {
    showAlert('No Selection', 'Please select pages to cut.');
    return;
  }

  // Create a new PDF with just the selected pages for clipboard
  const srcPdf = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const clipboardPdf = await PDFDocument.create();

  const copiedPages = await clipboardPdf.copyPages(srcPdf, selected);
  copiedPages.forEach(page => clipboardPdf.addPage(page));

  const clipboardBytes = await clipboardPdf.save();

  setClipboard({
    docId: doc.id,
    pageIndices: [...selected],
    pdfBytes: new Uint8Array(clipboardBytes),
    operation: 'cut',
  });

  // Remove the selected pages from the source document
  const pageCount = srcPdf.getPageCount();
  // Remove in reverse order to maintain correct indices
  const sortedIndices = [...selected].sort((a, b) => b - a);
  for (const idx of sortedIndices) {
    if (idx >= 0 && idx < pageCount) {
      srcPdf.removePage(idx);
    }
  }

  // Don't allow removing all pages - leave at least one
  if (srcPdf.getPageCount() === 0) {
    showAlert('Error', 'Cannot remove all pages. At least one page must remain.');
    clearClipboard();
    return;
  }

  await savePdfDocToActive(doc, srcPdf);
  clearPageSelection();

  showAlert('Cut', `${selected.length} page(s) cut to clipboard.`);
}

export async function pastePages(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  const clipboard = getClipboard();
  if (!clipboard) {
    showAlert('Clipboard Empty', 'No pages in clipboard. Copy or cut pages first.');
    return;
  }

  const destPdf = await PDFDocument.load(doc.pdfBytes, { ignoreEncryption: true });
  const srcPdf = await PDFDocument.load(clipboard.pdfBytes, { ignoreEncryption: true });

  // Determine insert position - after current page or at the end if no page selected
  const selected = getSelectedPages();
  let insertIndex = destPdf.getPageCount(); // Default to end

  if (selected.length > 0) {
    // Insert after the last selected page
    insertIndex = Math.max(...selected) + 1;
  } else if (doc.currentPage > 0) {
    // Insert after current page
    insertIndex = doc.currentPage;
  }

  // Copy all pages from clipboard
  const pageIndices = srcPdf.getPageIndices();
  const copiedPages = await destPdf.copyPages(srcPdf, pageIndices);

  // Insert pages at the determined position
  for (let i = 0; i < copiedPages.length; i++) {
    destPdf.insertPage(insertIndex + i, copiedPages[i]);
  }

  await savePdfDocToActive(doc, destPdf);
  clearPageSelection();

  showAlert('Pasted', `${copiedPages.length} page(s) pasted.`);
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
  pdfToTxt,
  pdfToDocx,
  copyPages,
  cutPages,
  pastePages,
  alternateMerge,
  addPageLabels,
  batesNumbering,
  rotateCustom,
  bundleToZip,
  pdfOverlay,
  extractImages,
  pdfBooklet,
  scannerEffect,
  markdownToPdf,
  pdfToSvg,
  deskewPdf,
};
