import type { EventSubscription } from 'expo-modules-core';
import WorkoutSessionModule from '../../modules/workout-session/src/WorkoutSessionModule';
import type { WorkoutSessionSnapshot } from '../../modules/workout-session/src/WorkoutSession.types';
import type { WorkoutConfiguration } from '@/domain/workout';

export type SessionListener = (snapshot: WorkoutSessionSnapshot) => void;

export const androidSessionController = {
  start(configuration: WorkoutConfiguration) {
    return WorkoutSessionModule.start(configuration);
  },
  pause() {
    return WorkoutSessionModule.pause();
  },
  resume() {
    return WorkoutSessionModule.resume();
  },
  skip() {
    return WorkoutSessionModule.skip();
  },
  stop() {
    return WorkoutSessionModule.stop();
  },
  reset(configuration: WorkoutConfiguration) {
    return WorkoutSessionModule.reset(configuration);
  },
  getSnapshot() {
    return WorkoutSessionModule.getSnapshot();
  },
  subscribe(listener: SessionListener): () => void {
    const subscription: EventSubscription = WorkoutSessionModule.addListener('onSnapshotChanged', listener);
    return () => subscription.remove();
  },
};
