// Viewer wrapper - PDF rendering and thumbnail strip
import * as pdfjsLib from 'pdfjs-dist';
import { getActiveDocument, Document } from './documentManager.js';
import { createIcons, icons } from 'lucide';

// ============================================================================
// State
// ============================================================================

let currentZoom = 1.0;
let isThumbsVisible = true;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.25;
// Track current pdf.js render task so we can cancel overlapping renders
let currentRenderTask: any = null;

// ============================================================================
// Viewer Rendering
// ============================================================================

export async function refreshViewer(): Promise<void> {
  const doc = getActiveDocument();
  const viewerContainer = document.getElementById('pdf-viewer');
  const dropZone = document.getElementById('drop-zone');

  if (!doc || !viewerContainer) {
    if (dropZone) dropZone.classList.remove('hidden');
    if (viewerContainer) viewerContainer.classList.add('hidden');
    return;
  }

  if (dropZone) dropZone.classList.add('hidden');
  viewerContainer.classList.remove('hidden');

  await renderCurrentPage(doc);
  renderThumbnails(doc);
  updatePageIndicator(doc);
}

async function renderCurrentPage(doc: Document): Promise<void> {
  const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement;
  if (!canvas || !doc.pdfJsDoc) return;

  try {
    const page = await doc.pdfJsDoc.getPage(doc.currentPage);
    const viewport = page.getViewport({ scale: currentZoom * 1.5 }); // 1.5 base scale for clarity

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cancel any previous render task to avoid "same canvas" errors
    try {
      if (currentRenderTask && typeof currentRenderTask.cancel === 'function') {
        currentRenderTask.cancel();
      }
    } catch (e) {
      // ignore cancellation errors
    }

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    } as any);

    currentRenderTask = renderTask;
    try {
      await renderTask.promise;
    } catch (err) {
      // pdf.js throws when a render is cancelled — ignore this as it's expected
      if (!/cancel/i.test(String(err))) {
        throw err;
      }
    } finally {
      // clear the reference when done
      currentRenderTask = null;
    }
  } catch (error) {
    console.error('Error rendering page:', error);
  }
}

export function clearViewer(): void {
  const viewerContainer = document.getElementById('pdf-viewer');
  const dropZone = document.getElementById('drop-zone');
  const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement;
  const thumbsContainer = document.getElementById('thumbnails');

  if (dropZone) dropZone.classList.remove('hidden');
  if (viewerContainer) viewerContainer.classList.add('hidden');

  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    try {
      if (currentRenderTask && typeof currentRenderTask.cancel === 'function') {
        currentRenderTask.cancel();
      }
    } catch (e) {
      // ignore
    }
  }

  if (thumbsContainer) {
    thumbsContainer.innerHTML = '';
  }
}

// ============================================================================
// Thumbnails
// ============================================================================

async function renderThumbnails(doc: Document): Promise<void> {
  const container = document.getElementById('thumbnails');
  if (!container || !doc.pdfJsDoc) return;

  container.innerHTML = '';
  const pageCount = doc.pdfJsDoc.numPages;

  for (let i = 1; i <= pageCount; i++) {
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = `thumbnail-item p-1 cursor-pointer rounded transition-all
      ${i === doc.currentPage ? 'ring-2 ring-indigo-500 bg-gray-700' : 'hover:bg-gray-700/50'}`;
    thumbWrapper.dataset.page = String(i);

    const pageNum = document.createElement('div');
    pageNum.className = 'text-[10px] text-gray-400 text-center mb-1';
    pageNum.textContent = String(i);

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'w-full rounded';

    thumbWrapper.append(pageNum, thumbCanvas);
    container.appendChild(thumbWrapper);

    // Render thumbnail
    renderThumbnail(doc.pdfJsDoc, i, thumbCanvas);

    // Click handler
    thumbWrapper.addEventListener('click', () => {
      goToPage(i);
    });
  }
}

async function renderThumbnail(pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number, canvas: HTMLCanvasElement): Promise<void> {
  try {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.2 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Use a separate render for thumbnails; canceling main viewer render shouldn't affect thumbnails
      const thumbRender = page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      } as any);
      try {
        await thumbRender.promise;
      } catch (err) {
        if (!/cancel/i.test(String(err))) {
          throw err;
        }
      }
  } catch (error) {
    console.error(`Error rendering thumbnail ${pageNum}:`, error);
  }
}

function updateThumbnailSelection(pageNum: number): void {
  const container = document.getElementById('thumbnails');
  if (!container) return;

  container.querySelectorAll('.thumbnail-item').forEach((thumb) => {
    const thumbPage = parseInt((thumb as HTMLElement).dataset.page || '0');
    if (thumbPage === pageNum) {
      thumb.classList.add('ring-2', 'ring-indigo-500', 'bg-gray-700');
      thumb.classList.remove('hover:bg-gray-700/50');
      // Scroll into view
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      thumb.classList.remove('ring-2', 'ring-indigo-500', 'bg-gray-700');
      thumb.classList.add('hover:bg-gray-700/50');
    }
  });
}

