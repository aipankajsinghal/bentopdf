// BentoPDF - File-First PDF Editor
// Main entry point with Office-style ribbon UI
import { createIcons, icons } from 'lucide';
import { pdfjsLib } from './utils/pdfjs-init.js';
import { aiClient } from './ai/ai-client.js';
import { aiPanel } from './ui/aiPanel.js';
import { batchModal } from './ui/batchProcessModal.js';
import { annotationLayer } from './logic/annotationLayer.js';
import { initContextMenu } from './ui/contextMenu.js';
import '../css/styles.css';

import { initRibbon, registerToolHandler, updateToolStates, setDocumentStateCallbacks, toggleRibbonExpanded } from './ribbon.js';
import {
  initDocumentManager,
  openDocument,
  getActiveDocument,
  hasAnyDocument,
  downloadActiveDocument,
  undo,
  redo,
  setDocumentManagerCallbacks,
  closeActiveDocument,
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
  resetViewerZoom,
} from './viewer.js';
import { setProcessing, selectAllPages, clearPageSelection } from './state.js';
import {
  isTauri,
  initTauriIntegrations,
  openPdfDialog,
  savePdf,
  readFile,
  setCurrentFilePath,
  getFileName,
  showMessage,
} from './tauri-api.js';

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
  const pdfFiles = files.filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );

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

/**
 * Open files using Tauri native dialog (desktop app)
 */
async function openFilesNative(): Promise<void> {
  if (!isTauri()) {
    // Fallback to regular file input
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    fileInput?.click();
    return;
  }

  const paths = await openPdfDialog();
  if (!paths || paths.length === 0) return;

  setProcessing(true);

  try {
    for (const path of paths) {
      const bytes = await readFile(path);
      if (bytes) {
        const fileName = getFileName(path);
        const file = new File([new Uint8Array(bytes)], fileName, { type: 'application/pdf' });
        await openDocument(file);
        // Track the file path for "Save" functionality
        setCurrentFilePath(path);
      }
    }
    showViewerToolbar();
  } catch (error) {
    console.error('Error opening PDF:', error);
    showAlert('Error', 'Failed to open PDF file.');
  } finally {
    setProcessing(false);
  }
}

/**
 * Open files from native file drop (Tauri desktop)
 */
async function handleNativeFileDrop(paths: string[]): Promise<void> {
  setProcessing(true);

  try {
    for (const path of paths) {
      const bytes = await readFile(path);
      if (bytes) {
        const fileName = getFileName(path);
        const file = new File([new Uint8Array(bytes)], fileName, { type: 'application/pdf' });
        await openDocument(file);
        setCurrentFilePath(path);
      }
    }
    showViewerToolbar();
  } catch (error) {
    console.error('Error opening dropped PDF:', error);
    showAlert('Error', 'Failed to open dropped PDF file.');
  } finally {
    setProcessing(false);
  }
}

/**
 * Save the active document (Tauri native save)
 */
async function saveActiveDocument(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  if (isTauri()) {
    const result = await savePdf(doc.pdfBytes, doc.fileName, false);
    if (result.success && result.path) {
      await showMessage('Saved', `File saved to:\n${result.path}`, 'info');
    }
  } else {
    // Fallback to browser download
    downloadActiveDocument();
  }
}

/**
 * Save As - always show dialog
 */
