// Lightweight modal builder for editor tools (watermark, stamps, sign)
export interface WatermarkOptions {
  text: string;
  size: number;
  opacity: number;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
  x?: number;
  y?: number;
}

function createModal(html: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'editor-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50';
  wrapper.innerHTML = `
    <div class="bg-gray-900 text-white rounded p-4 w-[480px] max-w-full">${html}</div>
  `;
  document.body.appendChild(wrapper);
  return wrapper;
}

export function showWatermarkModal(defaultText = 'CONFIDENTIAL'): Promise<WatermarkOptions | null> {
  return new Promise((resolve) => {
    const html = `
      <h3 class="text-lg font-semibold mb-2">Add Watermark</h3>
      <label class="block mb-2"><span class="text-sm">Text</span><input id="wm-text" class="w-full mt-1 p-2 bg-gray-800 rounded" value="${defaultText}"></label>
      <div class="grid grid-cols-3 gap-2 mb-2">
        <label>Size<input id="wm-size" type="number" class="w-full mt-1 p-2 bg-gray-800 rounded" value="36"></label>
        <label>Opacity<input id="wm-opacity" type="number" class="w-full mt-1 p-2 bg-gray-800 rounded" value="12" min="1" max="100"></label>
        <label>Position
          <select id="wm-position" class="w-full mt-1 p-2 bg-gray-800 rounded">
            <option value="center">Center</option>
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
            <option value="custom">Precise (custom)</option>
          </select>
        </label>
      </div>
      <div class="flex justify-end gap-2">
        <button id="wm-cancel" class="px-3 py-1 rounded bg-gray-700">Cancel</button>
        <button id="wm-ok" class="px-3 py-1 rounded bg-indigo-600">Apply</button>
      </div>
    `;

    const modal = createModal(html);

    const cleanup = () => modal.remove();

    const ok = modal.querySelector('#wm-ok') as HTMLButtonElement;
    const cancel = modal.querySelector('#wm-cancel') as HTMLButtonElement;
    ok.addEventListener('click', () => {
      const text = (modal.querySelector('#wm-text') as HTMLInputElement).value || defaultText;
      const size = Number((modal.querySelector('#wm-size') as HTMLInputElement).value) || 36;
      const opacity = Number((modal.querySelector('#wm-opacity') as HTMLInputElement).value) || 12;
      const position = (modal.querySelector('#wm-position') as HTMLSelectElement).value as WatermarkOptions['position'];
      cleanup();
      resolve({ text, size, opacity, position });
    });

    cancel.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
  });
}

export function showStampModal(defaultText = 'APPROVED'): Promise<WatermarkOptions | null> {
  return showWatermarkModal(defaultText);
}

export function showSignModal(): Promise<{ file: File | null } | null> {
  return new Promise((resolve) => {
    const html = `
      <h3 class="text-lg font-semibold mb-2">Add Signature</h3>
      <p class="text-sm mb-2">Choose an image file (PNG/JPG) to stamp as signature.</p>
      <div class="flex justify-end gap-2">
        <button id="sign-cancel" class="px-3 py-1 rounded bg-gray-700">Cancel</button>
        <button id="sign-choose" class="px-3 py-1 rounded bg-indigo-600">Choose File</button>
      </div>
    `;

    const modal = createModal(html);
    const cleanup = () => modal.remove();

    const cancel = modal.querySelector('#sign-cancel') as HTMLButtonElement;
    const choose = modal.querySelector('#sign-choose') as HTMLButtonElement;

    choose.addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png, image/jpeg';
      input.onchange = () => {
        const f = input.files?.[0] || null;
        cleanup();
        resolve({ file: f });
      };
      input.click();
    });

    cancel.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
  });
}

export function showOcrModal(defaultLang = 'eng'): Promise<{ lang: string } | null> {
  return new Promise((resolve) => {
    const html = `
      <h3 class="text-lg font-semibold mb-2">OCR Options</h3>
      <p class="text-sm mb-2">Choose OCR language (Tesseract language codes).</p>
      <label class="block mb-2">
        <select id="ocr-lang" class="w-full mt-1 p-2 bg-gray-800 rounded">
          <option value="eng">English (eng)</option>
          <option value="deu">German (deu)</option>
          <option value="spa">Spanish (spa)</option>
          <option value="fra">French (fra)</option>
          <option value="ita">Italian (ita)</option>
          <option value="por">Portuguese (por)</option>
          <option value="hin">Hindi (hin)</option>
          <option value="chi_sim">Chinese Simplified (chi_sim)</option>
        </select>
      </label>
      <div class="flex justify-end gap-2">
        <button id="ocr-cancel" class="px-3 py-1 rounded bg-gray-700">Cancel</button>
        <button id="ocr-ok" class="px-3 py-1 rounded bg-indigo-600">Run OCR</button>
      </div>
    `;

    const modal = createModal(html);
    const cleanup = () => modal.remove();

    const ok = modal.querySelector('#ocr-ok') as HTMLButtonElement;
    const cancel = modal.querySelector('#ocr-cancel') as HTMLButtonElement;
    const sel = modal.querySelector('#ocr-lang') as HTMLSelectElement;
    // set default
    sel.value = defaultLang;

    ok.addEventListener('click', () => {
      const lang = sel.value || defaultLang;
      cleanup();
      resolve({ lang });
    });
    cancel.addEventListener('click', () => { cleanup(); resolve(null); });
  });
}
