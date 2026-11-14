// Gestes du lecteur façon YouTube ReVanced : glissement vertical à gauche = luminosité, à droite = volume, appui long = x2.

export type GestureSide = 'brightness' | 'volume';
export type Edges = { top: number; bottom: number; side: number };

/** Déplacement (px) au-delà duquel un appui n'est plus un tap mais un glissement. */
export const SLOP = 12;
/** Durée d'appui (ms) avant de passer en vitesse x2. */
export const LONG_PRESS = 450;
export const BOOST_RATE = 2;
/** Part de la hauteur de la vidéo à parcourir pour passer de 0 à 100 %. */
const RANGE = 0.8;

// Les gestes partant des bords (barre de gestes Android, retour latéral, volet des notifications) sont laissés au système.
export function swipeSide(x: number, y: number, width: number, height: number, edges: Edges): GestureSide | null {
  if (width <= 0 || height <= 0) return null;
  if (y < edges.top || y > height - edges.bottom || x < edges.side || x > width - edges.side) return null;
  return x < width / 2 ? 'brightness' : 'volume';
}

export const isTap = (dx: number, dy: number) => Math.abs(dx) < SLOP && Math.abs(dy) < SLOP;

// Un glissement nettement plus vertical qu'horizontal ; les autres mouvements ne font rien.
export const isVerticalSwipe = (dx: number, dy: number) => Math.abs(dy) >= SLOP && Math.abs(dy) > Math.abs(dx) * 1.5;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

// Vers le haut (dy négatif) augmente. Le seuil de détection n'est pas compté, pour que la valeur ne saute pas au démarrage.
export function levelAfterDrag(start: number, dy: number, height: number): number {
  const travel = Math.sign(dy) * Math.max(0, Math.abs(dy) - SLOP);
  return clamp(clamp(start) - travel / Math.max(1, height * RANGE));
}
