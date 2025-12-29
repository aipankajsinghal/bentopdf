// Ribbon UI renderer - Office-style compact toolbar
import { ribbonConfig, RibbonTab, RibbonGroup, RibbonTool } from './config/ribbon.js';
import { createIcons, icons } from 'lucide';

// State callbacks - set by documentManager to avoid circular dependency
let hasAnyDocumentFn: () => boolean = () => false;
let getActiveDocumentFn: () => any = () => null;

export function setDocumentStateCallbacks(
  hasAnyDoc: () => boolean,
  getActiveDoc: () => any
): void {
  hasAnyDocumentFn = hasAnyDoc;
  getActiveDocumentFn = getActiveDoc;
}

let activeTabId = 'home';
let expandedMode = false;
let openDropdown: HTMLElement | null = null;

// Tool action handlers registry
type ToolHandler = () => void | Promise<void>;
const toolHandlers: Map<string, ToolHandler> = new Map();

export function registerToolHandler(toolId: string, handler: ToolHandler): void {
  toolHandlers.set(toolId, handler);
}

export function executeToolAction(toolId: string): void {
  const handler = toolHandlers.get(toolId);
  if (handler) {
    handler();
  } else {
    console.warn(`No handler registered for tool: ${toolId}`);
  }
}

// Initialize ribbon
export function initRibbon(): void {
  const ribbonContainer = document.getElementById('ribbon');
  if (!ribbonContainer) return;

  renderRibbon(ribbonContainer);
  setupRibbonEvents();
  updateToolStates();
}

// Render the complete ribbon
function renderRibbon(container: HTMLElement): void {
  container.innerHTML = `
    <div class="ribbon-tabs flex items-center border-b border-gray-700 bg-gray-800 px-2">
      <div class="flex items-center gap-1 mr-4">
        <img src="/images/favicon.svg" alt="BentoPDF" class="h-5 w-5" />
        <span class="text-white font-semibold text-sm hidden sm:inline">BentoPDF</span>
      </div>
      <div class="flex-1 flex items-center gap-1" id="ribbon-tab-buttons">
        ${ribbonConfig.map(tab => `
          <button class="ribbon-tab px-3 py-1.5 text-xs font-medium rounded-t transition-colors
            ${tab.id === activeTabId ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}"
            data-tab="${tab.id}">
            ${tab.name}
          </button>
        `).join('')}
      </div>
      <div class="flex items-center gap-2">
        <button id="ribbon-expand-toggle" class="p-1 text-gray-400 hover:text-white transition-colors" title="Toggle ribbon size">
          <i data-lucide="${expandedMode ? 'chevrons-down' : 'chevrons-up'}" class="w-4 h-4"></i>
        </button>
        <button id="settings-btn" class="p-1 text-gray-400 hover:text-white transition-colors" title="Settings">
          <i data-lucide="settings" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
    <div class="ribbon-panel bg-gray-800/80 border-b border-gray-700 ${expandedMode ? 'py-2' : 'py-1'} px-2" id="ribbon-panel">
      ${renderActiveTabPanel()}
    </div>
  `;
  createIcons({ icons });
}

// Render active tab's panel content
function renderActiveTabPanel(): string {
  const tab = ribbonConfig.find(t => t.id === activeTabId);
  if (!tab) return '';

  return `
    <div class="flex items-start gap-1 overflow-x-auto">
      ${tab.groups.map(group => renderGroup(group)).join('')}
    </div>
  `;
}

// Render a group of tools
function renderGroup(group: RibbonGroup): string {
  return `
    <div class="ribbon-group flex flex-col items-center px-2 border-r border-gray-700 last:border-r-0">
      <div class="flex items-center gap-0.5">
        ${group.tools.map(tool => renderTool(tool)).join('')}
      </div>
      ${expandedMode ? `<span class="ribbon-group-label text-[9px] text-gray-500 uppercase mt-1">${group.name}</span>` : ''}
    </div>
  `;
}

