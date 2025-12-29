// BentoPDF - File-First PDF Editor
// Main entry point with Office-style ribbon UI
import { createIcons, icons } from 'lucide';
import * as pdfjsLib from 'pdfjs-dist';
import '../css/styles.css';

import { initRibbon, registerToolHandler, updateToolStates, setDocumentStateCallbacks } from './ribbon.js';
import {
  initDocumentManager,
  openDocument,
  getActiveDocument,
  hasAnyDocument,
  downloadActiveDocument,
  undo,
  redo,
  setDocumentManagerCallbacks,
} from './documentManager.js';
import * as toolOps from './toolOperations.js';
import {
  initViewer,
  refreshViewer,
  clearViewer,
  zoomIn,
  zoomOut,
  fitToPage,
  nextPage,
  prevPage,
  toggleThumbnails,
} from './viewer.js';
import { setProcessing } from './state.js';

// ============================================================================
// Drop Zone Setup
// ============================================================================

function setupDropZone(): void {
  const dropZone = document.getElementById('drop-zone');
  const dropZoneInner = document.getElementById('drop-zone-inner');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  if (!dropZone || !dropZoneInner || !fileInput) return;

  // Click to open file dialog
  dropZoneInner.addEventListener('click', () => {
    fileInput.click();
  });

  // File input change
  fileInput.addEventListener('change', async () => {
    const files = fileInput.files;
    if (files && files.length > 0) {
      await handleFiles(Array.from(files));
      fileInput.value = ''; // Reset for next selection
    }
  });

  // Drag and drop
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneInner.classList.add('border-indigo-500', 'bg-gray-800/50');
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneInner.classList.remove('border-indigo-500', 'bg-gray-800/50');
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneInner.classList.remove('border-indigo-500', 'bg-gray-800/50');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleFiles(Array.from(files));
    }
  };

  dropZone.addEventListener('dragover', handleDragOver);
  dropZone.addEventListener('dragleave', handleDragLeave);
  dropZone.addEventListener('drop', handleDrop);

  // Also handle drop on the entire viewer area
  const viewerArea = document.getElementById('viewer-area');
  if (viewerArea) {
    viewerArea.addEventListener('dragover', handleDragOver);
    viewerArea.addEventListener('dragleave', handleDragLeave);
    viewerArea.addEventListener('drop', handleDrop);
  }
}

async function handleFiles(files: File[]): Promise<void> {
  const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

  if (pdfFiles.length === 0) {
    showAlert('Invalid File', 'Please select a PDF file.');
    return;
  }

  setProcessing(true);

  try {
    for (const file of pdfFiles) {
      await openDocument(file);
    }
    showViewerToolbar();
  } catch (error) {
    console.error('Error opening PDF:', error);
    showAlert('Error', 'Failed to open PDF file. The file may be corrupted or password-protected.');
  } finally {
    setProcessing(false);
  }
}

function showViewerToolbar(): void {
  const toolbar = document.getElementById('viewer-toolbar');
  if (toolbar) {
    toolbar.classList.remove('hidden');
    toolbar.classList.add('flex');
  }
}

// ============================================================================
// Viewer Toolbar Setup
// ============================================================================

function setupViewerToolbar(): void {
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const fitBtn = document.getElementById('fit-page-btn');
  const downloadBtn = document.getElementById('download-btn');
  const toggleThumbsBtn = document.getElementById('toggle-thumbnails-btn');

  prevBtn?.addEventListener('click', prevPage);
  nextBtn?.addEventListener('click', nextPage);
  zoomInBtn?.addEventListener('click', zoomIn);
  zoomOutBtn?.addEventListener('click', zoomOut);
  fitBtn?.addEventListener('click', fitToPage);
  downloadBtn?.addEventListener('click', downloadActiveDocument);
  toggleThumbsBtn?.addEventListener('click', toggleThumbnails);
}

// ============================================================================
// Tool Handlers Registration
// ============================================================================

