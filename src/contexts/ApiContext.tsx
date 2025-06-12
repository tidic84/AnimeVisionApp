import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ApiContextType {
  isApiAvailable: boolean;
  setApiAvailable: (available: boolean) => void;
  apiError: string | null;
  setApiError: (error: string | null) => void;
  isOfflineMode: boolean;
  setOfflineMode: (offline: boolean) => void;
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

  const setApiAvailable = (available: boolean) => {
    setIsApiAvailable(available);
    if (available) {
      setApiError(null);
      setIsOfflineMode(false);
    } else {
      setIsOfflineMode(true);
    }
  };

  const setOfflineMode = (offline: boolean) => {
    setIsOfflineMode(offline);
    if (offline) {
      setIsApiAvailable(false);
    }
  };

  return (
    <ApiContext.Provider
      value={{
        isApiAvailable,
        setApiAvailable,
        apiError,
        setApiError,
        isOfflineMode,
        setOfflineMode,
      }}
    >
      {children}
    </ApiContext.Provider>
  );
}; 