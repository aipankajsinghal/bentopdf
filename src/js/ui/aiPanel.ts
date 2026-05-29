import { aiClient } from '../ai/ai-client.js';
import { getActiveDocument } from '../documentManager.js';
import { showAlert, showLoader, hideLoader } from '../ui.js';
import { createIcons, icons } from 'lucide';

export class AIPanel {
  private container: HTMLElement;
  private resultArea: HTMLTextAreaElement;
  private languageSelect: HTMLSelectElement;
  private iconsInitialized = false;
  private showingSettings = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'ai-panel';
    this.container.className = 'w-80 bg-gray-800 border-l border-gray-700 flex flex-col hidden transition-all duration-300 ease-in-out';

    this.container.innerHTML = `
      <div class="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-850">
        <h3 class="font-bold text-white flex items-center gap-2">
          <i data-lucide="sparkles" class="w-4 h-4 text-indigo-400"></i>
          AI Assistant
        </h3>
        <div class="flex items-center gap-2">
          <span id="ai-key-status-badge" class="text-xs font-medium"></span>
          <button id="ai-settings-btn" class="text-gray-400 hover:text-white transition-colors" title="AI Settings">
            <i data-lucide="settings" class="w-4 h-4"></i>
          </button>
          <button id="close-ai-panel" class="text-gray-400 hover:text-white transition-colors">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Main view -->
      <div id="ai-main-view" class="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        <div class="flex flex-col gap-2">
          <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</label>

          <button id="ai-summarize-btn" class="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors text-left group">
            <div class="p-1.5 bg-indigo-500/20 rounded text-indigo-400 group-hover:text-indigo-300">
              <i data-lucide="file-text" class="w-4 h-4"></i>
            </div>
            <span>Summarize Page</span>
          </button>

          <button id="ai-ocr-btn" class="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors text-left group">
            <div class="p-1.5 bg-green-500/20 rounded text-green-400 group-hover:text-green-300">
               <i data-lucide="scan-text" class="w-4 h-4"></i>
            </div>
            <span>OCR Current Page</span>
          </button>
        </div>

        <div class="flex flex-col gap-2 mt-2">
          <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Translation</label>
          <div class="flex gap-2">
            <select id="ai-language-select" class="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500 outline-none">
              <option value="English">English</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="German">German</option>
              <option value="Hindi">Hindi</option>
              <option value="Chinese">Chinese</option>
              <option value="Japanese">Japanese</option>
            </select>
            <button id="ai-translate-btn" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors">
              Go
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-2 flex-1 min-h-[200px]">
          <div class="flex justify-between items-center">
             <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Result</label>
             <div class="flex gap-1" id="ai-result-actions">
               <button id="ai-copy-btn" class="p-1 text-gray-400 hover:text-white" title="Copy to Clipboard">
                 <i data-lucide="copy" class="w-3 h-3"></i>
               </button>
               <button id="ai-download-btn" class="p-1 text-gray-400 hover:text-white" title="Download .txt">
                 <i data-lucide="download" class="w-3 h-3"></i>
               </button>
             </div>
          </div>
          <textarea id="ai-result-area" class="flex-1 w-full bg-gray-900 border border-gray-700 rounded p-3 text-sm text-gray-300 focus:outline-none resize-none font-mono leading-relaxed" placeholder="AI output will appear here..." readonly></textarea>
        </div>
      </div>

      <!-- Settings view -->
      <div id="ai-settings-view" class="p-4 flex-1 flex flex-col gap-5 overflow-y-auto hidden">
        <div>
          <h4 class="text-sm font-semibold text-white mb-2">Gemini API Key</h4>
          <div class="flex items-center gap-2 mb-4">
            <span id="settings-key-dot" class="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
            <span id="settings-key-label" class="text-xs text-gray-400">Not configured</span>
          </div>

          <details class="mb-4 bg-gray-700/50 rounded border border-gray-600">
            <summary class="px-3 py-2 text-xs text-gray-300 cursor-pointer select-none hover:text-white">
              How to get your API key
            </summary>
            <div class="px-3 pb-3 pt-2 text-xs text-gray-400 space-y-1 border-t border-gray-600">
              <p>1. Go to Google AI Studio</p>
              <p>2. Sign in with your Google account</p>
              <p>3. Click "Get API key"</p>
              <p>4. Create a new key or copy an existing one</p>
              <button id="ai-studio-link-btn" class="mt-2 w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors flex items-center justify-center gap-1">
                <i data-lucide="external-link" class="w-3 h-3"></i>
                Open Google AI Studio
              </button>
            </div>
          </details>

          <div class="relative flex items-center mb-3">
            <input id="ai-key-input" type="password"
              class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none pr-16"
              placeholder="AIza..." />
            <button id="ai-key-toggle-btn" class="absolute right-8 p-1 text-gray-400 hover:text-white transition-colors" title="Show/hide key">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
            <button id="ai-key-clear-input-btn" class="absolute right-1 p-1 text-gray-400 hover:text-white transition-colors" title="Clear input">
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>

          <div class="flex flex-col gap-2">
            <button id="ai-save-key-btn" class="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors">
              Save Key
            </button>
            <button id="ai-remove-key-btn" class="w-full px-3 py-2 bg-red-700/80 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors hidden">
              Remove Key
            </button>
          </div>

          <p id="ai-key-save-status" class="mt-2 text-xs text-center hidden"></p>
        </div>
      </div>
    `;

