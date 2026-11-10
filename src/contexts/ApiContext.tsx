import React, { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import apiService from '../services/apiService';

interface ApiContextType {
  isApiAvailable: boolean;
  setApiAvailable: (available: boolean) => void;
  apiError: string | null;
  setApiError: (error: string | null) => void;
  isOfflineMode: boolean;
  setOfflineMode: (offline: boolean) => void;
  /** Teste l'API et met l'état à jour ; les appels simultanés partagent la même requête. */
  checkApi: () => Promise<boolean>;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const useApi = () => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};

interface ApiProviderProps {
  children: ReactNode;
}

export const ApiProvider: React.FC<ApiProviderProps> = ({ children }) => {
  const [isApiAvailable, setIsApiAvailable] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const checking = useRef<Promise<boolean> | null>(null);

  const setApiAvailable = useCallback((available: boolean) => {
    setIsApiAvailable(available);
    if (available) {
      setApiError(null);
      setIsOfflineMode(false);
    } else {
      setIsOfflineMode(true);
    }
  }, []);

  const setOfflineMode = useCallback((offline: boolean) => {
    setIsOfflineMode(offline);
    if (offline) {
      setIsApiAvailable(false);
    }
  }, []);

  const checkApi = useCallback(() => {
    if (!checking.current) {
      checking.current = apiService.testConnection().then(connected => {
        setApiAvailable(connected);
        setApiError(connected ? null : 'Connexion au catalogue indisponible');
        return connected;
      }).finally(() => { checking.current = null; });
    }
    return checking.current;
  }, [setApiAvailable]);

  const value = useMemo(() => ({
    isApiAvailable,
    setApiAvailable,
    apiError,
    setApiError,
    isOfflineMode,
    setOfflineMode,
    checkApi,
  }), [isApiAvailable, apiError, isOfflineMode, setApiAvailable, setOfflineMode, checkApi]);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};
