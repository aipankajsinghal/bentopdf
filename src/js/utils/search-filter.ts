/**
 * Enhanced Search Functionality
 * Provides fuzzy search and improved filtering for tools
 */

interface Tool {
  name: string;
  description: string;
  category: string;
  keywords?: string[];
  element?: HTMLElement;
}

export class EnhancedSearch {
  private tools: Tool[] = [];
  private searchInput: HTMLInputElement | null = null;
  
  constructor() {
    this.init();
  }

  private init() {
    this.searchInput = document.getElementById('search-bar') as HTMLInputElement;
    if (!this.searchInput) return;

    // Index all tools
    this.indexTools();

    // Add search listeners
    this.searchInput.addEventListener('input', this.handleSearch.bind(this));
    this.searchInput.addEventListener('focus', this.showSearchSuggestions.bind(this));

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.searchInput?.focus();
      }
      if (e.key === '/' && document.activeElement !== this.searchInput) {
        e.preventDefault();
        this.searchInput?.focus();
      }
    });
  }

  private indexTools() {
    const toolCards = document.querySelectorAll('.tool-card');
    
    toolCards.forEach((card) => {
      const nameEl = card.querySelector('h3');
      const descEl = card.querySelector('p');
      const categoryEl = card.closest('[data-category]');
      
      if (nameEl && descEl) {
        this.tools.push({
          name: nameEl.textContent || '',
          description: descEl.textContent || '',
          category: categoryEl?.getAttribute('data-category') || '',
          element: card as HTMLElement,
        });
      }
    });
  }

  private handleSearch(e: Event) {
    const searchTerm = (e.target as HTMLInputElement).value.toLowerCase().trim();
    
    if (!searchTerm) {
      this.showAllTools();
      return;
    }

    const results = this.fuzzySearch(searchTerm);
    this.displayResults(results);
    this.highlightMatches(searchTerm);
  }

  private fuzzySearch(searchTerm: string): Tool[] {
    return this.tools.filter(tool => {
      const searchable = `${tool.name} ${tool.description} ${tool.category}`.toLowerCase();
      
      // Exact match
      if (searchable.includes(searchTerm)) {
        return true;
      }

      // Fuzzy match - allow some characters in between
      let termIndex = 0;
      for (let i = 0; i < searchable.length && termIndex < searchTerm.length; i++) {
        if (searchable[i] === searchTerm[termIndex]) {
          termIndex++;
        }
      }
      
      return termIndex === searchTerm.length;
    });
  }

  private displayResults(results: Tool[]) {
    // Hide all tools first
    this.tools.forEach(tool => {
      if (tool.element) {
        tool.element.style.display = 'none';
        tool.element.classList.remove('search-highlight');
      }
    });

    // Show matching tools
    results.forEach(tool => {
      if (tool.element) {
        tool.element.style.display = '';
        tool.element.classList.add('search-highlight');
      }
    });

    // Show "no results" message if needed
    this.updateNoResultsMessage(results.length === 0);
  }

  private showAllTools() {
    this.tools.forEach(tool => {
      if (tool.element) {
        tool.element.style.display = '';
        tool.element.classList.remove('search-highlight');
      }
    });
    this.updateNoResultsMessage(false);
  }

  private highlightMatches(searchTerm: string) {
    // Add visual highlighting to matching text
    // This is simplified - you could use a library like mark.js for more advanced highlighting
  }

  private showSearchSuggestions() {
    // Could show popular searches or recent searches
  }

  private updateNoResultsMessage(show: boolean) {
    let noResults = document.getElementById('no-results-message');
    
    if (show && !noResults) {
      noResults = document.createElement('div');
      noResults.id = 'no-results-message';
      noResults.className = 'col-span-full text-center py-12';
      noResults.innerHTML = `
        <div class="text-gray-400">
          <svg class="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-lg font-medium mb-2">No tools found</p>
          <p class="text-sm">Try a different search term or browse all tools</p>
        </div>
      `;
      
      const toolGrid = document.getElementById('tool-grid');
      toolGrid?.appendChild(noResults);
    } else if (!show && noResults) {
      noResults.remove();
    }
  }
}

/**
 * Category Filter System
 */
export class CategoryFilter {
  private categories: string[] = [];
  private activeFilters: Set<string> = new Set();

  constructor() {
    this.init();
  }

  private init() {
    this.extractCategories();
    this.createFilterUI();
  }

  private extractCategories() {
    const categoryElements = document.querySelectorAll('[data-category]');
    const categoriesSet = new Set<string>();
    
    categoryElements.forEach(el => {
      const category = el.getAttribute('data-category');
      if (category) categoriesSet.add(category);
    });
    
    this.categories = Array.from(categoriesSet);
  }

  private createFilterUI() {
    const toolsHeader = document.getElementById('tools-header');
    if (!toolsHeader) return;

    const filterContainer = document.createElement('div');
    filterContainer.className = 'flex flex-wrap gap-2 justify-center mb-8';
    filterContainer.innerHTML = `
      <button class="filter-btn active" data-filter="all">
        All Tools
      </button>
      ${this.categories.map(cat => `
        <button class="filter-btn" data-filter="${cat}">
          ${cat}
        </button>
      `).join('')}
    `;

    toolsHeader.appendChild(filterContainer);

    // Add click handlers
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', this.handleFilterClick.bind(this));
    });
  }

  private handleFilterClick(e: Event) {
    const btn = e.target as HTMLButtonElement;
    const filter = btn.getAttribute('data-filter');
    
    if (!filter) return;

    // Update active state
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Apply filter
    if (filter === 'all') {
      this.showAllTools();
    } else {
      this.filterByCategory(filter);
    }
  }

  private showAllTools() {
    document.querySelectorAll('[data-category]').forEach(el => {
      (el as HTMLElement).style.display = '';
    });
  }

  private filterByCategory(category: string) {
    document.querySelectorAll('[data-category]').forEach(el => {
      const elCategory = el.getAttribute('data-category');
      (el as HTMLElement).style.display = elCategory === category ? '' : 'none';
    });
  }
}

// Export initialization function
export function initSearchAndFilter() {
  new EnhancedSearch();
  // CategoryFilter can be enabled when data-category attributes are added
  // new CategoryFilter();
}
