import type { WorkoutConfiguration } from './workout';

export type WorkoutPhase = 'initial-countdown' | 'exercise' | 'rest' | 'recovery' | 'completed';
export type WorkoutSessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'stopped';

export type WorkoutSessionSnapshot = {
  /** Immutable copy of the configuration used by this session. */
  configuration: WorkoutConfiguration;
  status: WorkoutSessionStatus;
  phase: WorkoutPhase;
  cycleIndex: number;
  setIndex: number;
  phaseId: number;
  remainingMilliseconds: number;
  deadlineElapsedRealtime?: number;
};

const MAX_TRANSITIONS_PER_TICK = 10_000;
const MAX_ZERO_PHASE_SKIPS = 5;

export function createSession(configuration: WorkoutConfiguration): WorkoutSessionSnapshot {
  const frozenConfiguration: WorkoutConfiguration = {
    ...configuration,
    audioPreferences: { ...configuration.audioPreferences },
  };
  const phase: WorkoutPhase = configuration.initialCountdownSeconds > 0 ? 'initial-countdown' : 'exercise';
  return {
    configuration: frozenConfiguration,
    status: 'idle',
    phase,
    cycleIndex: 1,
    setIndex: 1,
    phaseId: 1,
    remainingMilliseconds: toMilliseconds(durationFor(frozenConfiguration, phase)),
  };
}

export function startSession(session: WorkoutSessionSnapshot, nowElapsedRealtime: number): WorkoutSessionSnapshot {
  if (session.status !== 'idle') return session;
  return {
    ...session,
    status: 'running',
    deadlineElapsedRealtime: safeDeadline(nowElapsedRealtime, session.remainingMilliseconds),
  };
}

export function pauseSession(session: WorkoutSessionSnapshot, nowElapsedRealtime: number): WorkoutSessionSnapshot {
  if (session.status !== 'running' || session.deadlineElapsedRealtime === undefined) return session;
  const remainingMilliseconds = Math.max(0, session.deadlineElapsedRealtime - nowElapsedRealtime);
  const { deadlineElapsedRealtime: _deadline, ...paused } = session;
  return { ...paused, status: 'paused', remainingMilliseconds };
}

export function resumeSession(session: WorkoutSessionSnapshot, nowElapsedRealtime: number): WorkoutSessionSnapshot {
  if (session.status !== 'paused') return session;
  return {
    ...session,
    status: 'running',
    deadlineElapsedRealtime: safeDeadline(nowElapsedRealtime, session.remainingMilliseconds),
  };
}

export function advanceSession(session: WorkoutSessionSnapshot, nowElapsedRealtime: number): WorkoutSessionSnapshot {
  if (session.status !== 'running' || session.deadlineElapsedRealtime === undefined) return session;

  let current = session;
  let transitions = 0;
  while (current.deadlineElapsedRealtime !== undefined && current.deadlineElapsedRealtime <= nowElapsedRealtime) {
    if (current.phase === 'completed') return current;
    if (transitions >= MAX_TRANSITIONS_PER_TICK) break;
    current = advanceOnePhase(current, current.deadlineElapsedRealtime, 'running');
    transitions += 1;
  }

  if (current.status === 'completed') return current;
  if (current.deadlineElapsedRealtime === undefined) return current;
  return {
    ...current,
    remainingMilliseconds: Math.max(0, current.deadlineElapsedRealtime - nowElapsedRealtime),
  };
}

export function skipSession(session: WorkoutSessionSnapshot, nowElapsedRealtime: number): WorkoutSessionSnapshot {
  if (session.status !== 'running' && session.status !== 'paused') return session;
  return advanceOnePhase(session, nowElapsedRealtime, session.status);
}

export function stopSession(session: WorkoutSessionSnapshot): WorkoutSessionSnapshot {
  if (session.status === 'completed' || session.status === 'stopped') return session;
  const { deadlineElapsedRealtime: _deadline, ...stopped } = session;
  return { ...stopped, status: 'stopped', remainingMilliseconds: 0 };
}

export function resetSession(session: WorkoutSessionSnapshot): WorkoutSessionSnapshot {
  if (session.status !== 'stopped' && session.status !== 'paused' && session.status !== 'completed') return session;
  return createSession(session.configuration);
}

