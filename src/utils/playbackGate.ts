// Démarrage de la lecture différé tant que le lecteur n'est pas visible : un flux qui finit de charger alors qu'on
// est passé sur une autre page (ou hors de l'app sans lecture en arrière-plan) ne doit pas lancer le son derrière.
export type PlaybackGate = {
  // Demande de démarrer : vrai s'il faut lancer la lecture maintenant, sinon elle est gardée pour le retour.
  request: () => boolean;
  // Retour au premier plan : vrai si un démarrage gardé doit être lancé maintenant.
  resume: () => boolean;
  // La source a changé ou disparu : le démarrage gardé n'a plus lieu d'être.
  cancel: () => void;
};

export function createPlaybackGate(isVisible: () => boolean): PlaybackGate {
  let deferred = false;
  return {
    request: () => { deferred = !isVisible(); return !deferred; },
    resume: () => { if (!deferred || !isVisible()) return false; deferred = false; return true; },
    cancel: () => { deferred = false; },
  };
}

// Visible : écran au premier plan dans l'app, et app active sauf si la lecture en arrière-plan est autorisée.
export const playerVisible = (focused: boolean, appActive: boolean, background: boolean) => focused && (appActive || background);
