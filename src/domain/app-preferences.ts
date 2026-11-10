import type { GlobalAudioPreferences } from './workout';

export type ThemePreference = 'system' | 'light' | 'dark';

export type AppPreferences = {
  audio: GlobalAudioPreferences;
  theme: ThemePreference;
};

export const DEFAULT_APP_PREFERENCES: Readonly<AppPreferences> = Object.freeze({
  audio: { voiceCues: true, finalCountdownBeeps: true },
  theme: 'system',
});