    this.resultArea = this.container.querySelector('#ai-result-area') as HTMLTextAreaElement;
    this.languageSelect = this.container.querySelector('#ai-language-select') as HTMLSelectElement;

    this.initListeners();
    createIcons({ icons, nameAttr: 'data-lucide', attrs: { class: 'w-4 h-4' } });
  }

  private refreshKeyStatus() {
    const hasKey = aiClient.hasKey();

    const badge = this.container.querySelector('#ai-key-status-badge');
    if (badge) {
      badge.textContent = hasKey ? '● Connected' : '● No API key';
      badge.className = `text-xs font-medium ${hasKey ? 'text-green-400' : 'text-amber-400'}`;
    }

    const dot = this.container.querySelector('#settings-key-dot') as HTMLElement | null;
    const label = this.container.querySelector('#settings-key-label');
    if (dot && label) {
      dot.className = `inline-block w-2 h-2 rounded-full ${hasKey ? 'bg-green-400' : 'bg-amber-400'}`;
      label.textContent = hasKey ? 'Connected' : 'Not configured';
    }

    const removeBtn = this.container.querySelector('#ai-remove-key-btn') as HTMLElement | null;
    if (removeBtn) removeBtn.classList.toggle('hidden', !hasKey);

    const saveBtn = this.container.querySelector('#ai-save-key-btn');
    if (saveBtn) saveBtn.textContent = hasKey ? 'Update Key' : 'Save Key';
  }

  private initListeners() {
    this.container.querySelector('#close-ai-panel')?.addEventListener('click', () => this.toggle(false));
    this.container.querySelector('#ai-summarize-btn')?.addEventListener('click', () => this.handleSummarize());
    this.container.querySelector('#ai-ocr-btn')?.addEventListener('click', () => this.handleOCR());
    this.container.querySelector('#ai-translate-btn')?.addEventListener('click', () => this.handleTranslate());

    this.container.querySelector('#ai-copy-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.resultArea.value);
      showAlert('Copied', 'Text copied to clipboard', 'success');
    });

    this.container.querySelector('#ai-download-btn')?.addEventListener('click', () => {
      const blob = new Blob([this.resultArea.value], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `ai-result-${Date.now()}.txt`;
      link.click();
    });

    this.container.querySelector('#ai-settings-btn')?.addEventListener('click', () => this.toggleSettings());

    this.container.querySelector('#ai-studio-link-btn')?.addEventListener('click', () => {
      window.open('https://aistudio.google.com/apikey', '_blank');
    });

    this.container.querySelector('#ai-key-toggle-btn')?.addEventListener('click', () => {
      const input = this.container.querySelector('#ai-key-input') as HTMLInputElement;
      const icon = this.container.querySelector('#ai-key-toggle-btn i');
      if (input.type === 'password') {
        input.type = 'text';
        icon?.setAttribute('data-lucide', 'eye-off');
      } else {
        input.type = 'password';
        icon?.setAttribute('data-lucide', 'eye');
      }
      createIcons({ icons, nameAttr: 'data-lucide' });
    });

    this.container.querySelector('#ai-key-clear-input-btn')?.addEventListener('click', () => {
      const input = this.container.querySelector('#ai-key-input') as HTMLInputElement;
      input.value = '';
      input.focus();
    });

    this.container.querySelector('#ai-save-key-btn')?.addEventListener('click', () => this.handleSaveKey());
    this.container.querySelector('#ai-remove-key-btn')?.addEventListener('click', () => this.handleRemoveKey());
  }

  private toggleSettings() {
    this.showingSettings = !this.showingSettings;
    const mainView = this.container.querySelector('#ai-main-view') as HTMLElement;
    const settingsView = this.container.querySelector('#ai-settings-view') as HTMLElement;
    const settingsBtn = this.container.querySelector('#ai-settings-btn') as HTMLElement;

    mainView.classList.toggle('hidden', this.showingSettings);
    settingsView.classList.toggle('hidden', !this.showingSettings);
    settingsBtn.classList.toggle('text-indigo-400', this.showingSettings);
    settingsBtn.classList.toggle('text-gray-400', !this.showingSettings);

    this.refreshKeyStatus();
    createIcons({ icons, nameAttr: 'data-lucide' });
  }

  private async handleSaveKey() {
    const input = this.container.querySelector('#ai-key-input') as HTMLInputElement;
    const key = input.value.trim();
    if (!key) {
      this.showKeyStatus('Please enter an API key', false);
      return;
    }
    try {
      await aiClient.setApiKey(key);
      input.value = '';
      input.type = 'password';
      this.refreshKeyStatus();
      this.showKeyStatus('✓ Key saved successfully', true);
    } catch (err: any) {
      this.showKeyStatus('✗ ' + err.message, false);
    }
  }

  private async handleRemoveKey() {
    try {
      await aiClient.clearKey();
      (this.container.querySelector('#ai-key-input') as HTMLInputElement).value = '';
      this.refreshKeyStatus();
      this.showKeyStatus('Key removed', true);
    } catch (err: any) {
      this.showKeyStatus('✗ ' + err.message, false);
    }
  }

  private showKeyStatus(message: string, success: boolean) {
    const el = this.container.querySelector('#ai-key-save-status') as HTMLElement;
    if (!el) return;
    el.textContent = message;
    el.className = `mt-2 text-xs text-center ${success ? 'text-green-400' : 'text-red-400'}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  toggle(force?: boolean) {
    const wasHidden = this.container.classList.contains('hidden');
    if (typeof force === 'boolean') {
      this.container.classList.toggle('hidden', !force);
    } else {
      this.container.classList.toggle('hidden');
    }
    if (!this.iconsInitialized && (force === true || (force === undefined && wasHidden))) {
      createIcons({ icons, nameAttr: 'data-lucide' });
      this.iconsInitialized = true;
    }
    if (force !== false) {
      this.refreshKeyStatus();
    }
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  private async getImageFromCurrentPage(): Promise<string> {
    const doc = getActiveDocument();
    if (!doc) throw new Error('No document active');
    const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Viewer canvas not found');
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  }

  private async handleSummarize(text?: string) {
    if (!aiClient.hasKey()) {
      showAlert('API Key Missing', 'Please configure your Gemini API Key in Settings.');
      return;
    }

    let textToSummarize = text;

    if (!textToSummarize) {
      showLoader('Analyzing page...');
      try {
        const image = await this.getImageFromCurrentPage();
        textToSummarize = await aiClient.ocrImage(image);
      } catch (err: any) {
        hideLoader();
        showAlert('Error', err.message);
        return;
      }
    } else {
      this.resultArea.value = 'Summarizing selected text...';
    }

    showLoader('Summarizing...');
    try {
      const result = await aiClient.summarize(textToSummarize);
      this.resultArea.value = result;
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      hideLoader();
    }
  }

  private async handleOCR() {
    if (!aiClient.hasKey()) {
      showAlert('API Key Missing', 'Please configure your Gemini API Key in Settings.');
      return;
    }

    showLoader('Extracting text...');
    try {
      const image = await this.getImageFromCurrentPage();
      const text = await aiClient.ocrImage(image);
      this.resultArea.value = text;
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      hideLoader();
    }
  }

  private async handleTranslate(text?: string, targetLang?: string) {
    if (!aiClient.hasKey()) {
      showAlert('API Key Missing', 'Please configure your Gemini API Key in Settings.');
      return;
    }

    const lang = targetLang || this.languageSelect.value;
    let textToTranslate = text || this.resultArea.value;

    if (!textToTranslate) {
      if (confirm('No text to translate. Run OCR on current page first?')) {
        showLoader('Extracting text...');
        try {
          const image = await this.getImageFromCurrentPage();
          textToTranslate = await aiClient.ocrImage(image);
          this.resultArea.value = textToTranslate;
        } catch (e: any) {
          hideLoader();
          showAlert('Error', e.message);
          return;
        }
      } else {
        return;
      }
    } else if (text) {
      this.resultArea.value = `Translating selection to ${lang}...`;
    }

    showLoader(`Translating to ${lang}...`);
    try {
      const result = await aiClient.translate(textToTranslate, lang);
      this.resultArea.value = result;
    } catch (err: any) {
      showAlert('Error', err.message);
    } finally {
      hideLoader();
    }
  }

  public async runSummarizeText(text: string) {
    if (!text) return;
    this.toggle(true);
    await this.handleSummarize(text);
  }

  public async runTranslateText(text: string) {
    if (!text) return;
    this.toggle(true);
    const targetLang = this.languageSelect.value || 'Hindi';
    await this.handleTranslate(text, targetLang);
  }
}

export const aiPanel = new AIPanel();
