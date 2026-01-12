import { GeminiAdapter } from './gemini-adapter.js';

export class AIClient {
    private adapter: GeminiAdapter | null = null;
    private apiKey: string = '';

    constructor() {
        this.loadApiKey();
    }

    private loadApiKey() {
        this.apiKey = localStorage.getItem('bentopdf_gemini_api_key') || '';
        if (this.apiKey) {
            this.adapter = new GeminiAdapter(this.apiKey);
        }
    }

    setApiKey(key: string) {
        this.apiKey = key;
        localStorage.setItem('bentopdf_gemini_api_key', key);
        this.adapter = new GeminiAdapter(key);
    }

    getApiKey(): string {
        return this.apiKey;
    }

    hasKey(): boolean {
        return !!this.apiKey;
    }

    async summarize(text: string): Promise<string> {
        if (!this.adapter) throw new Error('AI Client not initialized. API Key missing.');
        const prompt = `Please summarize the following text concisely:\n\n${text}`;
        return this.adapter.generateContent(prompt);
    }

    async translate(text: string, targetLanguage: string): Promise<string> {
        if (!this.adapter) throw new Error('AI Client not initialized. API Key missing.');
        const prompt = `Translate the following text to ${targetLanguage}. Return only the translation:\n\n${text}`;
        return this.adapter.generateContent(prompt);
    }

    async ocrImage(imageBase64: string): Promise<string> {
        if (!this.adapter) throw new Error('AI Client not initialized. API Key missing.');
        const prompt = "Extract all text from this image. Preserve layout structure as much as possible.";
        return this.adapter.generateVisionContent(prompt, imageBase64);
    }
}

export const aiClient = new AIClient();
