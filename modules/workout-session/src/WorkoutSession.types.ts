export type WorkoutSessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'stopped';

export type WorkoutPhase = 'initial-countdown' | 'exercise' | 'rest' | 'recovery' | 'completed';

export type WorkoutSessionSnapshot = {
  status: WorkoutSessionStatus;
  phase: WorkoutPhase;
  cycleIndex: number;
  setIndex: number;
  phaseId: number;
  totalDurationSeconds: number;
  remainingSeconds: number;
};
