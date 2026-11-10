import {
  advanceSession,
  createSession,
  pauseSession,
  resetSession,
  resumeSession,
  skipSession,
  startSession,
  stopSession,
} from '@/domain/session';
import type { WorkoutConfiguration } from '@/domain/workout';

const workout: WorkoutConfiguration = {
  name: 'Short intervals',
  initialCountdownSeconds: 2,
  exerciseIntervalSeconds: 10,
  restIntervalSeconds: 3,
  setsPerCycle: 2,
  recoveryIntervalSeconds: 4,
  numberOfCycles: 2,
  audioPreferences: { voiceCues: null, finalCountdownBeeps: null },
};

describe('workout session state machine', () => {
  it('starts with the countdown and advances by absolute deadlines', () => {
    let session = createSession(workout);
    expect(session.phase).toBe('initial-countdown');
    session = startSession(session, 1000);
    expect(session.deadlineElapsedRealtime).toBe(3000);

    session = advanceSession(session, 2999);
    expect(session.phase).toBe('initial-countdown');
    session = advanceSession(session, 3000);
    expect(session.phase).toBe('exercise');
    expect(session.deadlineElapsedRealtime).toBe(13000);
  });

  it('uses the phase deadline as the next deadline when a tick is late', () => {
    const started = startSession(createSession(workout), 0);
    const late = advanceSession(started, 12_500);
    expect(late.phase).toBe('rest');
    expect(late.setIndex).toBe(1);
    expect(late.deadlineElapsedRealtime).toBe(15_000);
    expect(late.remainingMilliseconds).toBe(2500);
  });

  it('skips zero rest and recovery phases immediately', () => {
    const noBreaks = { ...workout, initialCountdownSeconds: 0, restIntervalSeconds: 0, recoveryIntervalSeconds: 0 };
    let session = startSession(createSession(noBreaks), 0);
    expect(session.phase).toBe('exercise');
    session = advanceSession(session, 10_000);
    expect(session.phase).toBe('exercise');
    expect(session.setIndex).toBe(2);
    expect(session.cycleIndex).toBe(1);
    session = advanceSession(session, 20_000);
    expect(session.phase).toBe('exercise');
    expect(session.cycleIndex).toBe(2);
    session = advanceSession(session, 40_000);
    expect(session.status).toBe('completed');
    expect(session.phase).toBe('completed');
  });

  it('uses recovery instead of rest between cycles and completes without a final break', () => {
    let session = startSession(createSession(workout), 0);
    session = advanceSession(session, 25_000);
    expect(session.phase).toBe('recovery');
    expect(session.deadlineElapsedRealtime).toBe(29_000);
    session = advanceSession(session, 29_000);
    expect(session.phase).toBe('exercise');
    expect(session.cycleIndex).toBe(2);
    expect(session.setIndex).toBe(1);
    session = advanceSession(session, 52_000);
    expect(session.status).toBe('completed');
    expect(session.remainingMilliseconds).toBe(0);
  });

  it('preserves remaining time across pause and resume', () => {
    let session = startSession(createSession(workout), 1000);
    session = advanceSession(session, 8000);
    session = pauseSession(session, 9500);
    expect(session.status).toBe('paused');
    expect(session.remainingMilliseconds).toBe(3500);
    session = resumeSession(session, 50_000);
    expect(session.deadlineElapsedRealtime).toBe(53_500);
    session = advanceSession(session, 53_500);
    expect(session.phase).toBe('rest');
  });

  it('skip advances from running or paused state and stop/reset require deliberate action', () => {
    let session = startSession(createSession(workout), 0);
    session = skipSession(session, 1000);
    expect(session.phase).toBe('exercise');
    expect(session.deadlineElapsedRealtime).toBe(11_000);
    session = stopSession(session);
    expect(session.status).toBe('stopped');
    session = resetSession(session);
    expect(session.status).toBe('idle');
    expect(session.phase).toBe('initial-countdown');
    expect(session.deadlineElapsedRealtime).toBeUndefined();
  });

  it('keeps a skipped paused phase paused and reset waits for an explicit start', () => {
    let session = startSession(createSession(workout), 0);
    session = skipSession(session, 500);
    session = pauseSession(session, 1000);
    session = skipSession(session, 2000);
    expect(session.phase).toBe('rest');
    expect(session.status).toBe('paused');
    expect(session.deadlineElapsedRealtime).toBeUndefined();
    session = resetSession(session);
    expect(session.status).toBe('idle');
    expect(session.phase).toBe('initial-countdown');
  });

  it('does not change an inactive session when time advances', () => {
    const session = createSession(workout);
    expect(advanceSession(session, 1_000_000)).toEqual(session);
  });
});
