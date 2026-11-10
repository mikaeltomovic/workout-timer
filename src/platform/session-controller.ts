import type { WorkoutSessionSnapshot } from '../../modules/workout-session/src/WorkoutSession.types';
import type { WorkoutConfiguration } from '@/domain/workout';

/** The workout service is currently implemented for Android only. */
export const androidSessionController = {
  start(_configuration: WorkoutConfiguration): Promise<void> {
    return Promise.reject(new Error('The native workout session is only available on Android.'));
  },
  pause(): Promise<void> {
    return Promise.reject(new Error('The native workout session is only available on Android.'));
  },
  resume(): Promise<void> {
    return Promise.reject(new Error('The native workout session is only available on Android.'));
  },
  skip(): Promise<void> {
    return Promise.reject(new Error('The native workout session is only available on Android.'));
  },
  stop(): Promise<void> {
    return Promise.reject(new Error('The native workout session is only available on Android.'));
  },
  reset(_configuration: WorkoutConfiguration): Promise<void> {
    return Promise.reject(new Error('The native workout session is only available on Android.'));
  },
  getSnapshot(): Promise<WorkoutSessionSnapshot | null> {
    return Promise.reject(new Error('The native workout session is only available on Android.'));
  },
  subscribe(_listener: (snapshot: WorkoutSessionSnapshot) => void): () => void {
    return () => undefined;
  },
};
