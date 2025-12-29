import Tesseract from 'tesseract.js';

// Lightweight worker implementation that runs Tesseract.recognize in the worker thread.
// This avoids depending on createWorker() lifecycle differences across bundlers.

self.onmessage = async (ev) => {
  const { id, action, payload } = ev.data || {};
  if (action === 'recognize') {
    const { dataUrl, lang = 'eng' } = payload || {};
    try {
      const res = await Tesseract.recognize(dataUrl, lang, {
        logger: (m) => {
          // forward progress updates
          try { self.postMessage({ id, type: 'progress', payload: m }); } catch (e) {}
        },
      });

      // send back the full result (res.data contains text and other info)
      try { self.postMessage({ id, type: 'result', payload: res.data }); } catch (e) {}
    } catch (err) {
      try { self.postMessage({ id, type: 'error', payload: String(err) }); } catch (e) {}
    }
  } else if (action === 'terminate') {
    // no-op for this simple worker; respond so main thread can continue
    try { self.postMessage({ id, type: 'terminated' }); } catch (e) {}
  }
};
