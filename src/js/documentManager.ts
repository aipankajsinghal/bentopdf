// Document Manager - Multi-document tabs with per-document undo/redo
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Callbacks to avoid circular dependencies
let updateToolStatesFn: () => void = () => {};
let refreshViewerFn: () => void = () => {};
let clearViewerFn: () => void = () => {};

export function setDocumentManagerCallbacks(
  updateToolStates: () => void,
  refreshViewer: () => void,
  clearViewer: () => void
): void {
  updateToolStatesFn = updateToolStates;
  refreshViewerFn = refreshViewer;
  clearViewerFn = clearViewer;
}

// ============================================================================
// Types
// ============================================================================

export interface PageData {
  id: string;
  pageIndex: number;
  rotation: number;
  deleted: boolean;
}

export interface DocumentSnapshot {
  pagesData: PageData[];
  pdfBytes: Uint8Array;
}

export interface Document {
  id: string;
  fileName: string;
  pdfBytes: Uint8Array;
  pdfDoc: PDFDocument | null;
  pdfJsDoc: pdfjsLib.PDFDocumentProxy | null;
  pageData: PageData[];
  undoStack: DocumentSnapshot[];
  redoStack: DocumentSnapshot[];
  isDirty: boolean;
  currentPage: number;
}

// ============================================================================
// State
// ============================================================================

const documents: Document[] = [];
let activeDocIndex = -1;
let tabIdCounter = 0;

// ============================================================================
// Document Operations
// ============================================================================

export async function openDocument(file: File): Promise<Document> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return createDocumentFromBytes(bytes, file.name);
}

export async function createDocumentFromBytes(bytes: Uint8Array, fileName: string): Promise<Document> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pdfJsDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;

  const pageCount = pdfDoc.getPageCount();
  const pageData: PageData[] = [];
  for (let i = 0; i < pageCount; i++) {
    pageData.push({
      id: `page-${tabIdCounter}-${i}`,
      pageIndex: i,
      rotation: 0,
      deleted: false,
    });
  }

  const doc: Document = {
    id: `doc-${++tabIdCounter}`,
    fileName,
    pdfBytes: bytes,
    pdfDoc,
    pdfJsDoc,
    pageData,
    undoStack: [],
    redoStack: [],
    isDirty: false,
    currentPage: 1,
  };

  documents.push(doc);
  activeDocIndex = documents.length - 1;

  renderTabs();
  updateToolStatesFn();
  refreshViewerFn();

  return doc;
}

export function closeDocument(docId: string): boolean {
  const index = documents.findIndex(d => d.id === docId);
  if (index === -1) return false;

  const doc = documents[index];
  if (doc.isDirty) {
    // Will be handled by caller with confirmation
    return false;
  }

  // Cleanup
  doc.pdfJsDoc?.destroy();
  documents.splice(index, 1);

  // Adjust active index
  if (documents.length === 0) {
    activeDocIndex = -1;
    clearViewerFn();
  } else if (activeDocIndex >= documents.length) {
    activeDocIndex = documents.length - 1;
  } else if (activeDocIndex > index) {
    activeDocIndex--;
  }

  renderTabs();
  updateToolStatesFn();
  if (activeDocIndex >= 0) {
    refreshViewerFn();
  }

  return true;
}

export function forceCloseDocument(docId: string): void {
  const index = documents.findIndex(d => d.id === docId);
  if (index === -1) return;

  const doc = documents[index];
  doc.pdfJsDoc?.destroy();
  documents.splice(index, 1);

  if (documents.length === 0) {
    activeDocIndex = -1;
    clearViewerFn();
  } else if (activeDocIndex >= documents.length) {
    activeDocIndex = documents.length - 1;
  } else if (activeDocIndex > index) {
    activeDocIndex--;
  }

  renderTabs();
  updateToolStatesFn();
  if (activeDocIndex >= 0) {
    refreshViewerFn();
  }
}

export function switchToDocument(docId: string): void {
  const index = documents.findIndex(d => d.id === docId);
  if (index !== -1 && index !== activeDocIndex) {
    activeDocIndex = index;
    renderTabs();
    updateToolStatesFn();
    refreshViewerFn();
  }
}

export function getActiveDocument(): Document | null {
  return activeDocIndex >= 0 ? documents[activeDocIndex] : null;
}

