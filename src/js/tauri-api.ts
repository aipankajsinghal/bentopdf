/**
 * Tauri API wrapper for BentoPDF desktop features
 * Provides native file dialogs, file save, and menu handling
 */

// Check if running in Tauri
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// Lazy imports to avoid issues in web browser
let dialogModule: typeof import('@tauri-apps/plugin-dialog') | null = null;
let fsModule: typeof import('@tauri-apps/plugin-fs') | null = null;
let eventModule: typeof import('@tauri-apps/api/event') | null = null;
let windowModule: typeof import('@tauri-apps/api/window') | null = null;

async function getDialogModule() {
  if (!dialogModule && isTauri()) {
    dialogModule = await import('@tauri-apps/plugin-dialog');
  }
  return dialogModule;
}

async function getFsModule() {
  if (!fsModule && isTauri()) {
    fsModule = await import('@tauri-apps/plugin-fs');
  }
  return fsModule;
}

async function getEventModule() {
  if (!eventModule && isTauri()) {
    eventModule = await import('@tauri-apps/api/event');
  }
  return eventModule;
}

async function getWindowModule() {
  if (!windowModule && isTauri()) {
    windowModule = await import('@tauri-apps/api/window');
  }
  return windowModule;
}

/**
 * Open a native file dialog to select PDF files
 */
export async function openPdfDialog(): Promise<string[] | null> {
  if (!isTauri()) return null;

  const dialog = await getDialogModule();
  if (!dialog) return null;

  const result = await dialog.open({
    multiple: true,
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    title: 'Open PDF',
  });

  if (result === null) return null;

  // Handle single or multiple selection
  if (typeof result === 'string') {
    return [result];
  }

  return result as string[];
}

/**
 * Open a native file dialog to select image files
 */
export async function openImageDialog(): Promise<string[] | null> {
  if (!isTauri()) return null;

  const dialog = await getDialogModule();
  if (!dialog) return null;

  const result = await dialog.open({
    multiple: true,
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    title: 'Select Images',
  });

  if (result === null) return null;

  if (typeof result === 'string') {
    return [result];
  }

  return result as string[];
}

/**
 * Open a native save dialog
 */
export async function savePdfDialog(defaultName?: string): Promise<string | null> {
  if (!isTauri()) return null;

  const dialog = await getDialogModule();
  if (!dialog) return null;

  const result = await dialog.save({
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
    ],
    title: 'Save PDF',
    defaultPath: defaultName,
  });

  return result;
}

/**
 * Read a file from the filesystem
 */
