export function showInputModal(title: string, initialValue: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const wrapper = document.createElement('div');
    wrapper.id = 'input-modal';
    wrapper.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
    wrapper.innerHTML = `
      <div class="bg-gray-800 rounded-lg border border-gray-700 shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
        <div class="px-6 py-4 border-b border-gray-700">
          <h3 class="text-xl font-bold text-white">${title}</h3>
        </div>
        <div class="p-6">
          <textarea id="modal-input" class="w-full h-32 bg-gray-900 border border-gray-600 rounded p-3 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none" placeholder="Enter text here...">${initialValue}</textarea>
        </div>
        <div class="flex items-center justify-end gap-3 px-6 py-4 bg-gray-800/50 border-t border-gray-700">
          <button id="modal-cancel" class="px-4 py-2 rounded text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">Cancel</button>
          <button id="modal-ok" class="px-6 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors">Add Text</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);

    const input = wrapper.querySelector('#modal-input') as HTMLTextAreaElement;
    const okBtn = wrapper.querySelector('#modal-ok') as HTMLButtonElement;
    const cancelBtn = wrapper.querySelector('#modal-cancel') as HTMLButtonElement;

    // Focus input
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 50);

    const cleanup = () => {
      wrapper.remove();
    };

    const handleOk = () => {
      const val = input.value.trim();
      resolve(val || null);
      cleanup();
    };

    const handleCancel = () => {
      resolve(null);
      cleanup();
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
    
    // Close on click outside
    wrapper.addEventListener('click', (e) => {
      if (e.target === wrapper) {
        handleCancel();
      }
    });

    // Handle keys
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
      if (e.key === 'Enter' && e.ctrlKey) {
        handleOk();
      }
    });
  });
}
