import type { EffectiveAudioPreferences, GlobalAudioPreferences, WorkoutAudioPreferences } from './workout';

export const DEFAULT_GLOBAL_AUDIO_PREFERENCES: Readonly<GlobalAudioPreferences> = Object.freeze({
  voiceCues: true,
  finalCountdownBeeps: true,
});

export function resolveAudioPreferences(
  workout: WorkoutAudioPreferences,
  global: GlobalAudioPreferences = DEFAULT_GLOBAL_AUDIO_PREFERENCES,
): EffectiveAudioPreferences {
  return {
    voiceCues: workout.voiceCues ?? global.voiceCues,
    finalCountdownBeeps: workout.finalCountdownBeeps ?? global.finalCountdownBeeps,
  };
}
