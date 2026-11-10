/**
 * Anti-rebond de la connectivité, sans dépendance à React Native pour rester testable.
 * Une coupure n'est signalée qu'après `offlineDelay` ms sans retour du réseau, et le retour
 * qu'après `onlineDelay` ms de connexion stable : une perte brève ne change rien à l'interface.
 */
export interface NetworkSnapshot {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

/** true / false selon l'état du réseau, null si l'état est encore inconnu (aucune décision). */
export function isNetworkUp(state: NetworkSnapshot | null | undefined): boolean | null {
  if (!state) return null;
  if (state.isConnected === false || state.isInternetReachable === false) return false;
  if (state.isConnected === true) return true;
  return null;
}

type Timer = unknown;
export interface ConnectivityMonitorOptions {
  offlineDelay: number;
  onlineDelay: number;
  onOffline: () => void;
  onOnline: () => void;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
}

export function createConnectivityMonitor(options: ConnectivityMonitorOptions) {
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
  // L'app démarre en supposant le réseau disponible : seule une coupure confirmée change l'état.
  let reported: 'online' | 'offline' = 'online';
  let pending: { target: 'online' | 'offline'; timer: Timer } | null = null;

  const cancel = () => {
    if (pending) clearTimer(pending.timer);
    pending = null;
  };

  return {
    /** À appeler à chaque changement d'état du réseau (`isNetworkUp`). */
    update(up: boolean | null) {
      if (up === null) return;
      const target = up ? 'online' : 'offline';
      if (pending?.target === target) return; // déjà en attente de confirmation
      cancel();
      if (target === reported) return; // retour à l'état signalé avant la fin du délai
      pending = {
        target,
        timer: setTimer(() => {
          pending = null;
          reported = target;
          if (target === 'offline') options.onOffline(); else options.onOnline();
        }, target === 'offline' ? options.offlineDelay : options.onlineDelay),
      };
    },
    get state() { return reported; },
    dispose: cancel,
  };
}
