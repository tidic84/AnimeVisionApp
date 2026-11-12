// Calculs du lecteur de scans, sans dépendance à React (testés dans tests/test-comic-reader.cjs).
export type Mode = 'single' | 'double' | 'vertical';

/** Pages affichées ensemble : une par écran, ou par paires en double page. */
export function spreads(pageCount: number, mode: Mode): number[][] {
  const size = mode === 'double' ? 2 : 1;
  const result: number[][] = [];
  for (let start = 0; start < pageCount; start += size) result.push(Array.from({ length: Math.min(size, pageCount - start) }, (_, i) => start + i));
  return result;
}
export const spreadOf = (page: number, mode: Mode) => (mode === 'double' ? Math.floor(page / 2) : page);

/** Ordre d'affichage d'une double page : de droite à gauche, la première page est à droite. */
export const displayOrder = (pages: number[], direction: 'rtl' | 'ltr') => (direction === 'rtl' ? [...pages].reverse() : pages);

/** Touche fléchée gauche/droite selon le sens de lecture. */
export const arrowAction = (key: 'ArrowLeft' | 'ArrowRight', direction: 'rtl' | 'ltr') =>
  (key === 'ArrowLeft') === (direction === 'rtl') ? 'next' : 'previous';

/** Taille des pages d'un écran paginé : ajustées à la hauteur (page entière) ou à la largeur, puis zoomées. */
export function fitSpread(aspects: number[], box: { width: number; height: number }, fit: 'height' | 'width', zoom: number): { width: number; height: number }[] {
  const columnWidth = box.width / aspects.length;
  return aspects.map(aspect => {
    const width = fit === 'width' ? columnWidth : Math.min(box.height / aspect, columnWidth);
    return { width: width * zoom, height: width * aspect * zoom };
  });
}

/** Décalages cumulés des pages en défilement vertical. */
export function prefixOffsets(heights: number[]): number[] {
  const offsets = [0];
  for (const height of heights) offsets.push(offsets[offsets.length - 1] + height);
  return offsets;
}

/** Page en haut de l'écran et part déjà défilée de cette page (0..1), d'après la position de défilement. */
export function positionAt(scrollY: number, offsets: number[]): { page: number; offset: number } {
  const count = offsets.length - 1;
  if (count <= 0) return { page: 0, offset: 0 };
  let low = 0, high = count - 1;
  while (low < high) { const middle = (low + high + 1) >> 1; if (offsets[middle] <= scrollY) low = middle; else high = middle - 1; }
  const height = offsets[low + 1] - offsets[low];
  return { page: low, offset: height > 0 ? Math.min(Math.max((scrollY - offsets[low]) / height, 0), 1) : 0 };
}
export const scrollFor = (page: number, offset: number, offsets: number[]) =>
  offsets[Math.min(page, offsets.length - 2)] + offset * (offsets[Math.min(page + 1, offsets.length - 1)] - offsets[Math.min(page, offsets.length - 2)]);
