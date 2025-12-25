/**
 * Recent & Favorite Tools Manager
 * Tracks user's recently used tools and favorites
 */

interface ToolUsage {
  path: string;
  name: string;
  timestamp: number;
  usageCount: number;
}

export class ToolsManager {
  private static STORAGE_KEY_RECENT = 'bentopdf_recent_tools';
  private static STORAGE_KEY_FAVORITES = 'bentopdf_favorite_tools';
  private static MAX_RECENT = 6;

  /**
   * Track tool usage
   */
  static trackToolUsage(toolPath: string, toolName: string) {
    const recent = this.getRecentTools();
    
    // Find existing entry or create new one
    const existingIndex = recent.findIndex(t => t.path === toolPath);
    
    if (existingIndex >= 0) {
      // Update existing entry
      recent[existingIndex].timestamp = Date.now();
      recent[existingIndex].usageCount++;
      
      // Move to front
      const [tool] = recent.splice(existingIndex, 1);
      recent.unshift(tool);
    } else {
      // Add new entry at the front
      recent.unshift({
        path: toolPath,
        name: toolName,
        timestamp: Date.now(),
        usageCount: 1,
      });
    }

    // Keep only the most recent MAX_RECENT tools
    const trimmed = recent.slice(0, this.MAX_RECENT);
    
    localStorage.setItem(this.STORAGE_KEY_RECENT, JSON.stringify(trimmed));
    
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('recentToolsUpdated', { 
      detail: { tools: trimmed } 
    }));
  }

  /**
   * Get recent tools
   */
  static getRecentTools(): ToolUsage[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_RECENT);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Error loading recent tools:', e);
      return [];
    }
  }

  /**
   * Toggle favorite status of a tool
   */
  static toggleFavorite(toolPath: string, toolName: string): boolean {
    const favorites = this.getFavoriteTools();
    const index = favorites.findIndex(t => t.path === toolPath);
    
    let isFavorite: boolean;
    
    if (index >= 0) {
      // Remove from favorites
      favorites.splice(index, 1);
      isFavorite = false;
    } else {
      // Add to favorites
      favorites.push({
        path: toolPath,
        name: toolName,
        timestamp: Date.now(),
        usageCount: 0,
      });
      isFavorite = true;
    }

    localStorage.setItem(this.STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
    
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('favoritesUpdated', { 
      detail: { tools: favorites, path: toolPath, isFavorite } 
    }));
    
    return isFavorite;
  }

  /**
   * Get favorite tools
   */
  static getFavoriteTools(): ToolUsage[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_FAVORITES);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Error loading favorite tools:', e);
      return [];
    }
  }

  /**
   * Check if a tool is favorited
   */
  static isFavorite(toolPath: string): boolean {
    const favorites = this.getFavoriteTools();
    return favorites.some(t => t.path === toolPath);
  }

  /**
   * Clear all recent tools
   */
  static clearRecentTools() {
    localStorage.removeItem(this.STORAGE_KEY_RECENT);
    window.dispatchEvent(new CustomEvent('recentToolsUpdated', { 
      detail: { tools: [] } 
    }));
  }

  /**
   * Clear all favorites
   */
  static clearFavorites() {
    localStorage.removeItem(this.STORAGE_KEY_FAVORITES);
    window.dispatchEvent(new CustomEvent('favoritesUpdated', { 
      detail: { tools: [] } 
    }));
  }

  /**
   * Create UI for recent/favorite tools
   */
  static createQuickAccessUI(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'quick-access';
    container.className = 'mb-8';

    const recent = this.getRecentTools();
    const favorites = this.getFavoriteTools();

    if (recent.length === 0 && favorites.length === 0) {
      return container; // Return empty if no tools
    }

    container.innerHTML = `
      <div class="max-w-6xl mx-auto">
        ${favorites.length > 0 ? `
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
              </svg>
              Favorite Tools
            </h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              ${favorites.map(tool => this.createQuickAccessCard(tool, true)).join('')}
            </div>
          </div>
        ` : ''}
        
        ${recent.length > 0 ? `
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                Recent Tools
              </h3>
              <button onclick="ToolsManager.clearRecentTools()" class="text-xs text-gray-400 hover:text-white transition-colors">
                Clear all
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              ${recent.map(tool => this.createQuickAccessCard(tool, false)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    return container;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private static escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Create a quick access card for a tool
   */
  private static createQuickAccessCard(tool: ToolUsage, isFavorite: boolean): string {
    const escapedPath = this.escapeHtml(tool.path);
    const escapedName = this.escapeHtml(tool.name);
    
    return `
      <a href="${escapedPath}" 
         class="group quick-access-card bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-indigo-500 rounded-lg p-3 transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
         data-tool-path="${escapedPath}"
         data-tool-name="${escapedName}">
        <div class="flex items-start justify-between mb-2">
          <svg class="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          ${isFavorite ? `
            <button class="favorite-toggle-btn text-yellow-400 hover:text-yellow-300 transition-colors"
                    aria-label="Remove from favorites">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
              </svg>
            </button>
          ` : ''}
        </div>
        <p class="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors line-clamp-2">
          ${escapedName}
        </p>
      </a>
    `;
  }

  /**
   * Update the UI when recent/favorites change
   */
  static updateQuickAccessUI() {
    const existing = document.getElementById('quick-access');
    const newUI = this.createQuickAccessUI();
    
    if (existing) {
      existing.replaceWith(newUI);
    } else {
      // Insert before tools header
      const toolsHeader = document.getElementById('tools-header');
      if (toolsHeader) {
        toolsHeader.before(newUI);
      }
    }
    
    // Add event delegation for favorite buttons
    newUI.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest('.favorite-toggle-btn');
      
      if (button) {
        e.preventDefault();
        const card = button.closest('a');
        if (card) {
          const toolPath = card.getAttribute('data-tool-path');
          const toolName = card.getAttribute('data-tool-name');
          if (toolPath && toolName) {
            this.toggleFavorite(toolPath, toolName);
          }
        }
      }
    });
  }

  /**
   * Add favorite button to tool cards
   */
  static addFavoriteButtons() {
    document.querySelectorAll('.tool-card').forEach(card => {
      const link = card.querySelector('a');
      if (!link) return;
      
      const toolPath = link.getAttribute('href') || '';
      const toolName = card.querySelector('h3')?.textContent || '';
      const isFav = this.isFavorite(toolPath);

      // Check if button already exists
      if (card.querySelector('.favorite-btn')) return;

      const favoriteBtn = document.createElement('button');
      favoriteBtn.className = `favorite-btn absolute top-2 right-2 p-2 rounded-full hover:bg-gray-700 transition-colors z-10 ${isFav ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`;
      favoriteBtn.innerHTML = `
        <svg class="w-5 h-5" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
        </svg>
      `;

      favoriteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const newState = this.toggleFavorite(toolPath, toolName);
        
        // Update button appearance
        if (newState) {
          favoriteBtn.classList.remove('text-gray-500');
          favoriteBtn.classList.add('text-yellow-400');
          favoriteBtn.querySelector('svg')?.setAttribute('fill', 'currentColor');
        } else {
          favoriteBtn.classList.remove('text-yellow-400');
          favoriteBtn.classList.add('text-gray-500');
          favoriteBtn.querySelector('svg')?.setAttribute('fill', 'none');
        }
      };

      // Make card position relative
      (card as HTMLElement).style.position = 'relative';
      card.appendChild(favoriteBtn);
    });
  }
}

// Initialize on page load
export function initToolsManager() {
  // Update UI on page load
  ToolsManager.updateQuickAccessUI();
  
  // Add favorite buttons to tool cards
  ToolsManager.addFavoriteButtons();
  
  // Listen for updates
  window.addEventListener('recentToolsUpdated', () => {
    ToolsManager.updateQuickAccessUI();
  });
  
  window.addEventListener('favoritesUpdated', () => {
    ToolsManager.updateQuickAccessUI();
  });
  
  // Track current tool usage if on a tool page
  const currentPath = window.location.pathname;
  if (currentPath !== '/' && currentPath !== '/index.html') {
    const toolName = document.querySelector('h1')?.textContent || document.title;
    ToolsManager.trackToolUsage(currentPath, toolName);
  }
}

// Make ToolsManager available globally for onclick handlers
(window as any).ToolsManager = ToolsManager;