async function saveAsDocument(): Promise<void> {
  const doc = getActiveDocument();
  if (!doc) return;

  if (isTauri()) {
    const result = await savePdf(doc.pdfBytes, doc.fileName, true);
    if (result.success && result.path) {
      await showMessage('Saved', `File saved to:\n${result.path}`, 'info');
    }
  } else {
    downloadActiveDocument();
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
  // File operations - use native dialog in Tauri
  registerToolHandler('open-file', openFilesNative);

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

  registerToolHandler('fit-page', fitToPage);

  registerToolHandler('fit-page', fitToPage);

  // Drawing Tools
  registerToolHandler('draw-pen', () => annotationLayer.setTool('pen'));
  registerToolHandler('draw-highlight', () => annotationLayer.setTool('highlight'));
  registerToolHandler('draw-rect', () => annotationLayer.setTool('rectangle'));
  registerToolHandler('draw-circle', () => annotationLayer.setTool('circle'));
  registerToolHandler('draw-eraser', () => annotationLayer.setTool('eraser'));
  registerToolHandler('draw-color', () => {
     // Simple prompt for now, proper picker in v2
     const color = prompt("Enter color (hex or name):", "#ff0000");
     if (color) annotationLayer.setColor(color);
  });

  // AI Tools
  registerToolHandler('ai-panel-toggle', () => aiPanel.toggle());
  registerToolHandler('ai-ocr', () => {
    aiPanel.toggle(true);
    // Auto-trigger OCR if exposed or just open panel
    // The panel has buttons, let's just open the panel for now
    // Or we could trigger the method via a public API on aiPanel?
    // Let's assume user clicks the button in the panel.
  });
  registerToolHandler('ai-translate', () => {
    aiPanel.toggle(true);
    // Focus translation section
  });
  registerToolHandler('ai-summarize', () => {
     aiPanel.toggle(true);
  });
  registerToolHandler('ai-batch', () => {
      batchModal.open();
  });

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

  // Automated tool registration for standard operations
  const standardOperations: Record<string, string> = {
    'split-pdf': 'Split PDF',
    'extract-pages': 'Extract Pages',
    'delete-pages': 'Delete Pages',
    'rotate-left': 'Rotate Left',
    'rotate-right': 'Rotate Right',
    'rotate-180': 'Rotate 180°',
    'reverse-pages': 'Reverse Pages',
    'reorder': 'Reorder Pages',
    'duplicate': 'Duplicate Pages',
    'add-blank': 'Add Blank Page',
    'crop': 'Crop',
    'n-up': 'N-Up',
    'divide': 'Divide Pages',
    'combine-single': 'Combine to Single',
    'add-text': 'Add Text',
    'sign': 'Sign PDF',
    'stamps': 'Add Stamps',
    'watermark': 'Watermark',
    'page-numbers': 'Page Numbers',
    'header-footer': 'Header/Footer',
    'bookmarks': 'Bookmarks',
    'toc': 'Table of Contents',
    'fill-form': 'Fill Form',
    'create-form': 'Create Form',
    'invert-colors': 'Invert Colors',
    'background-color': 'Background Color',
    'text-color': 'Text Color',
    'greyscale': 'Greyscale',
    'remove-annotations': 'Remove Annotations',
    'remove-blank-pages': 'Remove Blank Pages',
    'image-to-pdf': 'Image to PDF',
    'jpg-to-pdf': 'JPG to PDF',
    'png-to-pdf': 'PNG to PDF',
    'webp-to-pdf': 'WebP to PDF',
    'svg-to-pdf': 'SVG to PDF',
    'bmp-to-pdf': 'BMP to PDF',
    'heic-to-pdf': 'HEIC to PDF',
    'tiff-to-pdf': 'TIFF to PDF',
    'text-to-pdf': 'Text to PDF',
    'json-to-pdf': 'JSON to PDF',
    'pdf-to-jpg': 'PDF to JPG',
    'pdf-to-png': 'PDF to PNG',
    'pdf-to-webp': 'PDF to WebP',
    'pdf-to-bmp': 'PDF to BMP',
    'pdf-to-tiff': 'PDF to TIFF',
    'pdf-to-json': 'PDF to JSON',
    'ocr': 'OCR',
    'encrypt': 'Encrypt',
    'decrypt': 'Decrypt',
    'permissions': 'Permissions',
    'remove-restrictions': 'Remove Restrictions',
    'sanitize': 'Sanitize',
    'remove-metadata': 'Remove Metadata',
    'redact': 'Redact',
    'flatten': 'Flatten',
    'compress': 'Compress',
    'linearize': 'Linearize',
    'fix-size': 'Fix Page Size',
    'repair': 'Repair',
    'add-attachments': 'Add Attachments',
    'extract-attachments': 'Extract Attachments',
    'edit-attachments': 'Edit Attachments',
    'metadata': 'Metadata',
    'dimensions': 'Page Dimensions',
    'compare': 'Compare PDFs',
    'copy-pages': 'Copy Pages',
    'cut-pages': 'Cut Pages',
    'paste-pages': 'Paste Pages'
  };

  Object.entries(standardOperations).forEach(([id, name]) => {
    registerToolHandler(id, () => callToolOp(id, name));
  });
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
    thumbsToggle.addEventListener('change', () => {
      toggleThumbnails();
    });
  }

  // API Key handling
  const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
  const saveKeyBtn = document.getElementById('save-api-key-btn');
  const keyStatus = document.getElementById('api-key-status');

  if (apiKeyInput && saveKeyBtn) {
    // Load existing key
    if (aiClient.hasKey()) {
      apiKeyInput.value = aiClient.getApiKey();
    }

    saveKeyBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (key) {
        aiClient.setApiKey(key);
        if (keyStatus) {
          keyStatus.textContent = 'Key saved!';
          keyStatus.classList.remove('hidden');
          setTimeout(() => keyStatus.classList.add('hidden'), 2000);
        }
      }
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

    // Ctrl/Cmd + C - Copy pages
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'c') {
      if (getActiveDocument()) {
        e.preventDefault();
        await toolOps.copyPages?.();
      }
      return;
    }

    // Ctrl/Cmd + X - Cut pages
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'x') {
      if (getActiveDocument()) {
        e.preventDefault();
        await toolOps.cutPages?.();
      }
      return;
    }

    // Ctrl/Cmd + V - Paste pages
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'v') {
      if (getActiveDocument()) {
        e.preventDefault();
        await toolOps.pastePages?.();
      }
      return;
    }
  });
}

