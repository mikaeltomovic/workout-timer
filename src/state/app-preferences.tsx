import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { DEFAULT_APP_PREFERENCES, type AppPreferences } from '@/domain/app-preferences';
import { LocalWorkoutStore } from '@/storage/workout-store';

type PreferencesContextValue = {
  preferences: AppPreferences;
  ready: boolean;
  storageError: string | null;
  updatePreferences: (next: AppPreferences) => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const store = new LocalWorkoutStore();

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void store.getPreferences().then(value => {
      if (mounted) setPreferences(value);
    }).catch(error => {
      if (mounted) setStorageError(error instanceof Error ? error.message : 'App preferences could not be read.');
    }).finally(() => {
      if (mounted) setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(preferences.theme === 'system' ? 'unspecified' : preferences.theme);
  }, [preferences.theme]);

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    ready,
    storageError,
    updatePreferences: async next => {
      if (storageError) throw new Error(storageError);
      await store.savePreferences(next);
      setPreferences(next);
    },
  }), [preferences, ready, storageError]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useAppPreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('useAppPreferences must be used inside AppPreferencesProvider.');
  return value;
}
