/**
 * UI Enhancement Utilities
 * Provides improved user experience with loading states, animations, and visual feedback
 */

/**
 * Add loading skeleton to tool cards while they load
 */
export function showLoadingSkeleton(container: HTMLElement) {
  const skeleton = document.createElement('div');
  skeleton.className = 'tool-card loading';
  skeleton.innerHTML = `
    <div class="h-12 w-12 bg-gray-700 rounded mb-3"></div>
    <div class="h-4 bg-gray-700 rounded mb-2"></div>
    <div class="h-3 bg-gray-700 rounded w-3/4"></div>
  `;
  container.appendChild(skeleton);
}

/**
 * Create a progress indicator for file processing
 */
export function createProgressIndicator(message: string = 'Processing...'): HTMLElement {
  const container = document.createElement('div');
  container.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
  container.innerHTML = `
    <div class="bg-gray-800 p-8 rounded-lg flex flex-col items-center gap-4 border border-gray-700 shadow-xl max-w-md">
      <div class="relative w-16 h-16">
        <svg class="animate-spin h-16 w-16 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <p class="text-white text-lg font-medium">${message}</p>
      <div class="w-full bg-gray-700 rounded-full h-2">
        <div class="progress-bar bg-indigo-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
      </div>
      <p class="text-gray-400 text-sm">Please wait...</p>
    </div>
  `;
  return container;
}

/**
 * Update progress bar percentage
 */
export function updateProgress(container: HTMLElement, percent: number) {
  const progressBar = container.querySelector('.progress-bar') as HTMLElement;
  if (progressBar) {
    progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

/**
 * Add smooth scroll to top functionality
 */
export function initSmoothScroll() {
  const scrollBtn = document.getElementById('scroll-to-top-btn');
  if (!scrollBtn) return;

  // Show/hide button based on scroll position
  const toggleButton = () => {
    if (window.scrollY > 300) {
      scrollBtn.classList.add('visible');
    } else {
      scrollBtn.classList.remove('visible');
    }
  };

  window.addEventListener('scroll', toggleButton, { passive: true });
  
  scrollBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

/**
 * Add intersection observer for lazy loading images
 */
export function initLazyLoading() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            observer.unobserve(img);
          }
        }
      });
    }, {
      rootMargin: '50px 0px',
      threshold: 0.01
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }
}

/**
 * Add drag and drop visual feedback
 */
export function enhanceDragDrop(dropZone: HTMLElement) {
  dropZone.classList.add('drop-zone');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', () => {
    dropZone.classList.remove('drag-over');
  });
}

/**
 * Add toast notification system
 */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) {
  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-indigo-600'
  };
  
  const icons = {
    success: '✓',
    error: '✗',
    info: 'ℹ'
  };

  toast.className = `fixed bottom-4 right-4 ${bgColors[type]} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-slide-in`;
  toast.innerHTML = `
    <span class="text-2xl">${icons[type]}</span>
    <span class="font-medium">${message}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('animate-slide-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Add keyboard shortcut hint overlay
 */
export function showKeyboardHints() {
  const hints = [
    { key: 'Ctrl/⌘ + K', action: 'Open search' },
    { key: 'Esc', action: 'Close modals' },
    { key: '/', action: 'Focus search' },
  ];

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4';
  overlay.innerHTML = `
    <div class="bg-gray-800 rounded-xl p-6 max-w-md border border-gray-700">
      <h3 class="text-xl font-bold text-white mb-4">Keyboard Shortcuts</h3>
      <div class="space-y-3">
        ${hints.map(hint => `
          <div class="flex justify-between items-center">
            <span class="text-gray-300">${hint.action}</span>
            <kbd class="bg-gray-700 px-3 py-1 rounded text-sm font-mono text-gray-200">${hint.key}</kbd>
          </div>
        `).join('')}
      </div>
      <button class="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition-colors">
        Got it!
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('button');
  closeBtn?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/**
 * Add search highlighting
 */
export function highlightSearchResults(searchTerm: string) {
  const toolCards = document.querySelectorAll('.tool-card');
  
  toolCards.forEach(card => {
    const title = card.querySelector('h3');
    const description = card.querySelector('p');
    
    if (title && description) {
      const titleText = title.textContent || '';
      const descText = description.textContent || '';
      
      if (searchTerm && (titleText.toLowerCase().includes(searchTerm.toLowerCase()) || 
          descText.toLowerCase().includes(searchTerm.toLowerCase()))) {
        card.classList.add('ring-2', 'ring-indigo-500');
      } else {
        card.classList.remove('ring-2', 'ring-indigo-500');
      }
    }
  });
}

/**
 * Add animation classes
 */
export const animations = {
  fadeIn: 'animate-fade-in',
  fadeOut: 'animate-fade-out',
  slideIn: 'animate-slide-in',
  slideOut: 'animate-slide-out',
  scaleIn: 'animate-scale-in',
  scaleOut: 'animate-scale-out',
};

// Add CSS animations to the page
export function initAnimations() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    
    @keyframes slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slide-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes scale-in {
      from { transform: scale(0.9); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    
    @keyframes scale-out {
      from { transform: scale(1); opacity: 1; }
      to { transform: scale(0.9); opacity: 0; }
    }
    
    .animate-fade-in { animation: fade-in 0.3s ease-out; }
    .animate-fade-out { animation: fade-out 0.3s ease-out; }
    .animate-slide-in { animation: slide-in 0.3s ease-out; }
    .animate-slide-out { animation: slide-out 0.3s ease-out; }
    .animate-scale-in { animation: scale-in 0.3s ease-out; }
    .animate-scale-out { animation: scale-out 0.3s ease-out; }
  `;
  document.head.appendChild(style);
}
