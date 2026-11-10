import { calculateWorkoutDurationSeconds } from './duration';
import type { WorkoutConfiguration } from './workout';

export const MAX_WORKOUT_COUNT = 1_000_000;

export type WorkoutValidationIssue = {
  field: string;
  code: 'required' | 'integer' | 'minimum' | 'unsupported';
  message: string;
};

export function validateWorkoutConfiguration(value: unknown): WorkoutValidationIssue[] {
  if (!value || typeof value !== 'object') {
    return [{ field: 'workout', code: 'unsupported', message: 'Workout must be an object.' }];
  }
  const workout = value as Partial<WorkoutConfiguration>;
  const issues: WorkoutValidationIssue[] = [];
  if (typeof workout.name !== 'string' || workout.name.trim().length === 0) {
    issues.push({ field: 'name', code: 'required', message: 'Enter a workout name.' });
  }

  const durations: [keyof WorkoutConfiguration, unknown, number][] = [
    ['initialCountdownSeconds', workout.initialCountdownSeconds, 0],
    ['exerciseIntervalSeconds', workout.exerciseIntervalSeconds, 1],
    ['restIntervalSeconds', workout.restIntervalSeconds, 0],
    ['recoveryIntervalSeconds', workout.recoveryIntervalSeconds, 0],
  ];
  for (const [field, value, minimum] of durations) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      issues.push({ field, code: 'integer', message: 'Enter a whole number of seconds.' });
    } else if (value < minimum) {
      issues.push({ field, code: 'minimum', message: minimum === 0 ? 'Value cannot be negative.' : 'Exercise duration must be at least one second.' });
    }
  }

  const counts: [keyof WorkoutConfiguration, unknown][] = [
    ['setsPerCycle', workout.setsPerCycle],
    ['numberOfCycles', workout.numberOfCycles],
  ];
  for (const [field, value] of counts) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      issues.push({ field, code: 'integer', message: 'Enter a whole number.' });
    } else if (value < 1) {
      issues.push({ field, code: 'minimum', message: 'Value must be at least one.' });
    } else if (value > MAX_WORKOUT_COUNT) {
      issues.push({ field, code: 'unsupported', message: `Value cannot exceed ${MAX_WORKOUT_COUNT.toLocaleString()}.` });
    }
  }

  const preferences = workout.audioPreferences as Record<string, unknown> | undefined;
  for (const key of ['voiceCues', 'finalCountdownBeeps']) {
    if (!preferences || !(preferences[key] === null || typeof preferences[key] === 'boolean')) {
      issues.push({ field: `audioPreferences.${key}`, code: 'unsupported', message: 'Choose on, off, or inherit the global preference.' });
    }
  }

  if (issues.length === 0) {
    try {
      calculateWorkoutDurationSeconds(workout as WorkoutConfiguration);
    } catch {
      issues.push({ field: 'duration', code: 'unsupported', message: 'The total workout duration is too large.' });
    }
  }
  return issues;
}
