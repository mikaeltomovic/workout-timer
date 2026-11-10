import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { DEFAULT_APP_PREFERENCES, type AppPreferences } from '@/domain/app-preferences';
import { validateWorkoutConfiguration } from '@/domain/validation';
import type { Workout, WorkoutConfiguration } from '@/domain/workout';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type WorkoutDocument = { schemaVersion: 1; workouts: Workout[] };
type PreferencesDocument = { schemaVersion: 1; preferences: AppPreferences };

const asyncStorage: KeyValueStore = {
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: key => AsyncStorage.removeItem(key),
};

export class LocalWorkoutStore {
  static readonly WORKOUTS_KEY = '@workout-timer/workouts';
  static readonly PREFERENCES_KEY = '@workout-timer/preferences';

  constructor(
    private readonly storage: KeyValueStore = asyncStorage,
    private readonly createId: () => string = () => Crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async getWorkouts(): Promise<Workout[]> {
    const raw = await this.storage.getItem(LocalWorkoutStore.WORKOUTS_KEY);
    if (raw === null) return [];
    const document = parseDocument<WorkoutDocument>(raw, 'workout data');
    if (document.schemaVersion !== 1) throw new Error('The workout data uses unsupported schema version ' + String(document.schemaVersion) + '.');
    if (!Array.isArray(document.workouts) || document.workouts.some(workout => !isValidWorkout(workout))) {
      throw new Error('The workout data contains invalid workout data. The original file has been preserved.');
    }
    return document.workouts;
  }

  async saveWorkout(workout: Workout): Promise<void> {
    assertValidWorkout(workout);
    const workouts = await this.getWorkouts();
    const index = workouts.findIndex(item => item.id === workout.id);
    const next = [...workouts];
    if (index < 0) next.push(workout);
    else next[index] = workout;
    await this.writeWorkouts(next);
  }

  async deleteWorkout(id: string): Promise<void> {
    await this.writeWorkouts((await this.getWorkouts()).filter(workout => workout.id !== id));
  }

  async duplicateWorkout(id: string): Promise<Workout> {
    const source = (await this.getWorkouts()).find(workout => workout.id === id);
    if (!source) throw new Error('Workout not found.');
    const timestamp = this.now();
    const duplicate: Workout = {
      ...source,
      id: this.createId(),
      name: source.name + ' copy',
      createdAt: timestamp,
      updatedAt: timestamp,
      audioPreferences: { ...source.audioPreferences },
    };
    await this.saveWorkout(duplicate);
    return duplicate;
  }

  async getPreferences(): Promise<AppPreferences> {
    const raw = await this.storage.getItem(LocalWorkoutStore.PREFERENCES_KEY);
    if (raw === null) return clonePreferences(DEFAULT_APP_PREFERENCES);
    const document = parseDocument<PreferencesDocument>(raw, 'app preferences');
    if (document.schemaVersion !== 1) throw new Error('App preferences use unsupported schema version ' + String(document.schemaVersion) + '.');
    if (!isValidPreferences(document.preferences)) throw new Error('App preferences are invalid. The original data has been preserved.');
    return clonePreferences(document.preferences);
  }

  async savePreferences(preferences: AppPreferences): Promise<void> {
    if (!isValidPreferences(preferences)) throw new Error('App preferences are invalid.');
    const document: PreferencesDocument = { schemaVersion: 1, preferences: clonePreferences(preferences) };
    await this.storage.setItem(LocalWorkoutStore.PREFERENCES_KEY, JSON.stringify(document));
  }

  private async writeWorkouts(workouts: Workout[]): Promise<void> {
    const document: WorkoutDocument = { schemaVersion: 1, workouts };
    await this.storage.setItem(LocalWorkoutStore.WORKOUTS_KEY, JSON.stringify(document));
  }
}

function parseDocument<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('The ' + label + ' could not be read. The original data has been preserved.');
  }
}

function isValidWorkout(value: unknown): value is Workout {
  if (!value || typeof value !== 'object') return false;
  const workout = value as Partial<Workout>;
  return typeof workout.id === 'string' && workout.id.length > 0
    && typeof workout.createdAt === 'string' && typeof workout.updatedAt === 'string'
    && validateWorkoutConfiguration(workout as WorkoutConfiguration).length === 0;
}

function assertValidWorkout(workout: Workout): void {
  if (!isValidWorkout(workout)) throw new Error('Cannot save an invalid workout.');
}

function isValidPreferences(value: unknown): value is AppPreferences {
  if (!value || typeof value !== 'object') return false;
  const preferences = value as Partial<AppPreferences>;
  return !!preferences.audio
    && typeof preferences.audio.voiceCues === 'boolean'
    && typeof preferences.audio.finalCountdownBeeps === 'boolean'
    && ['system', 'light', 'dark'].includes(String(preferences.theme));
}

function clonePreferences(preferences: AppPreferences): AppPreferences {
  return { theme: preferences.theme, audio: { ...preferences.audio } };
}
