type OcrModalHandle = {
  updateText: (txt: string) => void;
  updateProgress: (pct: number) => void;
  close: () => void;
};

export function showTextModal(title: string, textOrOptions: any): OcrModalHandle {
  const existing = document.getElementById('text-modal');
  if (existing) existing.remove();

  const isOptions = typeof textOrOptions === 'object' && (textOrOptions.initialText !== undefined || textOrOptions.progress);
  const initialText = isOptions ? (textOrOptions.initialText || '') : (textOrOptions || '');
  const showProgress = isOptions ? !!textOrOptions.progress : false;

  const wrapper = document.createElement('div');
  wrapper.id = 'text-modal';
  wrapper.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50';
  wrapper.innerHTML = `
    <div class="bg-gray-900 text-white rounded p-4 w-[760px] max-w-full max-h-[80vh] overflow-auto">
      <div class="flex justify-between items-center mb-2">
        <h3 class="text-lg font-semibold">${title}</h3>
        <div class="flex gap-2">
          <button id="text-copy" class="px-2 py-1 rounded bg-gray-700">Copy</button>
          <button id="text-download" class="px-2 py-1 rounded bg-indigo-600">Download</button>
          <button id="text-close" class="px-2 py-1 rounded bg-gray-700">Close</button>
        </div>
      </div>
      ${showProgress ? `<div class="mb-2">
         <div class="text-sm mb-1">Progress: <span id="text-progress-label">0%</span></div>
         <div class="w-full bg-gray-800 h-2 rounded"><div id="text-progress-bar" style="width:0%" class="h-2 bg-indigo-600 rounded"></div></div>
       </div>` : ''}
      <textarea id="text-content" class="w-full h-[60vh] p-2 bg-gray-800 rounded text-sm" spellcheck="false"></textarea>
      ${showProgress ? `<div class="flex justify-between items-center mt-2"><button id="text-cancel" class="px-3 py-1 rounded bg-red-700">Cancel</button><div></div></div>` : ''}
    </div>
  `;
  document.body.appendChild(wrapper);

  const textarea = wrapper.querySelector('#text-content') as HTMLTextAreaElement;
  textarea.value = initialText;

  const closeBtn = wrapper.querySelector('#text-close') as HTMLButtonElement;
  const copyBtn = wrapper.querySelector('#text-copy') as HTMLButtonElement;
  const dlBtn = wrapper.querySelector('#text-download') as HTMLButtonElement;
  const cancelBtn = wrapper.querySelector('#text-cancel') as HTMLButtonElement | null;
  const progressBar = wrapper.querySelector('#text-progress-bar') as HTMLDivElement | null;
  const progressLabel = wrapper.querySelector('#text-progress-label') as HTMLElement | null;

  function cleanup() { wrapper.remove(); }

  closeBtn.addEventListener('click', () => cleanup());
  copyBtn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(textarea.value); } catch (e) {} });
  dlBtn.addEventListener('click', () => {
    const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ocr-output.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      // notify listeners that OCR should be cancelled
      window.dispatchEvent(new CustomEvent('bentopdf-ocr-cancel'));
      cleanup();
    });
  }

  return {
    updateText: (txt: string) => { const ta = document.getElementById('text-content') as HTMLTextAreaElement | null; if (ta) ta.value = txt; },
    updateProgress: (pct: number) => { if (progressBar) progressBar.style.width = `${pct}%`; if (progressLabel) progressLabel.textContent = `${pct}%`; },
    close: () => cleanup(),
  };
}
