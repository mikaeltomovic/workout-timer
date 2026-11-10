import { NativeModule, requireNativeModule } from 'expo';
import type { WorkoutSessionSnapshot } from './WorkoutSession.types';
import type { WorkoutConfiguration } from '../../../src/domain/workout';

declare class WorkoutSessionModule extends NativeModule<{
  onSnapshotChanged(event: WorkoutSessionSnapshot): void;
}> {
  start(configuration: WorkoutConfiguration): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  stop(): Promise<void>;
  reset(configuration: WorkoutConfiguration): Promise<void>;
  getSnapshot(): Promise<WorkoutSessionSnapshot | null>;
}

export default requireNativeModule<WorkoutSessionModule>('WorkoutSession');
