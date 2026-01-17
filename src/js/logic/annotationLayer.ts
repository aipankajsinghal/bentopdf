import { createIcons, icons } from 'lucide';
import { getActiveDocument, pushUndoState } from '../documentManager.js';

// Types (Imported or re-declared slightly loosely to match, but we depend on doc manager now)
// We can use the logic internal types, but we map to the doc state.

export type ToolType = 'none' | 'pen' | 'highlight' | 'rectangle' | 'circle' | 'eraser';

interface Point {
    x: number;
    y: number;
}
// Using the interface defined in DocumentManager or compatible shape
interface Annotation {
    id: string;
    type: ToolType;
    page: number;
    points?: Point[]; 
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color: string;
    strokeWidth: number;
    opacity: number;
}

export class AnnotationLayer {
    private svg: SVGSVGElement;
    private currentTool: ToolType = 'none';
    private isDrawing = false;
    private currentPath: Point[] = [];
    private currentElement: SVGElement | null = null; 
    // private annotations: Annotation[] = []; // Removed local state
    
    // Tools State
    private color = '#ff0000';
    private strokeWidth = 2;
    private opacity = 1.0;
    
    // Selection/Eraser
    private hoveredElement: SVGElement | null = null;

    constructor() {
        const svgElement = document.getElementById('annotation-layer');
        if (!(svgElement instanceof SVGSVGElement)) {
            throw new Error('annotation-layer element is not an SVGSVGElement');
        }
        this.svg = svgElement;
        this.initListeners();
    }

    setTool(tool: ToolType) {
        this.currentTool = tool;
        this.svg.classList.toggle('pointer-events-auto', tool !== 'none');
        this.svg.classList.toggle('cursor-crosshair', tool !== 'none' && tool !== 'eraser');
        this.svg.classList.toggle('cursor-alias', tool === 'eraser'); // Use alias or custom cursor for eraser
        
        // Reset state
        this.currentPath = [];
        this.currentElement = null;
    }

    setColor(color: string) {
        this.color = color;
    }

    setStrokeWidth(width: number) {
        this.strokeWidth = width;
    }
    
    setOpacity(opacity: number) {
        this.opacity = opacity;
    }

    clearPage(pageNum: number) {
        const doc = getActiveDocument();
        if (!doc) return;
        
        pushUndoState(doc);
        doc.annotations = (doc.annotations || []).filter((a: any) => a.page !== pageNum);
        
        this.renderAnnotations(pageNum);
    }
    
    // Called when page changes
    renderAnnotations(pageNum: number) {
        // Clear SVG
        while (this.svg.firstChild) {
            this.svg.removeChild(this.svg.firstChild);
        }
        
        const doc = getActiveDocument();
        if (!doc) return;

        const pageAnnos = (doc.annotations || []).filter((a: any) => a.page === pageNum);
        pageAnnos.forEach((a: any) => {
            const el = this.createSVGElement(a);
            if (el) this.svg.appendChild(el);
        });
    }

    private initListeners() {
        if (!this.svg) return;

        this.svg.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.svg.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.svg.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.svg.addEventListener('mouseleave', this.handleMouseUp.bind(this)); // Stop drawing if selected
        
        // Eraser hover effect logic could go here
    }