function registerToolHandlers(): void {
  // File operations
  registerToolHandler('open-file', () => {
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    fileInput?.click();
  });

  registerToolHandler('download', downloadActiveDocument);
  registerToolHandler('add-pdf', () => {
    // Open file dialog for adding another PDF; if a doc is active, merge, otherwise open
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return;
      const files = Array.from(input.files);
      const active = getActiveDocument();
      if (active && typeof (toolOps as any).mergeFiles === 'function') {
        await (toolOps as any).mergeFiles(files);
      } else {
        await handleFiles(files);
      }
    };
    input.click();
  });

  // Undo/Redo
  registerToolHandler('undo', async () => {
    await undo();
  });

  registerToolHandler('redo', async () => {
    await redo();
  });

  // Zoom controls
  registerToolHandler('zoom-in', zoomIn);
  registerToolHandler('zoom-out', zoomOut);
  registerToolHandler('fit-page', fitToPage);

  // Page operations - wired to toolOperations where available
  const toolOpAliases: Record<string, string> = {
    'split-pdf': 'splitPDF',
    'add-blank': 'addBlankPage',
  };

  const callToolOp = (opId: string, displayName: string) => {
    const mapped = toolOpAliases[opId];
    const fnName = mapped || opId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const fn = (toolOps as any)[fnName] || (toolOps as any)[opId];
    if (typeof fn === 'function') return fn();
    return showToolNotImplemented(displayName);
  };

  registerToolHandler('split-pdf', () => callToolOp('split-pdf', 'Split PDF'));
  registerToolHandler('extract-pages', () => callToolOp('extract-pages', 'Extract Pages'));
  registerToolHandler('delete-pages', () => callToolOp('delete-pages', 'Delete Pages'));
  registerToolHandler('rotate-left', () => callToolOp('rotate-left', 'Rotate Left'));
  registerToolHandler('rotate-right', () => callToolOp('rotate-right', 'Rotate Right'));
  registerToolHandler('rotate-180', () => callToolOp('rotate-180', 'Rotate 180°'));
  registerToolHandler('reverse-pages', () => callToolOp('reverse-pages', 'Reverse Pages'));
  registerToolHandler('reorder', () => callToolOp('reorder', 'Reorder Pages'));
  registerToolHandler('duplicate', () => callToolOp('duplicate', 'Duplicate Pages'));
  registerToolHandler('add-blank', () => callToolOp('add-blank', 'Add Blank Page'));
  registerToolHandler('crop', () => callToolOp('crop', 'Crop'));
  registerToolHandler('n-up', () => callToolOp('n-up', 'N-Up'));
  registerToolHandler('divide', () => callToolOp('divide', 'Divide Pages'));
  registerToolHandler('combine-single', () => callToolOp('combine-single', 'Combine to Single'));

  // Edit tools
  registerToolHandler('annotate', () => callToolOp('annotate', 'Annotate'));
  registerToolHandler('sign', () => callToolOp('sign', 'Sign PDF'));
  registerToolHandler('stamps', () => callToolOp('stamps', 'Add Stamps'));
  registerToolHandler('watermark', () => callToolOp('watermark', 'Watermark'));
  registerToolHandler('page-numbers', () => callToolOp('page-numbers', 'Page Numbers'));
  registerToolHandler('header-footer', () => callToolOp('header-footer', 'Header/Footer'));
  registerToolHandler('bookmarks', () => callToolOp('bookmarks', 'Bookmarks'));
  registerToolHandler('toc', () => callToolOp('toc', 'Table of Contents'));
  registerToolHandler('fill-form', () => callToolOp('fill-form', 'Fill Form'));
  registerToolHandler('create-form', () => callToolOp('create-form', 'Create Form'));

  // Color operations
  registerToolHandler('invert-colors', () => callToolOp('invert-colors', 'Invert Colors'));
  registerToolHandler('background-color', () => callToolOp('background-color', 'Background Color'));
  registerToolHandler('text-color', () => callToolOp('text-color', 'Text Color'));
  registerToolHandler('greyscale', () => callToolOp('greyscale', 'Greyscale'));

  // Cleanup
  registerToolHandler('remove-annotations', () => callToolOp('remove-annotations', 'Remove Annotations'));
  registerToolHandler('remove-blank-pages', () => callToolOp('remove-blank-pages', 'Remove Blank Pages'));

  // Convert to PDF
  registerToolHandler('image-to-pdf', () => callToolOp('image-to-pdf', 'Image to PDF'));
  registerToolHandler('jpg-to-pdf', () => callToolOp('jpg-to-pdf', 'JPG to PDF'));
  registerToolHandler('png-to-pdf', () => callToolOp('png-to-pdf', 'PNG to PDF'));
  registerToolHandler('webp-to-pdf', () => callToolOp('webp-to-pdf', 'WebP to PDF'));
  registerToolHandler('svg-to-pdf', () => callToolOp('svg-to-pdf', 'SVG to PDF'));
  registerToolHandler('bmp-to-pdf', () => callToolOp('bmp-to-pdf', 'BMP to PDF'));
  registerToolHandler('heic-to-pdf', () => callToolOp('heic-to-pdf', 'HEIC to PDF'));
  registerToolHandler('tiff-to-pdf', () => callToolOp('tiff-to-pdf', 'TIFF to PDF'));
  registerToolHandler('text-to-pdf', () => callToolOp('text-to-pdf', 'Text to PDF'));
  registerToolHandler('json-to-pdf', () => callToolOp('json-to-pdf', 'JSON to PDF'));

  // Convert from PDF
  registerToolHandler('pdf-to-jpg', () => callToolOp('pdf-to-jpg', 'PDF to JPG'));
  registerToolHandler('pdf-to-png', () => callToolOp('pdf-to-png', 'PDF to PNG'));
  registerToolHandler('pdf-to-webp', () => callToolOp('pdf-to-webp', 'PDF to WebP'));
  registerToolHandler('pdf-to-bmp', () => callToolOp('pdf-to-bmp', 'PDF to BMP'));
  registerToolHandler('pdf-to-tiff', () => callToolOp('pdf-to-tiff', 'PDF to TIFF'));
  registerToolHandler('pdf-to-json', () => callToolOp('pdf-to-json', 'PDF to JSON'));
  registerToolHandler('ocr', () => callToolOp('ocr', 'OCR'));

  // Security
  registerToolHandler('encrypt', () => callToolOp('encrypt', 'Encrypt'));
  registerToolHandler('decrypt', () => callToolOp('decrypt', 'Decrypt'));
  registerToolHandler('permissions', () => callToolOp('permissions', 'Permissions'));
  registerToolHandler('remove-restrictions', () => callToolOp('remove-restrictions', 'Remove Restrictions'));
  registerToolHandler('sanitize', () => callToolOp('sanitize', 'Sanitize'));
  registerToolHandler('remove-metadata', () => callToolOp('remove-metadata', 'Remove Metadata'));
  registerToolHandler('flatten', () => callToolOp('flatten', 'Flatten'));

  // Tools
  registerToolHandler('compress', () => callToolOp('compress', 'Compress'));
  registerToolHandler('linearize', () => callToolOp('linearize', 'Linearize'));
  registerToolHandler('fix-size', () => callToolOp('fix-size', 'Fix Page Size'));
  registerToolHandler('repair', () => callToolOp('repair', 'Repair'));
  registerToolHandler('add-attachments', () => callToolOp('add-attachments', 'Add Attachments'));
  registerToolHandler('extract-attachments', () => callToolOp('extract-attachments', 'Extract Attachments'));
  registerToolHandler('edit-attachments', () => callToolOp('edit-attachments', 'Edit Attachments'));
  registerToolHandler('metadata', () => callToolOp('metadata', 'Metadata'));
  registerToolHandler('dimensions', () => callToolOp('dimensions', 'Page Dimensions'));
  registerToolHandler('compare', () => callToolOp('compare', 'Compare PDFs'));
}

