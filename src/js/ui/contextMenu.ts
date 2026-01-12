import { aiPanel } from './aiPanel.js';
import { createIcons, icons } from 'lucide';

export function initContextMenu() {
    const textLayer = document.getElementById('text-layer');
    if (!textLayer) return;

    // Create Menu Element
    const menuInfo = createContextMenuElement();

    // Listen on document to handle closing
    document.addEventListener('click', (e) => {
        if (!menuInfo.contains(e.target as Node)) {
            hideContextMenu(menuInfo);
        }
    });
    
    // Check for right click on text layer (or essentially anywhere in viewer area)
    const viewerArea = document.getElementById('viewer-area');
    if (viewerArea) {
        viewerArea.addEventListener('contextmenu', (e) => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
                e.preventDefault();
                showContextMenu(menuInfo, e.clientX, e.clientY, selection.toString());
            }
        });
    }
}

function createContextMenuElement(): HTMLElement {
    let menu = document.getElementById('custom-context-menu');
    if (menu) return menu;

    menu = document.createElement('div');
    menu.id = 'custom-context-menu';
    menu.className = 'fixed hidden bg-gray-800 border border-gray-700 rounded shadow-xl z-50 flex flex-col py-1 min-w-[150px]';
    
    // Items
    menu.innerHTML = `
        <button id="ctx-summarize" class="flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 w-full text-left">
            <i data-lucide="file-text" class="w-4 h-4 text-indigo-400"></i> Summarize
        </button>
        <button id="ctx-translate" class="flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 w-full text-left">
            <i data-lucide="languages" class="w-4 h-4 text-green-400"></i> Translate
        </button>
    `;

    document.body.appendChild(menu);
    createIcons({ icons, nameAttr: 'data-lucide', attrs: {class: "w-4 h-4"} });
    
    return menu;
}

function showContextMenu(menu: HTMLElement, x: number, y: number, selectedText: string) {
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('hidden');

    // Attach handlers
    const btnSummarize = menu.querySelector('#ctx-summarize');
    const btnTranslate = menu.querySelector('#ctx-translate');

    const handleSummarize = () => {
        aiPanel.toggle(true);
        // We'll need to expose a method in AIPanel to handle direct text input
        // For now, let's assume we can set the text area or call a method
        aiPanel.runSummarizeText(selectedText);
        hideContextMenu(menu);
    };

    const handleTranslate = () => {
        aiPanel.toggle(true);
        aiPanel.runTranslateText(selectedText);
        hideContextMenu(menu);
    };

    // Clean old listeners - naive approach using clone or one-time
    // Better: use onclick
    if(btnSummarize) (btnSummarize as HTMLElement).onclick = handleSummarize;
    if(btnTranslate) (btnTranslate as HTMLElement).onclick = handleTranslate;
}

function hideContextMenu(menu: HTMLElement) {
    menu.classList.add('hidden');
}
