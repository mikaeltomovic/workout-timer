export type WorkoutAudioPreferences = {
  /** null means use the current global default. */
  voiceCues: boolean | null;
  /** null means use the current global default. */
  finalCountdownBeeps: boolean | null;
};

export type GlobalAudioPreferences = {
  voiceCues: boolean;
  finalCountdownBeeps: boolean;
};

export type EffectiveAudioPreferences = GlobalAudioPreferences;

export type WorkoutConfiguration = {
  name: string;
  initialCountdownSeconds: number;
  exerciseIntervalSeconds: number;
  restIntervalSeconds: number;
  setsPerCycle: number;
  recoveryIntervalSeconds: number;
  numberOfCycles: number;
  audioPreferences: WorkoutAudioPreferences;
};

export type Workout = WorkoutConfiguration & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