export function getAllDocuments(): Document[] {
  return [...documents];
}

export function hasAnyDocument(): boolean {
  return documents.length > 0;
}

export function getActiveDocIndex(): number {
  return activeDocIndex;
}

// ============================================================================
// Undo/Redo
// ============================================================================

export function pushUndoState(doc: Document): void {
  const snapshot: DocumentSnapshot = {
    pagesData: JSON.parse(JSON.stringify(doc.pageData)),
    pdfBytes: new Uint8Array(doc.pdfBytes),
  };
  doc.undoStack.push(snapshot);
  doc.redoStack = []; // Clear redo on new action
  doc.isDirty = true;
  updateToolStatesFn();
  updateDirtyIndicators();
}

export async function undo(): Promise<boolean> {
  const doc = getActiveDocument();
  if (!doc || doc.undoStack.length === 0) return false;

  // Save current state to redo
  const currentSnapshot: DocumentSnapshot = {
    pagesData: JSON.parse(JSON.stringify(doc.pageData)),
    pdfBytes: doc.pdfBytes.slice(),
  };
  doc.redoStack.push(currentSnapshot);

  // Restore previous state
  const snapshot = doc.undoStack.pop()!;
  doc.pageData = snapshot.pagesData;
  doc.pdfBytes = snapshot.pdfBytes;
  doc.pdfDoc = await PDFDocument.load(snapshot.pdfBytes, { ignoreEncryption: true });
  doc.pdfJsDoc?.destroy();
  doc.pdfJsDoc = await pdfjsLib.getDocument({ data: snapshot.pdfBytes.slice() }).promise;

  updateToolStatesFn();
  refreshViewerFn();
  return true;
}

export async function redo(): Promise<boolean> {
  const doc = getActiveDocument();
  if (!doc || doc.redoStack.length === 0) return false;

  // Save current state to undo
  const currentSnapshot: DocumentSnapshot = {
    pagesData: JSON.parse(JSON.stringify(doc.pageData)),
    pdfBytes: doc.pdfBytes.slice(),
  };
  doc.undoStack.push(currentSnapshot);

  // Restore redo state
  const snapshot = doc.redoStack.pop()!;
  doc.pageData = snapshot.pagesData;
  doc.pdfBytes = snapshot.pdfBytes;
  doc.pdfDoc = await PDFDocument.load(snapshot.pdfBytes, { ignoreEncryption: true });
  doc.pdfJsDoc?.destroy();
  doc.pdfJsDoc = await pdfjsLib.getDocument({ data: snapshot.pdfBytes.slice() }).promise;

  updateToolStatesFn();
  refreshViewerFn();
  return true;
}

// ============================================================================
// Document Modification
// ============================================================================

export async function updateDocumentBytes(doc: Document, newBytes: Uint8Array): Promise<void> {
  pushUndoState(doc);

  doc.pdfBytes = newBytes;
  doc.pdfDoc = await PDFDocument.load(newBytes, { ignoreEncryption: true });
  doc.pdfJsDoc?.destroy();
  doc.pdfJsDoc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise;

  // Update page data if page count changed
  const newPageCount = doc.pdfDoc.getPageCount();
  if (newPageCount !== doc.pageData.filter(p => !p.deleted).length) {
    doc.pageData = [];
    for (let i = 0; i < newPageCount; i++) {
      doc.pageData.push({
        id: `page-${doc.id}-${i}-${Date.now()}`,
        pageIndex: i,
        rotation: 0,
        deleted: false,
      });
    }
  }

  refreshViewerFn();
}

export function markDocumentClean(doc: Document): void {
  doc.isDirty = false;
  updateDirtyIndicators();
}

// ============================================================================
// Download
// ============================================================================

