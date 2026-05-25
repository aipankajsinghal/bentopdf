import * as pdfjsLib from 'pdfjs-dist';

// Build the worker URL relative to this module's location.
// On Tauri/Windows the tauri:// custom protocol sometimes rejects the
// resolved URL — fall back to in-thread (no-worker) mode with a warning
// rather than crashing silently.
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch (e) {
  console.warn(
    '[BentoPDF] Failed to resolve PDF.js worker URL; falling back to no-worker mode. ' +
    'PDF rendering may be slower.',
    e
  );
  // Setting workerSrc to empty string disables the worker thread;
  // PDF.js will run in the main thread instead.
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
}

export { pdfjsLib };