// ============================================================================
// Navigation
// ============================================================================

export async function goToPage(pageNum: number): Promise<void> {
  const doc = getActiveDocument();
  if (!doc || !doc.pdfJsDoc) return;

  const maxPage = doc.pdfJsDoc.numPages;
  pageNum = Math.max(1, Math.min(pageNum, maxPage));

  if (pageNum !== doc.currentPage) {
    doc.currentPage = pageNum;
    await renderCurrentPage(doc);
    updateThumbnailSelection(pageNum);
    updatePageIndicator(doc);
  }
}

export async function nextPage(): Promise<void> {
  const doc = getActiveDocument();
  if (doc) {
    await goToPage(doc.currentPage + 1);
  }
}

export async function prevPage(): Promise<void> {
  const doc = getActiveDocument();
  if (doc) {
    await goToPage(doc.currentPage - 1);
  }
}

function updatePageIndicator(doc: Document): void {
  const indicator = document.getElementById('page-indicator');
  if (indicator && doc.pdfJsDoc) {
    indicator.textContent = `${doc.currentPage} / ${doc.pdfJsDoc.numPages}`;
  }
}

// ============================================================================
// Zoom Controls
// ============================================================================

export async function zoomIn(): Promise<void> {
  if (currentZoom < MAX_ZOOM) {
    currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
    await refreshCurrentPage();
    updateZoomIndicator();
  }
}

export async function zoomOut(): Promise<void> {
  if (currentZoom > MIN_ZOOM) {
    currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
    await refreshCurrentPage();
    updateZoomIndicator();
  }
}

export async function fitToPage(): Promise<void> {
  const viewerArea = document.getElementById('viewer-area');
  const doc = getActiveDocument();

  if (!viewerArea || !doc?.pdfJsDoc) return;

  try {
    const page = await doc.pdfJsDoc.getPage(doc.currentPage);
    const viewport = page.getViewport({ scale: 1 });

    const containerWidth = viewerArea.clientWidth - 40; // padding
    const containerHeight = viewerArea.clientHeight - 40;

    const scaleX = containerWidth / viewport.width;
    const scaleY = containerHeight / viewport.height;

    currentZoom = Math.min(scaleX, scaleY) / 1.5; // Divide by base scale
    currentZoom = Math.max(MIN_ZOOM, Math.min(currentZoom, MAX_ZOOM));

    await refreshCurrentPage();
    updateZoomIndicator();
  } catch (error) {
    console.error('Error fitting to page:', error);
  }
}

async function refreshCurrentPage(): Promise<void> {
  const doc = getActiveDocument();
  if (doc) {
    await renderCurrentPage(doc);
  }
}

function updateZoomIndicator(): void {
  const indicator = document.getElementById('zoom-indicator');
  if (indicator) {
    indicator.textContent = `${Math.round(currentZoom * 100)}%`;
  }
}

// ============================================================================
// Thumbnail Panel Toggle
// ============================================================================

export function toggleThumbnails(): void {
  const panel = document.getElementById('thumbnails-panel');
  if (panel) {
    isThumbsVisible = !isThumbsVisible;
    panel.classList.toggle('hidden', !isThumbsVisible);

    // Update toggle button icon
    const toggleBtn = document.getElementById('toggle-thumbnails-btn');
    if (toggleBtn) {
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', isThumbsVisible ? 'panel-left-close' : 'panel-left-open');
        createIcons({ icons });
      }
    }
  }
}

// ============================================================================
// Initialization
// ============================================================================

export function initViewer(): void {
  // Setup keyboard navigation
  document.addEventListener('keydown', async (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const doc = getActiveDocument();
    if (!doc) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        await prevPage();
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        await nextPage();
        break;
      case 'Home':
        e.preventDefault();
        await goToPage(1);
        break;
      case 'End':
        if (doc.pdfJsDoc) {
          e.preventDefault();
          await goToPage(doc.pdfJsDoc.numPages);
        }
        break;
      case '+':
      case '=':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          await zoomIn();
        }
        break;
      case '-':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          await zoomOut();
        }
        break;
      case '0':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          await fitToPage();
        }
        break;
    }
  });

  // Setup scroll zoom
  const viewerArea = document.getElementById('viewer-area');
  if (viewerArea) {
    viewerArea.addEventListener('wheel', async (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          await zoomIn();
        } else {
          await zoomOut();
        }
      }
    }, { passive: false });
  }

  // Initial state
  updateZoomIndicator();
}

// ============================================================================
// Export for external use
// ============================================================================

export function getZoom(): number {
  return currentZoom;
}

export function setZoom(zoom: number): void {
  currentZoom = Math.max(MIN_ZOOM, Math.min(zoom, MAX_ZOOM));
  refreshCurrentPage();
  updateZoomIndicator();
}
