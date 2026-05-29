import { GeminiAdapter } from './gemini-adapter.js';

const isTauri = (): boolean =>
    typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
}

export class AIClient {
    private adapter: GeminiAdapter | null = null;
    private apiKey: string = '';
    private _tauriHasKey: boolean = false;

    constructor() {
        if (isTauri()) {
            this.initTauri();
        } else {
            this.loadApiKey();
        }
    }

    private async initTauri() {
        this._tauriHasKey = await tauriInvoke<boolean>('ai_has_key');
    }

    private loadApiKey() {
        this.apiKey = localStorage.getItem('bentopdf_gemini_api_key') || '';
        if (this.apiKey) {
            this.adapter = new GeminiAdapter(this.apiKey);
        }
    }

    async setApiKey(key: string) {
        if (isTauri()) {
            await tauriInvoke('ai_set_key', { key });
            this._tauriHasKey = !!key;
        } else {
            this.apiKey = key;
            localStorage.setItem('bentopdf_gemini_api_key', key);
            this.adapter = key ? new GeminiAdapter(key) : null;
        }
    }

    async clearKey() {
        if (isTauri()) {
            await tauriInvoke('ai_set_key', { key: '' });
            this._tauriHasKey = false;
        } else {
            this.apiKey = '';
            localStorage.removeItem('bentopdf_gemini_api_key');
            this.adapter = null;
        }
    }

    getApiKey(): string {
        return this.apiKey;
    }

    hasKey(): boolean {
        if (isTauri()) return this._tauriHasKey;
        return !!this.apiKey;
    }

    async summarize(text: string): Promise<string> {
        const prompt = `Please summarize the following text concisely:\n\n${text}`;
        return this._generateContent(prompt);
    }

    async translate(text: string, targetLanguage: string): Promise<string> {
        const prompt = `Translate the following text to ${targetLanguage}. Return only the translation:\n\n${text}`;
        return this._generateContent(prompt);
    }

    async ocrImage(imageBase64: string): Promise<string> {
        const prompt = 'Extract all text from this image. Preserve layout structure as much as possible.';
        return this._generateVisionContent(prompt, imageBase64);
    }

    private async _generateContent(prompt: string): Promise<string> {
        if (isTauri()) {
            return tauriInvoke<string>('ai_generate_text', { prompt });
        }
        if (!this.adapter) throw new Error('AI Client not initialized. API Key missing.');
        return this.adapter.generateContent(prompt);
    }

    private async _generateVisionContent(prompt: string, imageBase64: string): Promise<string> {
        if (isTauri()) {
            return tauriInvoke<string>('ai_generate_vision', { prompt, imageBase64 });
        }
        if (!this.adapter) throw new Error('AI Client not initialized. API Key missing.');
        return this.adapter.generateVisionContent(prompt, imageBase64);
    }
}

export const aiClient = new AIClient();