// Render individual tool button
function renderTool(tool: RibbonTool): string {
  const isDropdown = tool.type === 'dropdown' || tool.type === 'split';
  const hasDoc = hasAnyDocumentFn();
  const disabled = !hasDoc && !['open-file', 'image-to-pdf-group', 'text-to-pdf', 'json-to-pdf'].includes(tool.id) && !tool.id.includes('-to-pdf');

  if (isDropdown) {
    return `
      <div class="ribbon-dropdown relative" data-tool-id="${tool.id}">
        <button class="ribbon-btn flex items-center gap-0.5 px-2 py-1.5 rounded text-gray-300 hover:bg-gray-700 hover:text-white transition-colors
          ${disabled ? 'opacity-40 pointer-events-none' : ''}"
          data-tool="${tool.id}" title="${tool.tooltip || tool.name}">
          <i data-lucide="${tool.icon}" class="w-4 h-4"></i>
          ${expandedMode ? `<span class="text-xs">${tool.name}</span>` : ''}
          <i data-lucide="chevron-down" class="w-3 h-3 ml-0.5"></i>
        </button>
        <div class="ribbon-dropdown-menu hidden absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 min-w-[160px] py-1">
          ${tool.children?.map(child => `
            <button class="ribbon-dropdown-item w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white text-left"
              data-tool="${child.id}" title="${child.tooltip || child.name}">
              <i data-lucide="${child.icon}" class="w-4 h-4"></i>
              <span>${child.name}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <button class="ribbon-btn flex items-center gap-1 px-2 py-1.5 rounded text-gray-300 hover:bg-gray-700 hover:text-white transition-colors
      ${disabled ? 'opacity-40 pointer-events-none' : ''}"
      data-tool="${tool.id}" title="${tool.tooltip || tool.name}">
      <i data-lucide="${tool.icon}" class="w-4 h-4"></i>
      ${expandedMode ? `<span class="text-xs">${tool.name}</span>` : ''}
    </button>
  `;
}

// Setup event listeners
function setupRibbonEvents(): void {
  const container = document.getElementById('ribbon');
  if (!container) return;

  // Tab switching
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Tab click
    const tabBtn = target.closest('[data-tab]') as HTMLElement;
    if (tabBtn) {
      const tabId = tabBtn.dataset.tab;
      if (tabId && tabId !== activeTabId) {
        activeTabId = tabId;
        renderRibbon(container);
      }
      return;
    }

    // Dropdown toggle
    const dropdownBtn = target.closest('.ribbon-dropdown > .ribbon-btn') as HTMLElement;
    if (dropdownBtn) {
      const dropdown = dropdownBtn.parentElement;
      const menu = dropdown?.querySelector('.ribbon-dropdown-menu') as HTMLElement;
      if (menu) {
        closeOpenDropdown();
        menu.classList.remove('hidden');
        openDropdown = menu;
        e.stopPropagation();
      }
      return;
    }

    // Tool button click (non-dropdown)
    const toolBtn = target.closest('[data-tool]') as HTMLElement;
    if (toolBtn && !toolBtn.classList.contains('opacity-40')) {
      const toolId = toolBtn.dataset.tool;
      if (toolId) {
        closeOpenDropdown();
        executeToolAction(toolId);
      }
      return;
    }

    // Expand toggle
    if (target.closest('#ribbon-expand-toggle')) {
      expandedMode = !expandedMode;
      localStorage.setItem('ribbon-expanded', expandedMode ? 'true' : 'false');
      renderRibbon(container);
      return;
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    closeOpenDropdown();
  });

  // Keyboard shortcut for ribbon collapse
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'F1') {
      e.preventDefault();
      expandedMode = !expandedMode;
      localStorage.setItem('ribbon-expanded', expandedMode ? 'true' : 'false');
      renderRibbon(container);
    }
  });

  // Load expanded preference
  expandedMode = localStorage.getItem('ribbon-expanded') === 'true';
}

function closeOpenDropdown(): void {
  if (openDropdown) {
    openDropdown.classList.add('hidden');
    openDropdown = null;
  }
}

// Update tool enable/disable states based on document state
export function updateToolStates(): void {
  const container = document.getElementById('ribbon');
  if (!container) return;

  const hasDoc = hasAnyDocumentFn();
  const activeDoc = getActiveDocumentFn();
  const canUndo = activeDoc?.undoStack?.length > 0;
  const canRedo = activeDoc?.redoStack?.length > 0;

  // Update all tool buttons
  container.querySelectorAll('[data-tool]').forEach((btn) => {
    const toolId = (btn as HTMLElement).dataset.tool;
    if (!toolId) return;

    // Tools that should always be enabled
    const alwaysEnabled = ['open-file', 'image-to-pdf-group', 'text-to-pdf', 'json-to-pdf'];
    const isConvertToPdf = toolId.includes('-to-pdf') && !toolId.includes('pdf-to-');

    if (alwaysEnabled.includes(toolId) || isConvertToPdf) {
      btn.classList.remove('opacity-40', 'pointer-events-none');
      return;
    }

    // Special handling for undo/redo
    if (toolId === 'undo') {
      btn.classList.toggle('opacity-40', !canUndo);
      btn.classList.toggle('pointer-events-none', !canUndo);
      return;
    }
    if (toolId === 'redo') {
      btn.classList.toggle('opacity-40', !canRedo);
      btn.classList.toggle('pointer-events-none', !canRedo);
      return;
    }

    // All other tools require a document
    btn.classList.toggle('opacity-40', !hasDoc);
    btn.classList.toggle('pointer-events-none', !hasDoc);
  });
}

// Switch to a specific tab programmatically
export function switchToTab(tabId: string): void {
  if (ribbonConfig.find(t => t.id === tabId)) {
    activeTabId = tabId;
    const container = document.getElementById('ribbon');
    if (container) {
      renderRibbon(container);
    }
  }
}

// Get current active tab
export function getActiveTab(): string {
  return activeTabId;
}