    private getMousePos(e: MouseEvent): Point {
        const rect = this.svg.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    private handleMouseDown(e: MouseEvent) {
        if (this.currentTool === 'none') return;
        
        const pos = this.getMousePos(e);

        if (this.currentTool === 'eraser') {
            // Eraser logic is click-to-delete or drag-to-delete? 
            // Simple click for now, target is handled via event bubbling usually, 
            // but SVG element might be captured. 
            // Actually, we need to check what element is under cursor.
            if (e.target instanceof SVGElement && e.target !== this.svg) {
                this.deleteAnnotation(e.target);
            }
            return;
        }

        this.isDrawing = true;
        this.currentPath = [pos];

        // Create temporary element
        if (this.currentTool === 'pen' || this.currentTool === 'highlight') {
            this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this.currentElement.setAttribute('fill', 'none');
            this.currentElement.setAttribute('stroke', this.color);
            this.currentElement.setAttribute('stroke-width', String(this.currentTool === 'highlight' ? this.strokeWidth * 6 : this.strokeWidth));
            this.currentElement.setAttribute('stroke-opacity', String(this.currentTool === 'highlight' ? 0.4 : this.opacity));
            this.currentElement.setAttribute('stroke-linecap', 'round');
            this.currentElement.setAttribute('d', `M ${pos.x} ${pos.y}`);
            this.svg.appendChild(this.currentElement);
        } else if (this.currentTool === 'rectangle') {
            this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            this.currentElement.setAttribute('stroke', this.color);
            this.currentElement.setAttribute('stroke-width', String(this.strokeWidth));
            this.currentElement.setAttribute('fill', 'none'); // Support fill later
            this.currentElement.setAttribute('x', String(pos.x));
            this.currentElement.setAttribute('y', String(pos.y));
            this.currentElement.setAttribute('width', '0');
            this.currentElement.setAttribute('height', '0');
             // Store origin for rect calculation
             this.currentElement.dataset.originX = String(pos.x);
             this.currentElement.dataset.originY = String(pos.y);
            this.svg.appendChild(this.currentElement);
        } else if (this.currentTool === 'circle') {
             this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
             this.currentElement.setAttribute('stroke', this.color);
             this.currentElement.setAttribute('stroke-width', String(this.strokeWidth));
             this.currentElement.setAttribute('fill', 'none');
             this.currentElement.setAttribute('cx', String(pos.x));
             this.currentElement.setAttribute('cy', String(pos.y));
             this.currentElement.setAttribute('rx', '0');
             this.currentElement.setAttribute('ry', '0');
             this.currentElement.dataset.originX = String(pos.x);
             this.currentElement.dataset.originY = String(pos.y);
             this.svg.appendChild(this.currentElement);
        }
    }

    private handleMouseMove(e: MouseEvent) {
        if (!this.isDrawing || !this.currentElement) return;

        const pos = this.getMousePos(e);

        if (this.currentTool === 'pen' || this.currentTool === 'highlight') {
            this.currentPath.push(pos);
            const d = this.getElementPathD(this.currentPath);
            this.currentElement.setAttribute('d', d);
        } else if (this.currentTool === 'rectangle') {
            const startX = Number(this.currentElement.dataset.originX);
            const startY = Number(this.currentElement.dataset.originY);
            
            const width = pos.x - startX;
            const height = pos.y - startY;
            
            this.currentElement.setAttribute('x', String(width < 0 ? pos.x : startX));
            this.currentElement.setAttribute('y', String(height < 0 ? pos.y : startY));
            this.currentElement.setAttribute('width', String(Math.abs(width)));
            this.currentElement.setAttribute('height', String(Math.abs(height)));
        } else if (this.currentTool === 'circle') {
            const startX = Number(this.currentElement.dataset.originX);
            const startY = Number(this.currentElement.dataset.originY);
            
            const rx = Math.abs(pos.x - startX);
            const ry = Math.abs(pos.y - startY);
            
             this.currentElement.setAttribute('rx', String(rx));
             this.currentElement.setAttribute('ry', String(ry));
        }
    }

    private handleMouseUp(e: MouseEvent) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        if (this.currentElement) {
            const doc = getActiveDocument();
            if (doc) {
                // Determine page
                const pageIndicator = document.getElementById('page-indicator');
                const pageNum = pageIndicator ? parseInt(pageIndicator.textContent?.split('/')[0].trim() || '1') : 1;

                const id = 'anno_' + Date.now();
                this.currentElement.setAttribute('data-id', id);
                
                const newAnno: Annotation = {
                    id,
                    type: this.currentTool,
                    page: pageNum,
                    color: this.color,
                    strokeWidth: this.strokeWidth,
                    opacity: this.opacity,
                };

                if (this.currentTool === 'pen' || this.currentTool === 'highlight') {
                    newAnno.points = [...this.currentPath];
                } else if (this.currentTool === 'rectangle') {
                    newAnno.x = Number(this.currentElement.getAttribute('x'));
                    newAnno.y = Number(this.currentElement.getAttribute('y'));
                    newAnno.width = Number(this.currentElement.getAttribute('width'));
                    newAnno.height = Number(this.currentElement.getAttribute('height'));
                } else if (this.currentTool === 'circle') {
                    // Circle logic - storing simple bounds for now if rect
                    // Actually standardizing on rect bounds for simplicity of storage in MVP
                     newAnno.x = Number(this.currentElement.getAttribute('cx')) - Number(this.currentElement.getAttribute('rx'));
                     newAnno.y = Number(this.currentElement.getAttribute('cy')) - Number(this.currentElement.getAttribute('ry'));
                     newAnno.width = Number(this.currentElement.getAttribute('rx')) * 2;
                     newAnno.height = Number(this.currentElement.getAttribute('ry')) * 2;
                }
                
                // SAVE STATE
                pushUndoState(doc);
                if (!doc.annotations) doc.annotations = [];
                doc.annotations.push(newAnno as any);
            }
        }
        
        this.currentPath = [];
        this.currentElement = null;
    }

    private deleteAnnotation(el: SVGElement) {
        const id = el.getAttribute('data-id');
        const doc = getActiveDocument();
        if (id && doc) {
            pushUndoState(doc);
            doc.annotations = (doc.annotations || []).filter((a: any) => a.id !== id);
            el.remove();
        }
    }

    private getElementPathD(points: Point[]) {
        if (points.length === 0) return '';
        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        return d;
    }

    private createSVGElement(anno: Annotation): SVGElement | null {
        // Hydrate from JSON
        let el: SVGElement | null = null;
        if (anno.type === 'pen' || anno.type === 'highlight') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            el.setAttribute('d', this.getElementPathD(anno.points || []));
            el.setAttribute('fill', 'none');
            el.setAttribute('stroke-linecap', 'round');
            el.setAttribute('stroke-width', String(anno.type === 'highlight' ? anno.strokeWidth * 6 : anno.strokeWidth));
            el.setAttribute('stroke-opacity', String(anno.type === 'highlight' ? 0.4 : anno.opacity));
        } else if (anno.type === 'rectangle') {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            el.setAttribute('x', String(anno.x));
            el.setAttribute('y', String(anno.y));
            el.setAttribute('width', String(anno.width));
            el.setAttribute('height', String(anno.height));
            el.setAttribute('fill', 'none');
        } 
        
        if (el) {
            el.setAttribute('stroke', anno.color);
            if (!el.hasAttribute('stroke-width')) el.setAttribute('stroke-width', String(anno.strokeWidth));
            el.setAttribute('data-id', anno.id);
        }
        return el;
    }
}

export const annotationLayer = new AnnotationLayer();
