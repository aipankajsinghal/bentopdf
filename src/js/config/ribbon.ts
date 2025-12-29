// Ribbon configuration for Office-style toolbar
// Defines tabs, groups, and tools with consolidation into dropdowns

export interface RibbonTool {
  id: string;
  name: string;
  icon: string;
  tooltip?: string;
  type?: 'button' | 'dropdown' | 'split';
  children?: RibbonTool[];
}

export interface RibbonGroup {
  name: string;
  tools: RibbonTool[];
}

export interface RibbonTab {
  id: string;
  name: string;
  groups: RibbonGroup[];
}

export const ribbonConfig: RibbonTab[] = [
  {
    id: 'home',
    name: 'Home',
    groups: [
      {
        name: 'File',
        tools: [
          { id: 'open-file', name: 'Open', icon: 'folder-open', tooltip: 'Open PDF file' },
          { id: 'download', name: 'Download', icon: 'download', tooltip: 'Download PDF' },
        ],
      },
      {
        name: 'Clipboard',
        tools: [
          { id: 'undo', name: 'Undo', icon: 'undo-2', tooltip: 'Undo last action' },
          { id: 'redo', name: 'Redo', icon: 'redo-2', tooltip: 'Redo last action' },
        ],
      },
      {
        name: 'View',
        tools: [
          { id: 'zoom-in', name: 'Zoom In', icon: 'zoom-in', tooltip: 'Zoom in' },
          { id: 'zoom-out', name: 'Zoom Out', icon: 'zoom-out', tooltip: 'Zoom out' },
          { id: 'fit-page', name: 'Fit Page', icon: 'maximize', tooltip: 'Fit to page' },
        ],
      },
      {
        name: 'Pages',
        tools: [
          { id: 'add-pdf', name: 'Add PDF', icon: 'file-plus', tooltip: 'Add another PDF (for merge)' },
          {
            id: 'split-group',
            name: 'Split',
            icon: 'scissors',
            type: 'dropdown',
            tooltip: 'Split and extract pages',
            children: [
              { id: 'split-pdf', name: 'Split PDF', icon: 'scissors', tooltip: 'Split into multiple PDFs' },
              { id: 'extract-pages', name: 'Extract Pages', icon: 'ungroup', tooltip: 'Extract selected pages' },
              { id: 'delete-pages', name: 'Delete Pages', icon: 'trash-2', tooltip: 'Delete selected pages' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'edit',
    name: 'Edit',
    groups: [
      {
        name: 'Annotate',
        tools: [
          { id: 'annotate', name: 'Annotate', icon: 'highlighter', tooltip: 'Open annotation tools' },
          { id: 'sign', name: 'Sign', icon: 'pen-tool', tooltip: 'Add signature' },
          { id: 'stamps', name: 'Stamps', icon: 'stamp', tooltip: 'Add stamps' },
        ],
      },
      {
        name: 'Markup',
        tools: [
          { id: 'watermark', name: 'Watermark', icon: 'droplets', tooltip: 'Add watermark' },
          { id: 'page-numbers', name: 'Page Numbers', icon: 'list-ordered', tooltip: 'Insert page numbers' },
          { id: 'header-footer', name: 'Header/Footer', icon: 'pilcrow', tooltip: 'Add header and footer' },
        ],
      },
      {
        name: 'Structure',
        tools: [
          { id: 'bookmarks', name: 'Bookmarks', icon: 'bookmark', tooltip: 'Edit bookmarks' },
          { id: 'toc', name: 'TOC', icon: 'list', tooltip: 'Generate table of contents' },
        ],
      },
      {
        name: 'Forms',
        tools: [
          { id: 'fill-form', name: 'Fill Form', icon: 'square-pen', tooltip: 'Fill PDF forms' },
          { id: 'create-form', name: 'Create Form', icon: 'file-input', tooltip: 'Create fillable form' },
        ],
      },
      {
        name: 'Colors',
        tools: [
          {
            id: 'colors-group',
            name: 'Colors',
            icon: 'palette',
            type: 'dropdown',
            tooltip: 'Color adjustments',
            children: [
              { id: 'invert-colors', name: 'Invert Colors', icon: 'contrast', tooltip: 'Create dark mode' },
              { id: 'background-color', name: 'Background Color', icon: 'palette', tooltip: 'Change background' },
              { id: 'text-color', name: 'Text Color', icon: 'type', tooltip: 'Change text color' },
              { id: 'greyscale', name: 'Greyscale', icon: 'circle-half', tooltip: 'Convert to greyscale' },
            ],
          },
        ],
      },
      {
        name: 'Cleanup',
        tools: [
          {
            id: 'cleanup-group',
            name: 'Cleanup',
            icon: 'eraser',
            type: 'dropdown',
            tooltip: 'Remove content',
            children: [
              { id: 'remove-annotations', name: 'Remove Annotations', icon: 'eraser', tooltip: 'Strip annotations' },
              { id: 'remove-blank-pages', name: 'Remove Blank Pages', icon: 'file-minus-2', tooltip: 'Delete blank pages' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'organize',
    name: 'Organize',
    groups: [
      {
        name: 'Arrange',
        tools: [
          {
            id: 'rotate-group',
            name: 'Rotate',
            icon: 'rotate-cw',
            type: 'dropdown',
            tooltip: 'Rotate pages',
            children: [
              { id: 'rotate-left', name: 'Rotate Left', icon: 'rotate-ccw', tooltip: 'Rotate 90° left' },
              { id: 'rotate-right', name: 'Rotate Right', icon: 'rotate-cw', tooltip: 'Rotate 90° right' },
              { id: 'rotate-180', name: 'Rotate 180°', icon: 'refresh-cw', tooltip: 'Rotate 180°' },
              { id: 'reverse-pages', name: 'Reverse Order', icon: 'arrow-down-z-a', tooltip: 'Reverse page order' },
            ],
          },
          { id: 'reorder', name: 'Reorder', icon: 'grip-vertical', tooltip: 'Drag to reorder pages' },
          { id: 'duplicate', name: 'Duplicate', icon: 'copy', tooltip: 'Duplicate selected pages' },
        ],
      },
      {
        name: 'Insert',
        tools: [
          { id: 'add-blank', name: 'Blank Page', icon: 'file-plus-2', tooltip: 'Insert blank page' },
        ],
      },
      {
        name: 'Transform',
        tools: [
          { id: 'crop', name: 'Crop', icon: 'crop', tooltip: 'Crop pages' },
          { id: 'n-up', name: 'N-Up', icon: 'layout-grid', tooltip: 'Multiple pages per sheet' },
          { id: 'divide', name: 'Divide', icon: 'table-columns-split', tooltip: 'Divide pages' },
          { id: 'combine-single', name: 'Combine', icon: 'unfold-vertical', tooltip: 'Combine into single page' },
        ],
      },
    ],
  },
  {
    id: 'convert',
    name: 'Convert',
    groups: [
      {
        name: 'To PDF',
        tools: [
          {
            id: 'image-to-pdf-group',
            name: 'Image to PDF',
            icon: 'image-up',
            type: 'dropdown',
            tooltip: 'Convert images to PDF',
            children: [
              { id: 'image-to-pdf', name: 'Any Image', icon: 'images', tooltip: 'Convert any image format' },
              { id: 'jpg-to-pdf', name: 'JPG to PDF', icon: 'image-up', tooltip: 'Convert JPG' },
              { id: 'png-to-pdf', name: 'PNG to PDF', icon: 'image-up', tooltip: 'Convert PNG' },
              { id: 'webp-to-pdf', name: 'WebP to PDF', icon: 'image-up', tooltip: 'Convert WebP' },
              { id: 'svg-to-pdf', name: 'SVG to PDF', icon: 'pen-tool', tooltip: 'Convert SVG' },
              { id: 'bmp-to-pdf', name: 'BMP to PDF', icon: 'image', tooltip: 'Convert BMP' },
              { id: 'heic-to-pdf', name: 'HEIC to PDF', icon: 'smartphone', tooltip: 'Convert HEIC' },
              { id: 'tiff-to-pdf', name: 'TIFF to PDF', icon: 'layers', tooltip: 'Convert TIFF' },
            ],
          },
          { id: 'text-to-pdf', name: 'Text to PDF', icon: 'file-pen', tooltip: 'Convert text file' },
          { id: 'json-to-pdf', name: 'JSON to PDF', icon: 'file-code', tooltip: 'Convert JSON' },
        ],
      },
      {
        name: 'From PDF',
        tools: [
          {
            id: 'pdf-to-image-group',
            name: 'PDF to Image',
            icon: 'file-image',
            type: 'dropdown',
            tooltip: 'Export pages as images',
            children: [
              { id: 'pdf-to-jpg', name: 'PDF to JPG', icon: 'file-image', tooltip: 'Export as JPG' },
              { id: 'pdf-to-png', name: 'PDF to PNG', icon: 'file-image', tooltip: 'Export as PNG' },
              { id: 'pdf-to-webp', name: 'PDF to WebP', icon: 'file-image', tooltip: 'Export as WebP' },
              { id: 'pdf-to-bmp', name: 'PDF to BMP', icon: 'file-image', tooltip: 'Export as BMP' },
              { id: 'pdf-to-tiff', name: 'PDF to TIFF', icon: 'file-image', tooltip: 'Export as TIFF' },
            ],
          },
          { id: 'pdf-to-json', name: 'PDF to JSON', icon: 'file-code', tooltip: 'Export as JSON' },
        ],
      },
      {
        name: 'OCR',
        tools: [
          { id: 'ocr', name: 'OCR', icon: 'scan-text', tooltip: 'Make PDF searchable' },
        ],
      },
    ],
  },
  {
    id: 'secure',
    name: 'Secure',
    groups: [
      {
        name: 'Protect',
        tools: [
          { id: 'encrypt', name: 'Encrypt', icon: 'lock', tooltip: 'Add password protection' },
          { id: 'permissions', name: 'Permissions', icon: 'shield-check', tooltip: 'Set permissions' },
        ],
      },
      {
        name: 'Unlock',
        tools: [
          { id: 'decrypt', name: 'Decrypt', icon: 'unlock', tooltip: 'Remove password' },
          { id: 'remove-restrictions', name: 'Remove Restrictions', icon: 'unlink', tooltip: 'Remove restrictions' },
        ],
      },
      {
        name: 'Sanitize',
        tools: [
          {
            id: 'sanitize-group',
            name: 'Sanitize',
            icon: 'brush',
            type: 'dropdown',
            tooltip: 'Clean PDF',
            children: [
              { id: 'sanitize', name: 'Sanitize PDF', icon: 'brush', tooltip: 'Remove hidden data' },
              { id: 'remove-metadata', name: 'Remove Metadata', icon: 'file-x', tooltip: 'Strip metadata' },
              { id: 'flatten', name: 'Flatten', icon: 'layers', tooltip: 'Flatten annotations' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'tools',
    name: 'Tools',
    groups: [
      {
        name: 'Optimize',
        tools: [
          { id: 'compress', name: 'Compress', icon: 'zap', tooltip: 'Reduce file size' },
          { id: 'linearize', name: 'Linearize', icon: 'gauge', tooltip: 'Optimize for web' },
          { id: 'fix-size', name: 'Fix Size', icon: 'ruler', tooltip: 'Standardize page sizes' },
        ],
      },
      {
        name: 'Repair',
        tools: [
          { id: 'repair', name: 'Repair', icon: 'wrench', tooltip: 'Repair corrupted PDF' },
        ],
      },
      {
        name: 'Attachments',
        tools: [
          {
            id: 'attachments-group',
            name: 'Attachments',
            icon: 'paperclip',
            type: 'dropdown',
            tooltip: 'Manage attachments',
            children: [
              { id: 'add-attachments', name: 'Add Attachments', icon: 'paperclip', tooltip: 'Embed files' },
              { id: 'extract-attachments', name: 'Extract Attachments', icon: 'download', tooltip: 'Extract files' },
              { id: 'edit-attachments', name: 'Edit Attachments', icon: 'file-edit', tooltip: 'View and remove' },
            ],
          },
        ],
      },
      {
        name: 'Info',
        tools: [
          { id: 'metadata', name: 'Metadata', icon: 'info', tooltip: 'View/edit metadata' },
          { id: 'dimensions', name: 'Dimensions', icon: 'ruler', tooltip: 'View page dimensions' },
        ],
      },
      {
        name: 'Compare',
        tools: [
          { id: 'compare', name: 'Compare', icon: 'git-compare', tooltip: 'Compare two PDFs' },
        ],
      },
    ],
  },
];

// Get all unique tool IDs (flattened)
export function getAllToolIds(): string[] {
  const ids: string[] = [];
  for (const tab of ribbonConfig) {
    for (const group of tab.groups) {
      for (const tool of group.tools) {
        ids.push(tool.id);
        if (tool.children) {
          for (const child of tool.children) {
            ids.push(child.id);
          }
        }
      }
    }
  }
  return ids;
}

// Find a tool by ID
export function findToolById(id: string): RibbonTool | undefined {
  for (const tab of ribbonConfig) {
    for (const group of tab.groups) {
      for (const tool of group.tools) {
        if (tool.id === id) return tool;
        if (tool.children) {
          for (const child of tool.children) {
            if (child.id === id) return child;
          }
        }
      }
    }
  }
  return undefined;
}
