import { getZoom } from '../viewer.js';
// Placement overlay allows user to drag a preview over the current canvas

export interface PlacementOptions {
  type: 'text' | 'image';
  text?: string;
  imageSrc?: string; // data URL
  widthPx?: number;
  heightPx?: number;
  opacity?: number; // 0..1
  fontSize?: number;
}

export interface PlacementResult {
  xNorm: number; // 0..1 (left)
  yNorm: number; // 0..1 (top)
  wNorm: number; // 0..1
  hNorm: number; // 0..1
  rotateDeg?: number;
}

export function showPlacementOverlay(opts: PlacementOptions): Promise<PlacementResult | null> {
  return new Promise((resolve) => {
    const canvas = document.getElementById('viewer-canvas') as HTMLCanvasElement;
    const viewerArea = document.getElementById('viewer-area') as HTMLElement;
    if (!canvas || !viewerArea) return resolve(null);

    const rect = canvas.getBoundingClientRect();

    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = `${rect.left + window.scrollX}px`;
    wrapper.style.top = `${rect.top + window.scrollY}px`;
    wrapper.style.width = `${rect.width}px`;
    wrapper.style.height = `${rect.height}px`;
    wrapper.style.zIndex = '9999';
    wrapper.style.pointerEvents = 'auto';

    const backdrop = document.createElement('div');
    backdrop.style.position = 'absolute';
    backdrop.style.inset = '0';
    backdrop.style.background = 'transparent';
    wrapper.appendChild(backdrop);

    const preview = document.createElement('div');
    preview.style.position = 'absolute';
    preview.style.cursor = 'grab';
    preview.style.userSelect = 'none';

    // set initial size
    const initW = opts.widthPx || Math.min(240, rect.width * 0.5);
    const initH = opts.heightPx || (opts.type === 'text' ? 60 : Math.min(120, rect.height * 0.2));
    preview.style.width = `${initW}px`;
    preview.style.height = `${initH}px`;
    preview.style.left = `${(rect.width - initW) / 2}px`;
    preview.style.top = `${(rect.height - initH) / 2}px`;

    if (opts.type === 'text') {
      preview.style.display = 'flex';
      preview.style.alignItems = 'center';
      preview.style.justifyContent = 'center';
      preview.style.color = 'rgba(32,32,32,0.8)';
      preview.style.fontSize = `${opts.fontSize || 36}px`;
      preview.textContent = opts.text || 'WATERMARK';
    } else {
      const img = document.createElement('img');
      img.src = opts.imageSrc || '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      preview.appendChild(img);
    }

    preview.style.opacity = String(opts.opacity ?? 0.9);
    preview.style.background = 'transparent';
    preview.style.border = '1px dashed rgba(255,255,255,0.35)';

    // Add resize handles (nw, ne, se, sw)
    const handles: Record<string, HTMLDivElement> = {};
    ['nw', 'ne', 'se', 'sw'].forEach((pos) => {
      const h = document.createElement('div');
      h.className = `resize-handle resize-${pos}`;
      h.style.position = 'absolute';
      h.style.width = '12px';
      h.style.height = '12px';
      h.style.background = 'rgba(255,255,255,0.2)';
      h.style.border = '1px solid rgba(0,0,0,0.4)';
      h.style.borderRadius = '2px';
      h.style.zIndex = '10000';
      switch (pos) {
        case 'nw': h.style.left = '-6px'; h.style.top = '-6px'; h.style.cursor = 'nwse-resize'; break;
        case 'ne': h.style.right = '-6px'; h.style.top = '-6px'; h.style.cursor = 'nesw-resize'; break;
        case 'se': h.style.right = '-6px'; h.style.bottom = '-6px'; h.style.cursor = 'nwse-resize'; break;
        case 'sw': h.style.left = '-6px'; h.style.bottom = '-6px'; h.style.cursor = 'nesw-resize'; break;
      }
      preview.appendChild(h);
      handles[pos] = h;
    });

    // Controls (apply/cancel) + ratio lock + rotation
    const controls = document.createElement('div');
    controls.style.position = 'absolute';
    controls.style.right = '8px';
    controls.style.top = '8px';
    controls.style.display = 'flex';
    controls.style.gap = '6px';
    controls.style.alignItems = 'center';

    const lockLabel = document.createElement('label');
    lockLabel.style.display = 'flex';
    lockLabel.style.alignItems = 'center';
    lockLabel.style.gap = '6px';
    const lockCheckbox = document.createElement('input');
    lockCheckbox.type = 'checkbox';
    lockCheckbox.title = 'Lock aspect ratio';
    const lockText = document.createElement('span');
    lockText.style.fontSize = '12px';
    lockText.style.color = 'white';
    lockText.textContent = 'Lock';
    lockLabel.appendChild(lockCheckbox);
    lockLabel.appendChild(lockText);

    const rotLabel = document.createElement('label');
    rotLabel.style.display = 'flex';
    rotLabel.style.alignItems = 'center';
    rotLabel.style.gap = '6px';
    const rotInput = document.createElement('input');
    rotInput.type = 'number';
    rotInput.value = '0';
    rotInput.style.width = '56px';
    rotInput.title = 'Rotation degrees';
    const rotText = document.createElement('span');
    rotText.style.fontSize = '12px';
    rotText.style.color = 'white';
    rotText.textContent = '°';
    rotLabel.appendChild(rotInput);
    rotLabel.appendChild(rotText);

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.className = 'px-2 py-1 rounded bg-indigo-600 text-white';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'px-2 py-1 rounded bg-gray-700 text-white';

    controls.appendChild(lockLabel);
    controls.appendChild(rotLabel);
    controls.appendChild(cancelBtn);
    controls.appendChild(applyBtn);

    wrapper.appendChild(preview);
    wrapper.appendChild(controls);
    document.body.appendChild(wrapper);

    // Dragging
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    preview.addEventListener('pointerdown', (e) => {
      // ignore pointerdown on handles (they have their own handlers)
      if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
      dragging = true;
      preview.setPointerCapture((e as PointerEvent).pointerId);
      startX = (e as PointerEvent).clientX;
      startY = (e as PointerEvent).clientY;
      startLeft = parseFloat(preview.style.left || '0');
      startTop = parseFloat(preview.style.top || '0');
      preview.style.cursor = 'grabbing';
    });

    preview.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = (e as PointerEvent).clientX - startX;
      const dy = (e as PointerEvent).clientY - startY;
      let nx = startLeft + dx;
      let ny = startTop + dy;
      nx = Math.max(0, Math.min(nx, rect.width - preview.clientWidth));
      ny = Math.max(0, Math.min(ny, rect.height - preview.clientHeight));
      preview.style.left = `${nx}px`;
      preview.style.top = `${ny}px`;
    });

    preview.addEventListener('pointerup', (e) => {
      dragging = false;
      try { preview.releasePointerCapture((e as PointerEvent).pointerId); } catch {}
      preview.style.cursor = 'grab';
    });

    // Resize handling
    let resizing = false;
    let resizeDir: string | null = null;
    let rStartX = 0, rStartY = 0, rStartW = 0, rStartH = 0, rStartLeft = 0, rStartTop = 0;
    let lockedAspect = false;
    let startAspect = (rStartW || 1) / (rStartH || 1);

    Object.entries(handles).forEach(([dir, el]) => {
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        resizing = true;
        resizeDir = dir;
        el.setPointerCapture((ev as PointerEvent).pointerId);
        rStartX = (ev as PointerEvent).clientX;
        rStartY = (ev as PointerEvent).clientY;
        rStartW = preview.clientWidth;
        rStartH = preview.clientHeight;
        rStartLeft = parseFloat(preview.style.left || '0');
        rStartTop = parseFloat(preview.style.top || '0');
      });
    });

    window.addEventListener('pointermove', (ev) => {
      if (!resizing || !resizeDir) return;
      const dx = (ev as PointerEvent).clientX - rStartX;
      const dy = (ev as PointerEvent).clientY - rStartY;
      let newW = rStartW;
      let newH = rStartH;
      let newLeft = rStartLeft;
      let newTop = rStartTop;
      // handle corners with optional locked aspect
      if (resizeDir === 'se') {
        newW = Math.max(20, rStartW + dx);
        newH = lockedAspect ? Math.max(20, Math.round(newW / startAspect)) : Math.max(20, rStartH + dy);
      } else if (resizeDir === 'nw') {
        newW = Math.max(20, rStartW - dx);
        newH = lockedAspect ? Math.max(20, Math.round(newW / startAspect)) : Math.max(20, rStartH - dy);
        newLeft = rStartLeft + (rStartW - newW);
        newTop = rStartTop + (rStartH - newH);
      } else if (resizeDir === 'ne') {
        newW = Math.max(20, rStartW + dx);
        newH = lockedAspect ? Math.max(20, Math.round(newW / startAspect)) : Math.max(20, rStartH - dy);
        newTop = rStartTop + (rStartH - newH);
      } else if (resizeDir === 'sw') {
        newW = Math.max(20, rStartW - dx);
        newH = lockedAspect ? Math.max(20, Math.round(newW / startAspect)) : Math.max(20, rStartH + dy);
        newLeft = rStartLeft + (rStartW - newW);
      }
      // clamp within rect
      newW = Math.min(newW, rect.width - newLeft);
      newH = Math.min(newH, rect.height - newTop);
      newLeft = Math.max(0, Math.min(newLeft, rect.width - newW));
      newTop = Math.max(0, Math.min(newTop, rect.height - newH));
      preview.style.width = `${newW}px`;
      preview.style.height = `${newH}px`;
      preview.style.left = `${newLeft}px`;
      preview.style.top = `${newTop}px`;
    });

    window.addEventListener('pointerup', (ev) => {
      if (resizing) {
        resizing = false;
        resizeDir = null;
        try { Object.values(handles).forEach(h => h.releasePointerCapture((ev as PointerEvent).pointerId)); } catch {}
      }
    });

    // Buttons
    cancelBtn.addEventListener('click', () => {
      wrapper.remove();
      resolve(null);
    });
    // wire lock/rotation controls
    lockCheckbox.addEventListener('change', () => {
      lockedAspect = lockCheckbox.checked;
    });

    rotInput.addEventListener('input', () => {
      const deg = Number(rotInput.value) || 0;
      preview.style.transform = `rotate(${deg}deg)`;
      // keep transform origin at center for nicer UX
      preview.style.transformOrigin = 'center center';
    });

    applyBtn.addEventListener('click', () => {
      // compute normalized coords
      const left = parseFloat(preview.style.left || '0');
      const top = parseFloat(preview.style.top || '0');
      const w = preview.clientWidth;
      const h = preview.clientHeight;
      const xNorm = left / rect.width;
      const yNorm = top / rect.height;
      const wNorm = w / rect.width;
      const hNorm = h / rect.height;
      const rotateDeg = Number(rotInput.value) || 0;
      wrapper.remove();
      resolve({ xNorm, yNorm, wNorm, hNorm, rotateDeg });
    });
  });
}
