import { getActiveDocument } from './documentManager.js';
import { searchState } from './state-search.js';
import { goToPage } from './viewer.js';

export function initSearch() {
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const toggleBtn = document.getElementById('search-toggle-btn');
  const closeBtn = document.getElementById('search-close-btn');
  const container = document.getElementById('search-bar-container');
  const prevBtn = document.getElementById('search-prev-btn');
  const nextBtn = document.getElementById('search-next-btn');

  if (toggleBtn && container && closeBtn) {
    toggleBtn.addEventListener('click', () => {
      container.classList.remove('hidden');
      container.classList.add('flex');
      toggleBtn.classList.add('hidden');
      searchInput.focus();
    });

    closeBtn.addEventListener('click', () => {
      container.classList.add('hidden');
      container.classList.remove('flex');
      toggleBtn.classList.remove('hidden');
      clearSearch();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value;
        if (query) {
           await performSearch(query);
        }
      }
    });
  }

  prevBtn?.addEventListener('click', () => navigateSearch(-1));
  nextBtn?.addEventListener('click', () => navigateSearch(1));
  
  // Shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      container?.classList.remove('hidden');
      container?.classList.add('flex');
      toggleBtn?.classList.add('hidden');
      searchInput?.focus();
    }
  });
}

function clearSearch() {
    searchState.query = '';
    searchState.matches = [];
    searchState.currentMatchIndex = -1;
    updateSearchCount();
    // TODO: Clear highlights in viewer (needs integration with render logic)
    // We can trigger a re-render or remove highlight layer
    document.querySelectorAll('.text-highlight').forEach(el => el.remove());
}

async function performSearch(query: string) {
    const doc = getActiveDocument();
    if (!doc || !doc.pdfJsDoc) return;
    
    // Clear previous
    searchState.matches = [];
    searchState.query = query;
    searchState.isSearching = true;
    
    const numPages = doc.pdfJsDoc.numPages;
    const lowerQuery = query.toLowerCase();

    // Iterate all pages (simple naive search)
    // For large docs, this should be chunked/async
    for (let i = 1; i <= numPages; i++) {
        const page = await doc.pdfJsDoc.getPage(i);
        const content = await page.getTextContent();
        
        // Simple string concat for now, robust search needs coordinate mapping
        const strings = content.items.map((item: any) => item.str).join(' ');
        
        // Naive match
        if (strings.toLowerCase().includes(lowerQuery)) {
            searchState.matches.push({ pageIndex: i, text: strings });
            // Ideally we store coordinates. TextLayerBuilder in pdf.js handles this better.
            // For BentoPDF's canvas rendering, we might need a hidden text layer
            // OR we just jump to page for now.
        }
    }
    
    searchState.currentMatchIndex = searchState.matches.length > 0 ? 0 : -1;
    updateSearchCount();
    
    if (searchState.currentMatchIndex >= 0) {
        const match = searchState.matches[0];
        await goToPage(match.pageIndex);
        // Trigger highlight render?
    }
}

function navigateSearch(direction: number) {
    if (searchState.matches.length === 0) return;
    
    let newIndex = searchState.currentMatchIndex + direction;
    if (newIndex >= searchState.matches.length) newIndex = 0;
    if (newIndex < 0) newIndex = searchState.matches.length - 1;
    
    searchState.currentMatchIndex = newIndex;
    updateSearchCount();
    
    const match = searchState.matches[newIndex];
    goToPage(match.pageIndex);
}

function updateSearchCount() {
    const el = document.getElementById('search-count');
    if (el) {
        if (searchState.matches.length === 0) {
            el.textContent = '0/0';
        } else {
            el.textContent = `${searchState.currentMatchIndex + 1}/${searchState.matches.length}`;
        }
    }
}
