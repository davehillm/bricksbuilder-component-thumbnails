const paths: Record<string, string> = {
  camera: '<path d="M14 4h-4L8 7H4v13h16V7h-4z"/><circle cx="12" cy="13" r="4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  undo: '<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12"/>',
  redo: '<path d="m16 5 5 5-5 5M21 10H10a6 6 0 0 0 0 12"/>',
  center: '<path d="M12 2v20M4 7h16v10H4z"/>',
  fit: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M7 7h10v10H7z"/>',
  front: '<path d="M4 4h11v11H4zM9 18v3h12V9h-3"/>',
  back: '<path d="M9 9h12v12H9zM4 15V4h11v2M4 15h2"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  style: '<rect x="4" y="4" width="16" height="16" rx="4"/>',
  expand: '<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
};
export const icon = (name: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.camera}</svg>`;
