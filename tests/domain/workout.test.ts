import { calculateWorkoutDurationSeconds, formatDuration } from '@/domain/duration';
import { validateWorkoutConfiguration } from '@/domain/validation';
import type { WorkoutConfiguration } from '@/domain/workout';

const validConfiguration: WorkoutConfiguration = {
  name: 'Interval session',
  initialCountdownSeconds: 10,
  exerciseIntervalSeconds: 40,
  restIntervalSeconds: 20,
  setsPerCycle: 5,
  recoveryIntervalSeconds: 60,
  numberOfCycles: 3,
  audioPreferences: { voiceCues: null, finalCountdownBeeps: null },
};

describe('calculateWorkoutDurationSeconds', () => {
  it('includes rest between sets, recovery between cycles, and initial countdown', () => {
    expect(calculateWorkoutDurationSeconds(validConfiguration)).toBe(970);
  });

  it('skips zero duration sequences', () => {
    expect(calculateWorkoutDurationSeconds({
      ...validConfiguration,
      initialCountdownSeconds: 0,
      restIntervalSeconds: 0,
      recoveryIntervalSeconds: 0,
    })).toBe(600);
  });

  it('rejects totals that cannot be represented safely', () => {
    expect(() => calculateWorkoutDurationSeconds({
      ...validConfiguration,
      exerciseIntervalSeconds: Number.MAX_SAFE_INTEGER,
      setsPerCycle: 2,
    })).toThrow(RangeError);
  });

  it('rejects a total duration that loses integer precision when converted to milliseconds', () => {
    expect(() => calculateWorkoutDurationSeconds({
      ...validConfiguration,
      initialCountdownSeconds: Math.floor(Number.MAX_SAFE_INTEGER / 1000) + 1,
    })).toThrow(RangeError);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 seconds'],
    [40, '40 seconds'],
    [970, '16 minutes 10 seconds'],
    [3900, '1 hour 5 minutes'],
    [3600, '1 hour'],
  ])('formats %i seconds', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('validateWorkoutConfiguration', () => {
  it('accepts zero for optional sequences', () => {
    expect(validateWorkoutConfiguration({
      ...validConfiguration,
      initialCountdownSeconds: 0,
      restIntervalSeconds: 0,
      recoveryIntervalSeconds: 0,
    })).toEqual([]);
  });

  it.each([
    [{ ...validConfiguration, name: '  ' }, 'name'],
    [{ ...validConfiguration, exerciseIntervalSeconds: 0 }, 'exerciseIntervalSeconds'],
    [{ ...validConfiguration, restIntervalSeconds: -1 }, 'restIntervalSeconds'],
    [{ ...validConfiguration, recoveryIntervalSeconds: 0.5 }, 'recoveryIntervalSeconds'],
    [{ ...validConfiguration, setsPerCycle: 0 }, 'setsPerCycle'],
    [{ ...validConfiguration, setsPerCycle: 1_000_001 }, 'setsPerCycle'],
    [{ ...validConfiguration, numberOfCycles: 0 }, 'numberOfCycles'],
    [{ ...validConfiguration, audioPreferences: { voiceCues: 'yes', finalCountdownBeeps: null } }, 'audioPreferences.voiceCues'],
  ])('reports invalid field %s', (configuration, field) => {
    expect(validateWorkoutConfiguration(configuration as WorkoutConfiguration).map(issue => issue.field)).toContain(field);
  });
});