// ============================================================================
// Initialization
// ============================================================================

const init = async () => {
  // Initialize PDF.js worker

  // Wire up callbacks to avoid circular dependencies
  setDocumentStateCallbacks(hasAnyDocument, getActiveDocument);
  setDocumentManagerCallbacks(updateToolStates, refreshViewer, clearViewer, async () => {
    // Reset zoom involves async operations (fitToPage), so we wrap it
    // But since callback is void, we just call it.
    // Actually viewer.ts exports resetViewerZoom, so we use that.
    // We use the statically imported resetViewerZoom
    resetViewerZoom();
  });

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

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Inject AI Panel
  const viewerArea = document.getElementById('viewer-area');
  // We want to inject it alongside the PDF viewer, maybe as a right sidebar?
  // Let's modify the DOM structure slightly in index.html or just append and use absolute/flex?
  // The 'viewer-area' is a flexbox? 
  // Let's look at index.html: <div class="flex flex-1 overflow-hidden min-h-0"> ... <div id="viewer-area"> ...
  // We should append the AI panel to the parent of `viewer-area` so it sits side-by-side
  
  // Actually, let's append it to `document.body` or specialized container?
  // Our AIPanel code creates a div with class "w-80 ... flex flex-col hidden"
  // If we append it to the main flex container, it will take space when visible.
  
  const mainFlex = document.querySelector('.flex.flex-1.overflow-hidden.min-h-0');
  if (mainFlex) {
      mainFlex.appendChild(aiPanel.getContainer());
  }

  // Initialize Tauri integrations (native menu, file drop, etc.)
  if (isTauri()) {
    await initTauriIntegrations({
      onOpen: openFilesNative,
      onSave: saveActiveDocument,
      onSaveAs: saveAsDocument,
      onExport: downloadActiveDocument,
      onCloseDoc: () => {
        if (typeof closeActiveDocument === 'function') {
          closeActiveDocument();
        }
      },
      onUndo: () => undo(),
      onRedo: () => redo(),
      onCopyPages: () => toolOps.copyPages?.(),
      onCutPages: () => toolOps.cutPages?.(),
      onPastePages: () => toolOps.pastePages?.(),
      onSelectAll: () => {
        const doc = getActiveDocument();
        if (doc && typeof selectAllPages === 'function') {
          selectAllPages(doc.pageData?.length || 1);
        }
      },
      onDeselect: () => {
        if (typeof clearPageSelection === 'function') {
          clearPageSelection();
        }
      },
      onZoomIn: zoomIn,
      onZoomOut: zoomOut,
      onFitPage: fitToPage,
      onToggleThumbnails: toggleThumbnails,
      onToggleRibbon: () => {
        if (typeof toggleRibbonExpanded === 'function') {
          toggleRibbonExpanded();
        }
      },
      onRotateLeft: () => toolOps.rotateLeft?.(),
      onRotateRight: () => toolOps.rotateRight?.(),
      onAddBlank: () => toolOps.addBlankPage?.(),
      onDeletePages: () => toolOps.deletePages?.(),
      onCompress: () => toolOps.compress?.(),
      onOcr: () => toolOps.ocr?.(),
      onAbout: () => showAlert('About BentoPDF', 'BentoPDF v1.11.2\n\nA powerful PDF toolkit for editing, converting, and managing PDF documents.\n\nhttps://bentopdf.com'),
      onShortcuts: () => {
        const shortcuts = `Keyboard Shortcuts:

Ctrl+O - Open PDF
Ctrl+S - Save
Ctrl+Shift+S - Save As
Ctrl+Z - Undo
Ctrl+Shift+Z - Redo
Ctrl+C - Copy Pages
Ctrl+X - Cut Pages
Ctrl+V - Paste Pages
Ctrl+A - Select All Pages
Escape - Deselect All
Ctrl+Plus - Zoom In
Ctrl+Minus - Zoom Out
Ctrl+0 - Fit to Page
Ctrl+T - Toggle Thumbnails
Ctrl+F1 - Toggle Ribbon Labels
Ctrl+Left - Rotate Left
Ctrl+Right - Rotate Right
Ctrl+N - Add Blank Page
Delete - Delete Selected Pages`;
        showAlert('Keyboard Shortcuts', shortcuts);
      },
      onFileDrop: handleNativeFileDrop,
    });
    console.log('BentoPDF initialized - Desktop Edition (Tauri)');
  } else {
    console.log('BentoPDF initialized - Web Edition');
  }

  // Initialize icons
  createIcons({ icons });
};

window.addEventListener('load', init);
