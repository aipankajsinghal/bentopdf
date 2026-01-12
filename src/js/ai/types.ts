export interface AIResult {
  type: 'ocr' | 'translation' | 'summary';
  content: string;
  loading: boolean;
  error?: string;
}

export interface AIRequestOptions {
  model?: string;
  apiKey?: string;
  targetLanguage?: string;
}

export interface VisionRequest {
  image: Blob | string; // Blob or Base64 string
  prompt?: string;
}