export function getNextPhase(session: WorkoutSessionSnapshot): WorkoutPhase | undefined {
  if (session.phase === 'completed') return undefined;
  let next = transition(session);
  let skipped = 0;
  while (next.phase !== 'completed' && getPhaseDurationSeconds(next.configuration, next.phase) === 0) {
    if (skipped >= MAX_ZERO_PHASE_SKIPS) throw new RangeError('Too many zero-duration transitions while advancing a workout.');
    next = transition(next);
    skipped += 1;
  }
  return next.phase === 'completed' ? undefined : next.phase;
}

export function getPhaseDurationSeconds(configuration: WorkoutConfiguration, phase: WorkoutPhase): number {
  return durationFor(configuration, phase);
}

function advanceOnePhase(
  session: WorkoutSessionSnapshot,
  baseElapsedRealtime: number,
  status: 'running' | 'paused',
): WorkoutSessionSnapshot {
  let next = transition(session);
  if (next.phase === 'completed') {
    return { ...next, status: 'completed', remainingMilliseconds: 0, deadlineElapsedRealtime: undefined };
  }

  let skipped = 0;
  while (durationFor(next.configuration, next.phase) === 0) {
    if (skipped >= MAX_ZERO_PHASE_SKIPS) {
      throw new RangeError('Too many zero-duration transitions while advancing a workout.');
    }
    next = transition(next);
    skipped += 1;
    if (next.phase === 'completed') {
      return { ...next, status: 'completed', remainingMilliseconds: 0, deadlineElapsedRealtime: undefined };
    }
  }

  const remainingMilliseconds = toMilliseconds(durationFor(next.configuration, next.phase));
  return {
    ...next,
    status,
    remainingMilliseconds,
    deadlineElapsedRealtime: status === 'running' ? safeDeadline(baseElapsedRealtime, remainingMilliseconds) : undefined,
  };
}

function transition(session: WorkoutSessionSnapshot): WorkoutSessionSnapshot {
  const { configuration } = session;
  const base = { ...session, phaseId: session.phaseId + 1 };

  if (session.phase === 'initial-countdown') return { ...base, phase: 'exercise' };
  if (session.phase === 'rest') return { ...base, phase: 'exercise', setIndex: session.setIndex + 1 };
  if (session.phase === 'recovery') return { ...base, phase: 'exercise', cycleIndex: session.cycleIndex + 1, setIndex: 1 };
  if (session.phase !== 'exercise') return { ...base, phase: 'completed' };

  if (session.setIndex < configuration.setsPerCycle) {
    return configuration.restIntervalSeconds > 0
      ? { ...base, phase: 'rest' }
      : { ...base, phase: 'exercise', setIndex: session.setIndex + 1 };
  }

  if (session.cycleIndex < configuration.numberOfCycles) {
    return configuration.recoveryIntervalSeconds > 0
      ? { ...base, phase: 'recovery' }
      : { ...base, phase: 'exercise', cycleIndex: session.cycleIndex + 1, setIndex: 1 };
  }

  return { ...base, phase: 'completed' };
}

function durationFor(configuration: WorkoutConfiguration, phase: WorkoutPhase): number {
  switch (phase) {
    case 'initial-countdown': return configuration.initialCountdownSeconds;
    case 'exercise': return configuration.exerciseIntervalSeconds;
    case 'rest': return configuration.restIntervalSeconds;
    case 'recovery': return configuration.recoveryIntervalSeconds;
    case 'completed': return 0;
  }
}

function toMilliseconds(seconds: number): number {
  const milliseconds = seconds * 1000;
  if (!Number.isSafeInteger(milliseconds)) throw new RangeError('Phase duration exceeds the safe millisecond limit.');
  return milliseconds;
}

function safeDeadline(nowElapsedRealtime: number, durationMilliseconds: number): number {
  const deadline = nowElapsedRealtime + durationMilliseconds;
  if (!Number.isSafeInteger(deadline)) throw new RangeError('Phase deadline exceeds the safe integer limit.');
  return deadline;
}
