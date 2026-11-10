import type { WorkoutConfiguration } from './workout';

/** Largest total that remains exactly representable after conversion to milliseconds. */
export const MAX_SUPPORTED_WORKOUT_DURATION_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

export function calculateWorkoutDurationSeconds(workout: WorkoutConfiguration): number {
  const {
    initialCountdownSeconds: initial,
    exerciseIntervalSeconds: exercise,
    restIntervalSeconds: rest,
    setsPerCycle: sets,
    recoveryIntervalSeconds: recovery,
    numberOfCycles: cycles,
  } = workout;

  // Each cycle has one exercise per set and rest only between sets.
  const perCycle = safeAdd(safeMultiply(exercise, sets), safeMultiply(rest, sets - 1));
  const betweenCycles = safeMultiply(recovery, cycles - 1);
  const totalSeconds = safeAdd(safeAdd(initial, safeMultiply(perCycle, cycles)), betweenCycles);
  if (totalSeconds > MAX_SUPPORTED_WORKOUT_DURATION_SECONDS) {
    throw new RangeError('Workout duration exceeds the safe millisecond limit.');
  }
  return totalSeconds;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError('Workout duration exceeds the safe integer limit.');
  return result;
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new RangeError('Workout duration exceeds the safe integer limit.');
  return result;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isSafeInteger(totalSeconds) || totalSeconds < 0) {
    throw new RangeError('Duration must be a non-negative safe integer.');
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds || parts.length === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(' ');
}