export async function readFile(path: string): Promise<Uint8Array | null> {
  if (!isTauri()) return null;

  const fs = await getFsModule();
  if (!fs) return null;

  try {
    const contents = await fs.readFile(path);
    return contents;
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
}

/**
 * Write a file to the filesystem
 */
export async function writeFile(path: string, contents: Uint8Array): Promise<boolean> {
  if (!isTauri()) return false;

  const fs = await getFsModule();
  if (!fs) return false;

  try {
    await fs.writeFile(path, contents);
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    return false;
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  if (!isTauri()) return false;

  const fs = await getFsModule();
  if (!fs) return false;

  try {
    return await fs.exists(path);
  } catch {
    return false;
  }
}

/**
 * Show a native message dialog
 */
export async function showMessage(title: string, message: string, kind: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
  if (!isTauri()) {
    alert(`${title}\n\n${message}`);
    return;
  }

  const dialog = await getDialogModule();
  if (!dialog) {
    alert(`${title}\n\n${message}`);
    return;
  }

  await dialog.message(message, { title, kind });
}

/**
 * Show a native confirmation dialog
 */
export async function showConfirm(title: string, message: string): Promise<boolean> {
  if (!isTauri()) {
    return confirm(`${title}\n\n${message}`);
  }

  const dialog = await getDialogModule();
  if (!dialog) {
    return confirm(`${title}\n\n${message}`);
  }

  return await dialog.confirm(message, { title });
}

/**
 * Get the file name from a path
 */
export function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Listen to menu actions from native menu bar
 */
export async function onMenuAction(callback: (action: string) => void): Promise<(() => void) | null> {
  if (!isTauri()) return null;

  const event = await getEventModule();
  if (!event) return null;

  const unlisten = await event.listen<string>('menu-action', (e) => {
    callback(e.payload);
  });

  return unlisten;
}

/**
 * Listen to file drop events from native drag-drop
 */
export async function onFileDrop(callback: (paths: string[]) => void): Promise<(() => void) | null> {
  if (!isTauri()) return null;

  const event = await getEventModule();
  if (!event) return null;

  // In Tauri v2 the framework does not auto-emit 'tauri://drag-drop' to JS.
  // The Rust backend (lib.rs) handles WindowEvent::DragDrop and emits the
  // custom 'file-drop' event with paths already filtered to PDFs.
  const unlisten = await event.listen<string[]>('file-drop', (e) => {
    if (e.payload.length > 0) {
      callback(e.payload);
    }
  });

  return unlisten;
}

/**
 * Update the native window title bar (no-op in web mode).
 */
export async function setWindowTitle(title: string): Promise<void> {
  if (!isTauri()) return;
  const win = await getWindowModule();
  if (!win) return;
  try {
    const appWindow = win.getCurrentWindow();
    await appWindow.setTitle(title);
  } catch (e) {
    console.warn('[BentoPDF] setWindowTitle failed:', e);
  }
}

/**
 * Listen for drag-drop events where no PDF files were present.
 * The payload is an array of the rejected file names/paths.
 */
export async function onFileDropRejected(
  callback: (paths: string[]) => void
): Promise<(() => void) | null> {
  if (!isTauri()) return null;
  const event = await getEventModule();
  if (!event) return null;
  const unlisten = await event.listen<string[]>('file-drop-rejected', (e) => {
    if (e.payload.length > 0) {
      callback(e.payload);
    }
  });
  return unlisten;
}

/**
 * Track open file paths per-document for "Save" functionality.
 * Keys are document IDs (from documentManager); values are absolute file paths.
 */
const filePathsByDocId: Map<string, string> = new Map();

export function setDocumentFilePath(docId: string, path: string): void {
  filePathsByDocId.set(docId, path);
}

export function getDocumentFilePath(docId: string): string | null {
  return filePathsByDocId.get(docId) ?? null;
}

export function clearDocumentFilePath(docId: string): void {
  filePathsByDocId.delete(docId);
}

/**
 * Save PDF - either to the document's known path or show a save dialog.
 * Pass `docId` so the correct per-document path is used; after a successful
 * save the resolved path is recorded back against that document ID.
 */
export async function savePdf(
  pdfBytes: Uint8Array,
  fileName: string,
  forceDialog: boolean = false,
  docId?: string,
): Promise<{ success: boolean; path?: string }> {
  if (!isTauri()) {
    // Fallback to browser download
    return { success: false };
  }

  let savePath: string | null = null;

  const knownPath = docId ? getDocumentFilePath(docId) : null;
  if (!forceDialog && knownPath) {
    // Save to the path this document was opened from / last saved to
    savePath = knownPath;
  } else {
    // Show save dialog
    savePath = await savePdfDialog(fileName);
  }

  if (!savePath) {
    return { success: false };
  }

  const success = await writeFile(savePath, pdfBytes);

  if (success && docId) {
    setDocumentFilePath(docId, savePath);
  }

  return { success, path: savePath };
}

// Export a function to initialize Tauri integrations
export async function initTauriIntegrations(handlers: {
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onExport?: () => void;
  onCloseDoc?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopyPages?: () => void;
  onCutPages?: () => void;
  onPastePages?: () => void;
  onSelectAll?: () => void;
  onDeselect?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitPage?: () => void;
  onToggleThumbnails?: () => void;
  onToggleRibbon?: () => void;
  onRotateLeft?: () => void;
  onRotateRight?: () => void;
  onAddBlank?: () => void;
  onDeletePages?: () => void;
  onCompress?: () => void;
  onOcr?: () => void;
  onAbout?: () => void;
  onShortcuts?: () => void;
  onFileDrop?: (paths: string[]) => void;
  onFileDropRejected?: (paths: string[]) => void;
}): Promise<void> {
  if (!isTauri()) return;

  // Listen to menu actions
  await onMenuAction((action) => {
    switch (action) {
      case 'open':
        handlers.onOpen?.();
        break;
      case 'save':
        handlers.onSave?.();
        break;
      case 'save-as':
        handlers.onSaveAs?.();
        break;
      case 'export':
        handlers.onExport?.();
        break;
      case 'close-doc':
        handlers.onCloseDoc?.();
        break;
      case 'undo':
        handlers.onUndo?.();
        break;
      case 'redo':
        handlers.onRedo?.();
        break;
      case 'copy-pages':
        handlers.onCopyPages?.();
        break;
      case 'cut-pages':
        handlers.onCutPages?.();
        break;
      case 'paste-pages':
        handlers.onPastePages?.();
        break;
      case 'select-all':
        handlers.onSelectAll?.();
        break;
      case 'deselect':
        handlers.onDeselect?.();
        break;
      case 'zoom-in':
        handlers.onZoomIn?.();
        break;
      case 'zoom-out':
        handlers.onZoomOut?.();
        break;
      case 'fit-page':
        handlers.onFitPage?.();
        break;
      case 'toggle-thumbnails':
        handlers.onToggleThumbnails?.();
        break;
      case 'toggle-ribbon':
        handlers.onToggleRibbon?.();
        break;
      case 'rotate-left':
        handlers.onRotateLeft?.();
        break;
      case 'rotate-right':
        handlers.onRotateRight?.();
        break;
      case 'add-blank':
        handlers.onAddBlank?.();
        break;
      case 'delete-pages':
        handlers.onDeletePages?.();
        break;
      case 'compress':
        handlers.onCompress?.();
        break;
      case 'ocr':
        handlers.onOcr?.();
        break;
      case 'about':
        handlers.onAbout?.();
        break;
      case 'shortcuts':
        handlers.onShortcuts?.();
        break;
    }
  });

  // Listen to file drop events
  if (handlers.onFileDrop) {
    await onFileDrop(handlers.onFileDrop);
  }

  // Listen to file drop rejected events
  if (handlers.onFileDropRejected) {
    await onFileDropRejected(handlers.onFileDropRejected);
  }
}
