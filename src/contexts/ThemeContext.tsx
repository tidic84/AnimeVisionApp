import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Scheme = 'light' | 'dark';
const ThemeContext = createContext<{ scheme: Scheme; setScheme: (scheme: Scheme) => void } | null>(null);
export function ThemeProvider({ children }: React.PropsWithChildren) {
  const system = useColorScheme() ?? 'light';
  const [preference, setPreference] = useState<Scheme | null>(null);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('themePreference').then(value => {
      if (active && (value === 'light' || value === 'dark')) setPreference(value);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const setScheme = (scheme: Scheme) => {
    setPreference(scheme);
    AsyncStorage.setItem('themePreference', scheme).catch(() => {});
  };
  return <ThemeContext.Provider value={{ scheme: preference ?? system, setScheme }}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is required');
  return context;
}
export function useAppColorScheme() { return useTheme().scheme; }