export function downloadActiveDocument(): void {
  const doc = getActiveDocument();
  if (!doc) return;

  const blob = new Blob([new Uint8Array(doc.pdfBytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const sanitizedBase = doc.fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.pdf$/i, '')
    .trim();
  const reservedNames = new Set([
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ]);
  const safeBaseName = sanitizedBase && !reservedNames.has(sanitizedBase.toUpperCase())
    ? sanitizedBase
    : `document-${Date.now()}`;
  a.download = `${safeBaseName}_edited.pdf`;
  a.click();
  URL.revokeObjectURL(url);

  markDocumentClean(doc);
}

// ============================================================================
// Tabs UI
// ============================================================================

export function renderTabs(): void {
  const tabsContainer = document.getElementById('document-tabs');
  if (!tabsContainer) return;

  if (documents.length === 0) {
    tabsContainer.innerHTML = '';
    tabsContainer.classList.add('hidden');
    return;
  }

  tabsContainer.classList.remove('hidden');

  const fragment = document.createDocumentFragment();

  const createCloseIcon = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'w-3 h-3');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', 'M6 18L18 6M6 6l12 12');
    svg.appendChild(path);

    return svg;
  };

  const clearElement = (el: HTMLElement) => {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  };

  clearElement(tabsContainer);

  documents.forEach((doc, index) => {
    const tab = document.createElement('div');
    tab.className = `document-tab flex items-center gap-1 px-3 py-1.5 text-sm rounded-t cursor-pointer transition-colors ${
      index === activeDocIndex
        ? 'bg-gray-700 text-white'
        : 'bg-gray-800 text-gray-400 hover:bg-gray-700/50 hover:text-white'
    }`;
    tab.dataset.docId = doc.id;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'truncate max-w-[150px]';
    titleSpan.title = doc.fileName;
    titleSpan.textContent = doc.fileName;
    tab.appendChild(titleSpan);

    if (doc.isDirty) {
      const dirtyIndicator = document.createElement('span');
      dirtyIndicator.className = 'text-indigo-400 ml-1';
      dirtyIndicator.textContent = '•';
      tab.appendChild(dirtyIndicator);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close-btn p-0.5 rounded hover:bg-gray-600 ml-1';
    closeBtn.dataset.docId = doc.id;
    closeBtn.title = 'Close';
    closeBtn.appendChild(createCloseIcon());

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetDoc = documents.find(d => d.id === doc.id);
      if (targetDoc?.isDirty) {
        showCloseConfirmation(doc.id);
      } else {
        forceCloseDocument(doc.id);
      }
    });

    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.tab-close-btn')) return;
      switchToDocument(doc.id);
    });

    tab.appendChild(closeBtn);
    fragment.appendChild(tab);
  });

  tabsContainer.appendChild(fragment);
}

function updateDirtyIndicators(): void {
  const tabsContainer = document.getElementById('document-tabs');
  if (!tabsContainer) return;

  documents.forEach(doc => {
    const tab = tabsContainer.querySelector(`[data-doc-id="${doc.id}"]`);
    if (!tab) return;

    const dirtyIndicator = tab.querySelector('.text-indigo-400');
    if (doc.isDirty && !dirtyIndicator) {
      const span = tab.querySelector('.truncate');
      if (span) {
        const indicator = document.createElement('span');
        indicator.className = 'text-indigo-400 ml-1';
        indicator.textContent = '•';
        span.after(indicator);
      }
    } else if (!doc.isDirty && dirtyIndicator) {
      dirtyIndicator.remove();
    }
  });
}

function showCloseConfirmation(docId: string): void {
  const doc = documents.find(d => d.id === docId);
  if (!doc) return;

  const modal = document.getElementById('warning-modal');
  const title = document.getElementById('warning-title');
  const message = document.getElementById('warning-message');
  const confirmBtn = document.getElementById('warning-confirm-btn');
  const cancelBtn = document.getElementById('warning-cancel-btn');

  if (!modal || !title || !message || !confirmBtn || !cancelBtn) return;

  title.textContent = 'Unsaved Changes';
  message.textContent = `"${doc.fileName}" has unsaved changes. Close without saving?`;
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const handleConfirm = () => {
    forceCloseDocument(docId);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    cleanup();
  };

  const handleCancel = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    cleanup();
  };

  const cleanup = () => {
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', handleCancel);
  };

  confirmBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', handleCancel);
}

// ============================================================================
// Unsaved Changes Protection
// ============================================================================

export function setupBeforeUnloadProtection(): void {
  window.addEventListener('beforeunload', (e) => {
    const hasUnsaved = documents.some(d => d.isDirty);
    if (hasUnsaved) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    }
  });
}

// ============================================================================
// Initialization
// ============================================================================

export function initDocumentManager(): void {
  renderTabs();
  setupBeforeUnloadProtection();
}
