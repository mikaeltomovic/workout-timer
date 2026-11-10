import { getNextPhase, getPhaseDurationSeconds, type WorkoutSessionSnapshot } from './session';
import type { EffectiveAudioPreferences } from './workout';

export type AudioCueIntent =
  | { id: string; type: 'voice'; dueElapsedRealtime: number; priority: number; message: string }
  | { id: string; type: 'beep'; dueElapsedRealtime: number; priority: number; remainingSeconds: 1 | 2 | 3 };

const PHASE_VOICE_PRIORITY = 40;
const BEEP_PRIORITY = 100;

export function createPhaseEntryAudioCueIntents(
  session: WorkoutSessionSnapshot,
  phaseStartedAtElapsedRealtime: number,
  preferences: EffectiveAudioPreferences,
): AudioCueIntent[] {
  const { phase, phaseId, cycleIndex, setIndex, configuration } = session;
  const durationSeconds = getPhaseDurationSeconds(configuration, phase);
  const phaseDeadline = phaseStartedAtElapsedRealtime + durationSeconds * 1000;
  const cues: AudioCueIntent[] = [];

  const addVoice = (suffix: string, priority: number, message: string, dueElapsedRealtime = phaseStartedAtElapsedRealtime) => {
    if (preferences.voiceCues) {
      cues.push({ id: `phase:${phaseId}:voice:${suffix}`, type: 'voice', dueElapsedRealtime, priority, message });
    }
  };

  if (phase === 'completed') {
    addVoice('complete', 10, 'Workout complete');
    return cues;
  }

  if (phase === 'initial-countdown' || (phaseId === 1 && configuration.initialCountdownSeconds === 0)) {
    addVoice('ready', 10, 'Get ready');
  }

  if (phase === 'exercise') {
    if (setIndex === 1) addVoice('cycle', 20, `Cycle ${cycleIndex} out of ${configuration.numberOfCycles}`);
    if (setIndex === configuration.setsPerCycle) addVoice('last-set', 30, 'Last set');
  }

  const phaseName = voicePhaseName(phase);
  if (phaseName) addVoice('start', PHASE_VOICE_PRIORITY, phaseName);

  const nextPhase = getNextPhase(session);
  if (durationSeconds > 8 && nextPhase) {
    const upcomingName = voicePhaseName(nextPhase);
    if (upcomingName) {
      addVoice('warning-8', 80, `${upcomingName} coming up`, phaseDeadline - 8_000);
    }
  }

  if (preferences.finalCountdownBeeps && durationSeconds >= 3) {
    for (const remainingSeconds of [3, 2, 1] as const) {
      if (durationSeconds >= remainingSeconds) {
        cues.push({
          id: `phase:${phaseId}:beep:${remainingSeconds}`,
          type: 'beep',
          dueElapsedRealtime: phaseDeadline - remainingSeconds * 1000,
          priority: BEEP_PRIORITY,
          remainingSeconds,
        });
      }
    }
  }

  return cues.sort((left, right) => left.dueElapsedRealtime - right.dueElapsedRealtime || left.priority - right.priority);
}

function voicePhaseName(phase: WorkoutSessionSnapshot['phase']): string | undefined {
  switch (phase) {
    case 'exercise': return 'Exercise';
    case 'rest': return 'Rest';
    case 'recovery': return 'Recovery';
    case 'initial-countdown':
    case 'completed': return undefined;
  }
}
