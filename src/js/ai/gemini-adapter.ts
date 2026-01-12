import { AIResult, AIRequestOptions } from './types.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-1.5-flash';

export class GeminiAdapter {
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, model: string = DEFAULT_MODEL) {
        this.apiKey = apiKey;
        this.model = model;
    }

    private getUrl(action: string = 'generateContent'): string {
        return `${BASE_URL}/${this.model}:${action}?key=${this.apiKey}`;
    }

    async generateContent(prompt: string): Promise<string> {
        return this.callApi({
            contents: [{
                parts: [{ text: prompt }]
            }]
        });
    }

    async generateVisionContent(prompt: string, imageBase64: string, mimeType: string = 'image/jpeg'): Promise<string> {
        return this.callApi({
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: imageBase64
                        }
                    }
                ]
            }]
        });
    }

    private async callApi(body: any): Promise<string> {
        if (!this.apiKey) {
            throw new Error('Gemini API Key is missing. Please configure it in Settings.');
        }

        try {
            const response = await fetch(this.getUrl(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `API Error: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.candidates && data.candidates.length > 0) {
                const text = data.candidates[0].content?.parts?.[0]?.text;
                if (text) return text;
            }

            return '';
        } catch (error: any) {
            console.error('Gemini API Error:', error);
            throw error;
        }
    }
}
