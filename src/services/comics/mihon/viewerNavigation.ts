/*
 * Zones d'appui du lecteur, portées de Mihon (https://github.com/mihonapp/mihon), licence Apache 2.0 (voir ./LICENSE).
 * Origine : commit 524fa53043f2f5b2321ea13027e44f093ab4245c,
 *   app/src/main/java/eu/kanade/tachiyomi/ui/reader/viewer/ViewerNavigation.kt
 *   app/src/main/java/eu/kanade/tachiyomi/ui/reader/viewer/navigation/{L,Kindlish,Edge,RightAndLeft,Disabled}Navigation.kt
 * Modifications : traduit de Kotlin en TypeScript ; classes remplacées par des tables de rectangles ; couleurs et
 * ressources Android retirées ; le point est donné en fraction de l'écran (0..1) au lieu d'un Offset Compose.
 */

export type NavigationLayout = 'l' | 'kindlish' | 'edge' | 'sides' | 'off';
export type TapAction = 'menu' | 'next' | 'previous';
export type InvertMode = 'none' | 'horizontal' | 'vertical' | 'both';
type RegionType = 'prev' | 'next' | 'left' | 'right';
interface Rect { left: number; top: number; right: number; bottom: number }
export interface Region { rect: Rect; type: RegionType }

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

export const NAVIGATION_LAYOUTS: Record<NavigationLayout, Region[]> = {
  // P P P / P M N / N N N
  l: [
    { rect: rect(0, 0.33, 0.33, 0.66), type: 'prev' },
    { rect: rect(0, 0, 1, 0.33), type: 'prev' },
    { rect: rect(0.66, 0.33, 1, 0.66), type: 'next' },
    { rect: rect(0, 0.66, 1, 1), type: 'next' },
  ],
  // M M M / P N N / P N N
  kindlish: [
    { rect: rect(0.33, 0.33, 1, 1), type: 'next' },
    { rect: rect(0, 0.33, 0.33, 1), type: 'prev' },
  ],
  // N N N / N M N / N P N
  edge: [
    { rect: rect(0, 0, 0.33, 1), type: 'next' },
    { rect: rect(0.33, 0.66, 0.66, 1), type: 'prev' },
    { rect: rect(0.66, 0, 1, 1), type: 'next' },
  ],
  // Gauche / menu / droite ; le sens de lecture décide de « suivant ».
  sides: [
    { rect: rect(0, 0, 0.33, 1), type: 'left' },
    { rect: rect(0.66, 0, 1, 1), type: 'right' },
  ],
  off: [],
};

export const NAVIGATION_LABELS: Record<NavigationLayout, string> = { sides: 'Bords gauche/droite', l: 'En L', kindlish: 'Type liseuse', edge: 'Bords', off: 'Désactivées' };

function invert(region: Region, mode: InvertMode): Region {
  const horizontal = mode === 'horizontal' || mode === 'both';
  const vertical = mode === 'vertical' || mode === 'both';
  if (!horizontal && !vertical) return region;
  const { left, top, right, bottom } = region.rect;
  return { ...region, rect: rect(horizontal ? 1 - right : left, vertical ? 1 - bottom : top, horizontal ? 1 - left : right, vertical ? 1 - top : bottom) };
}

/** Action d'un appui en (x, y), fractions de l'écran. `reversed` : livre de droite à gauche, la droite recule. */
export function navigationAction(layout: NavigationLayout, x: number, y: number, reversed: boolean, invertMode: InvertMode = 'none'): TapAction {
  const region = NAVIGATION_LAYOUTS[layout].map(item => invert(item, invertMode))
    .find(({ rect: r }) => x >= r.left && x < r.right && y >= r.top && y < r.bottom);
  if (!region) return 'menu';
  switch (region.type) {
    case 'next': return 'next';
    case 'prev': return 'previous';
    case 'right': return reversed ? 'previous' : 'next';
    case 'left': return reversed ? 'next' : 'previous';
  }
}
