import { useEffect, useRef } from 'react';
import * as Network from 'expo-network';
import { useApi } from '../contexts/ApiContext';
import { createConnectivityMonitor, isNetworkUp, NetworkSnapshot } from '../utils/connectivity';
import { createLogger } from '../utils/logger';

const log = createLogger('Network');
// Une coupure doit durer quelques secondes avant de basculer l'interface en hors-ligne.
const OFFLINE_DELAY = 4000;
// Laisse la connexion se stabiliser avant de retester l'API.
const ONLINE_DELAY = 1500;

/**
 * Bascule l'app en hors-ligne quand le réseau tombe et reteste l'API à son retour.
 * Ne touche ni à la navigation ni au lecteur : une vidéo téléchargée continue de jouer.
 */
export default function useConnectivityWatcher(onApiBack?: () => void) {
  const { setOfflineMode, setApiError, checkApi } = useApi();
  const latest = useRef<NetworkSnapshot | null>(null);
  const callbacks = useRef({ setOfflineMode, setApiError, checkApi, onApiBack });
  callbacks.current = { setOfflineMode, setApiError, checkApi, onApiBack };

  useEffect(() => {
    const recheck = () => {
      void callbacks.current.checkApi().then(ok => { if (ok) callbacks.current.onApiBack?.(); });
    };
    const monitor = createConnectivityMonitor({
      offlineDelay: OFFLINE_DELAY,
      onlineDelay: ONLINE_DELAY,
      onOffline: () => {
        // Connecté mais sans accès internet validé : l'API tranche (certains réseaux échouent
        // au test de connectivité d'Android tout en joignant le serveur).
        if (latest.current?.isConnected !== false) { recheck(); return; }
        log.info('Réseau perdu, passage en mode hors ligne');
        callbacks.current.setOfflineMode(true);
        callbacks.current.setApiError('Pas de connexion internet');
      },
      onOnline: () => {
        log.info('Réseau revenu, nouvelle vérification de l’API');
        recheck();
      },
    });
    const handle = (state: NetworkSnapshot) => {
      latest.current = state;
      monitor.update(isNetworkUp(state));
    };
    let active = true;
    const subscription = Network.addNetworkStateListener(handle);
    Network.getNetworkStateAsync().then(state => { if (active) handle(state); }).catch(error => log.warn('État du réseau illisible:', error));
    return () => {
      active = false;
      subscription.remove();
      monitor.dispose();
    };
  }, []);
}
