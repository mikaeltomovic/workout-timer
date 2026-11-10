import { LocalWorkoutStore, type KeyValueStore } from '@/storage/workout-store';
import { DEFAULT_APP_PREFERENCES } from '@/domain/app-preferences';
import type { Workout } from '@/domain/workout';

jest.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'generated-id' }));

class MemoryKeyValueStore implements KeyValueStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

const workout: Workout = {
  id: 'workout-1', name: 'Intervals', initialCountdownSeconds: 3,
  exerciseIntervalSeconds: 30, restIntervalSeconds: 10, setsPerCycle: 3,
  recoveryIntervalSeconds: 45, numberOfCycles: 2,
  audioPreferences: { voiceCues: null, finalCountdownBeeps: false },
  createdAt: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z',
};

describe('LocalWorkoutStore', () => {
  it('round trips workouts and app preferences in separate versioned documents', async () => {
    const storage = new MemoryKeyValueStore();
    const store = new LocalWorkoutStore(storage);
    await store.saveWorkout(workout);
    await store.savePreferences({ ...DEFAULT_APP_PREFERENCES, audio: { voiceCues: false, finalCountdownBeeps: true }, theme: 'dark' });

    expect(await store.getWorkouts()).toEqual([workout]);
    expect(await store.getPreferences()).toEqual({ audio: { voiceCues: false, finalCountdownBeeps: true }, theme: 'dark' });
    expect(JSON.parse(storage.values.get(LocalWorkoutStore.WORKOUTS_KEY) ?? '{}').schemaVersion).toBe(1);
    expect(JSON.parse(storage.values.get(LocalWorkoutStore.PREFERENCES_KEY) ?? '{}').schemaVersion).toBe(1);
  });

  it('creates, updates, duplicates, and deletes by stable ID', async () => {
    const store = new LocalWorkoutStore(new MemoryKeyValueStore(), () => 'copy-id', () => '2026-11-10T13:00:00.000Z');
    await store.saveWorkout(workout);
    await store.saveWorkout({ ...workout, name: 'Edited' });
    const duplicate = await store.duplicateWorkout(workout.id);
    expect(duplicate).toEqual({ ...workout, id: 'copy-id', name: 'Edited copy', createdAt: '2026-11-10T13:00:00.000Z', updatedAt: '2026-11-10T13:00:00.000Z' });
    expect((await store.getWorkouts()).map(item => item.name)).toEqual(['Edited', 'Edited copy']);
    await store.deleteWorkout(workout.id);
    expect((await store.getWorkouts()).map(item => item.id)).toEqual(['copy-id']);
  });

  it('keeps malformed source data untouched and reports a recoverable error', async () => {
    const storage = new MemoryKeyValueStore();
    storage.values.set(LocalWorkoutStore.WORKOUTS_KEY, '{broken');
    const store = new LocalWorkoutStore(storage);
    await expect(store.getWorkouts()).rejects.toThrow('could not be read');
    expect(storage.values.get(LocalWorkoutStore.WORKOUTS_KEY)).toBe('{broken');
  });

  it('rejects unknown schemas without overwriting their source document', async () => {
    const storage = new MemoryKeyValueStore();
    const original = JSON.stringify({ schemaVersion: 99, workouts: [] });
    storage.values.set(LocalWorkoutStore.WORKOUTS_KEY, original);
    await expect(new LocalWorkoutStore(storage).getWorkouts()).rejects.toThrow('unsupported schema version');
    expect(storage.values.get(LocalWorkoutStore.WORKOUTS_KEY)).toBe(original);
  });

  it('rejects invalid persisted workout records', async () => {
    const storage = new MemoryKeyValueStore();
    storage.values.set(LocalWorkoutStore.WORKOUTS_KEY, JSON.stringify({ schemaVersion: 1, workouts: [{ ...workout, exerciseIntervalSeconds: 0 }] }));
    await expect(new LocalWorkoutStore(storage).getWorkouts()).rejects.toThrow('invalid workout data');
  });

  it('returns defaults only when app preferences have never been written', async () => {
    expect(await new LocalWorkoutStore(new MemoryKeyValueStore()).getPreferences()).toEqual(DEFAULT_APP_PREFERENCES);
  });
});