function showToolNotImplemented(toolName: string): void {
  showAlert('Coming Soon', `The "${toolName}" tool will be implemented in the next phase of development.`);
}

// ============================================================================
// Settings Modal
// ============================================================================

function setupSettingsModal(): void {
  const settingsBtn = document.getElementById('settings-btn');
  const closeBtn = document.getElementById('close-settings-modal');
  const modal = document.getElementById('settings-modal');

  if (!settingsBtn || !closeBtn || !modal) return;

  settingsBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  // Ribbon expanded toggle
  const ribbonToggle = document.getElementById('ribbon-expanded-toggle') as HTMLInputElement;
  if (ribbonToggle) {
    ribbonToggle.checked = localStorage.getItem('ribbon-expanded') === 'true';
    ribbonToggle.addEventListener('change', (e) => {
      const expanded = (e.target as HTMLInputElement).checked;
      localStorage.setItem('ribbon-expanded', expanded.toString());
      // Re-render ribbon
      initRibbon();
    });
  }

  // Thumbnails toggle
  const thumbsToggle = document.getElementById('show-thumbnails-toggle') as HTMLInputElement;
  if (thumbsToggle) {
    thumbsToggle.addEventListener('change', () => {
      toggleThumbnails();
    });
  }
}

// ============================================================================
// Alert Modal
// ============================================================================

function showAlert(title: string, message: string): void {
  const modal = document.getElementById('alert-modal');
  const titleEl = document.getElementById('alert-title');
  const messageEl = document.getElementById('alert-message');

  if (modal && titleEl && messageEl) {
    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.remove('hidden');
  }
}

// Bridge custom events from toolOperations to the built-in modal
window.addEventListener('bentopdf-show-alert', (e: any) => {
  const d = e?.detail || {};
  showAlert(d.title || 'Notice', d.message || '');
});

function setupAlertModal(): void {
  const modal = document.getElementById('alert-modal');
  const okBtn = document.getElementById('alert-ok');

  if (okBtn) {
    okBtn.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', async (e) => {
    // Skip if in input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const isMac = navigator.userAgent.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl/Cmd + O - Open file
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      fileInput?.click();
      return;
    }

    // Ctrl/Cmd + S - Download/Save
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (getActiveDocument()) {
        downloadActiveDocument();
      }
      return;
    }

    // Ctrl/Cmd + Z - Undo
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      await undo();
      return;
    }

    // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y - Redo
    if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      await redo();
      return;
    }
  });
}

// ============================================================================
// Initialization
// ============================================================================

const init = async () => {
  // Initialize PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  // Wire up callbacks to avoid circular dependencies
  setDocumentStateCallbacks(hasAnyDocument, getActiveDocument);
  setDocumentManagerCallbacks(updateToolStates, refreshViewer, clearViewer);

  // Register tool handlers before ribbon init
  registerToolHandlers();

  // Initialize ribbon UI
  initRibbon();

  // Initialize document manager
  initDocumentManager();

  // Initialize viewer
  initViewer();

  // Setup drop zone
  setupDropZone();

  // Setup viewer toolbar
  setupViewerToolbar();

  // Setup settings modal
  setupSettingsModal();

  // Setup alert modal
  setupAlertModal();

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Initialize icons
  createIcons({ icons });

  console.log('BentoPDF initialized - File-First Edition');
};

window.addEventListener('load', init);
