// Un seul lecteur dans la pile : ouvrir un épisode alors qu'un lecteur est déjà ouvert plus bas retire l'ancien
// (démonté, il arrête sa lecture et enregistre sa progression), et « retour » ne repasse jamais par deux lecteurs.
// Même règle pour la fiche d'un animé déjà ouverte plus bas.
type Route = { key: string; name: string; params?: object };
type Stack = { index: number; routes: Route[] };

const animeIdOf = (route: Route) => (route.params as { animeId?: string } | undefined)?.animeId;

export function sameScreen(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;
  if (a.name === 'VideoPlayer') return true;
  if (a.name === 'AnimeDetail') return !!animeIdOf(a) && animeIdOf(a) === animeIdOf(b);
  return false;
}

// `next` est l'état après une action ; si elle vient d'ouvrir un écran, ses doublons plus bas sont retirés.
export function keepUniqueScreens<S extends Stack>(previous: Stack | undefined, next: S): S {
  const top = next.routes[next.index];
  if (!top || previous?.routes.some(route => route.key === top.key)) return next;
  const routes = next.routes.filter(route => route === top || !sameScreen(route, top));
  if (routes.length === next.routes.length) return next;
  return { ...next, routes, index: routes.indexOf(top) };
}
