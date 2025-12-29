// State management - document-centric model
// Note: Primary state is now managed in documentManager.ts
// This file provides global app state and legacy compatibility

export interface AppState {
  activeRibbonTab: string;
  isProcessing: boolean;
  selectedPageIndices: number[];
  // Legacy fields kept for compatibility with existing logic modules
  activeTool?: string | null;
  files?: File[];
  pdfDoc?: any;
  pdfPages?: any[];
  currentPdfUrl?: string | null;
}

export const state: AppState = {
  activeRibbonTab: 'home',
  isProcessing: false,
  selectedPageIndices: [],
  activeTool: null,
  files: [],
  pdfDoc: null,
  pdfPages: [],
  currentPdfUrl: null,
};

// Page selection for multi-page operations
export function selectPage(index: number): void {
  if (!state.selectedPageIndices.includes(index)) {
    state.selectedPageIndices.push(index);
    state.selectedPageIndices.sort((a, b) => a - b);
  }
}

export function deselectPage(index: number): void {
  const idx = state.selectedPageIndices.indexOf(index);
  if (idx !== -1) {
    state.selectedPageIndices.splice(idx, 1);
  }
}

export function togglePageSelection(index: number): void {
  if (state.selectedPageIndices.includes(index)) {
    deselectPage(index);
  } else {
    selectPage(index);
  }
}

export function selectAllPages(count: number): void {
  state.selectedPageIndices = Array.from({ length: count }, (_, i) => i);
}

export function clearPageSelection(): void {
  state.selectedPageIndices = [];
}

export function getSelectedPages(): number[] {
  return [...state.selectedPageIndices];
}

export function isPageSelected(index: number): boolean {
  return state.selectedPageIndices.includes(index);
}

// Processing state
export function setProcessing(processing: boolean): void {
  state.isProcessing = processing;
  const loaderModal = document.getElementById('loader-modal');
  if (loaderModal) {
    loaderModal.classList.toggle('hidden', !processing);
  }
}

export function isProcessing(): boolean {
  return state.isProcessing;
}

// Legacy reset for compatibility during transition
export function resetState(): void {
  state.selectedPageIndices = [];
  state.isProcessing = false;
  state.activeTool = null;
  state.files = [];
  state.pdfDoc = null;
  state.pdfPages = [];
  state.currentPdfUrl = null;
}
