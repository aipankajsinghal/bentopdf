import { aiClient } from '../ai/ai-client.js';
import { getActiveDocument } from '../documentManager.js';
import { showAlert, showLoader, hideLoader } from '../ui.js';
import { createIcons, icons } from 'lucide';

export class AIPanel {
  private container: HTMLElement;
  private resultArea: HTMLTextAreaElement;
  private actionButtons: HTMLElement;
  private languageSelect: HTMLSelectElement;

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
        <button id="close-ai-panel" class="text-gray-400 hover:text-white transition-colors">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <div class="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        <!-- Actions -->
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

        <!-- Translation -->
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

        <!-- Results -->
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
    `;

    this.resultArea = this.container.querySelector('#ai-result-area') as HTMLTextAreaElement;
    this.languageSelect = this.container.querySelector('#ai-language-select') as HTMLSelectElement;
    this.actionButtons = this.container.querySelector('#ai-result-actions') as HTMLElement;

    this.initListeners();
    createIcons({ icons, nameAttr: 'data-lucide', attrs: { class: "w-4 h-4" } }, this.container);
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
  }

  toggle(force?: boolean) {
    if (typeof force === 'boolean') {
      this.container.classList.toggle('hidden', !force);
    } else {
      this.container.classList.toggle('hidden');
    }
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  private async getImageFromCurrentPage(): Promise<string> {
    const doc = getActiveDocument();
    if (!doc) throw new Error('No document active');
    
    // We need to get the canvas image data from the viewer
    // This assumes the viewer canvas is rendered and accessible
    const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Viewer canvas not found');
    
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]; // Return base64 content
  }

  private async handleSummarize() {
      if (!aiClient.hasKey()) {
          showAlert('API Key Missing', 'Please configure your Gemini API Key in Settings.');
          return;
      }
      
      showLoader('Analyzing page...');
      try {
          // Ideally we extract text first, but vision is more robust for complex layouts
          // For now, let's try vision-based summary if we can get the image
          const image = await this.getImageFromCurrentPage();
          const summary = await aiClient.ocrImage(image); // This is just OCR, let's ask for summary
          
          // Re-purpose the OCR method to ask for summary? 
          // Our ai-client is rigid. Let's fix that or use a specific prompt.
          // Let's rely on extracted text for now if possible? 
          // Actually, let's just use the `summarize` method but we need text first.
          
          // Better: Use `generateVisionContent` via adapter directly? No, keep abstraction.
          // Let's assume we extract text via OCR first for simplicity in Phase 1
          
          // For a good summary, we need text. Let's get text from PDF.js first?
          // That's complex. Let's use the Vision capability for "Summarize this image"
          // We need to update AIClient to support vision summary
          
          // Temporary workaround: Use OCR image prompt
          const prompt = "Summarize the content of this page effectively.";
          // Access adapter directly (hack) or extend client? Let's extend Client later.
          // For now, let's use the OCR method which is "Image -> Text" 
          // We'll update the prompt in the client call if possible.
          
          // Let's assume aiClient has a generic "runVision(prompt, image)" method?
          // It doesn't. 
          
          // Let's just run OCR then Summarize text.
          const text = await aiClient.ocrImage(image);
          const result = await aiClient.summarize(text);
          
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

  private async handleTranslate() {
      if (!aiClient.hasKey()) {
          showAlert('API Key Missing', 'Please configure your Gemini API Key in Settings.');
          return;
      }

      const lang = this.languageSelect.value;
      
      // Check if we have text in the result area to translate
      let textToTranslate = this.resultArea.value;
      
      if (!textToTranslate) {
          // If empty, OCR first
          if (confirm("No text to translate. Run OCR on current page first?")) {
             showLoader('Extracting text...');
             try {
                const image = await this.getImageFromCurrentPage();
                textToTranslate = await aiClient.ocrImage(image);
                this.resultArea.value = textToTranslate; // Show intermediate
             } catch(e: any) {
                 hideLoader();
                 showAlert('Error', e.message);
                 return;
             }
          } else {
              return;
          }
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

  // Public API for Context Menu
  public async runSummarizeText(text: string) {
      if (!text) return;
      this.toggle(true);
      await this.handleSummarize(text);
  }

  public async runTranslateText(text: string) {
      if (!text) return;
      this.toggle(true); 
      // Focus translate view
      const transSection = this.panel.querySelector('.border-t') as HTMLElement;
      if (transSection) transSection.scrollIntoView();
      
      const langSelect = this.panel.querySelector('select');
      const targetLang = langSelect ? langSelect.value : 'Hindi'; // Default?
      
      await this.handleTranslate(text, targetLang);
  }

  private async handleSummarize(text: string) {
    // Re-use logic from btn click but with direct text
    const resultArea = this.panel.querySelector('textarea');
    if (resultArea) resultArea.value = 'Summarizing selected text...';
    
    try {
        const stream = await aiClient.summarize(text);
        if (resultArea && stream) {
            resultArea.value = '';
            for await (const chunk of stream) {
                resultArea.value += chunk;
                resultArea.scrollTop = resultArea.scrollHeight;
            }
        }
    } catch (err) {
        if (resultArea) resultArea.value = `Error: ${err}`;
    }
  }

  private async handleTranslate(text: string, targetLang: string) {
     const resultArea = this.panel.querySelector('textarea');
     if (resultArea) resultArea.value = `Translating selection to ${targetLang}...`;
     
     try {
        const stream = await aiClient.translate(text, targetLang);
        if (resultArea && stream) {
            resultArea.value = '';
            for await (const chunk of stream) {
                resultArea.value += chunk;
                resultArea.scrollTop = resultArea.scrollHeight;
            }
        }
    } catch (err) {
        if (resultArea) resultArea.value = `Error: ${err}`;
    }
  }
}

export const aiPanel = new AIPanel();
