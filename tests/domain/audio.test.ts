import { resolveAudioPreferences, DEFAULT_GLOBAL_AUDIO_PREFERENCES } from '@/domain/audio-preferences';
import { createPhaseEntryAudioCueIntents } from '@/domain/audio-cues';
import { createSession } from '@/domain/session';
import type { WorkoutConfiguration } from '@/domain/workout';

const configuration: WorkoutConfiguration = {
  name: 'One set demo',
  initialCountdownSeconds: 0,
  exerciseIntervalSeconds: 12,
  restIntervalSeconds: 0,
  setsPerCycle: 1,
  recoveryIntervalSeconds: 0,
  numberOfCycles: 1,
  audioPreferences: { voiceCues: null, finalCountdownBeeps: null },
};

describe('audio preference resolution', () => {
  it('defaults global voice and beep preferences to on', () => {
    expect(DEFAULT_GLOBAL_AUDIO_PREFERENCES).toEqual({ voiceCues: true, finalCountdownBeeps: true });
  });

  it('uses global values for inherited workout preferences', () => {
    expect(resolveAudioPreferences(configuration.audioPreferences, { voiceCues: false, finalCountdownBeeps: true }))
      .toEqual({ voiceCues: false, finalCountdownBeeps: true });
  });

  it('applies each explicit workout override independently', () => {
    expect(resolveAudioPreferences(
      { voiceCues: true, finalCountdownBeeps: false },
      { voiceCues: false, finalCountdownBeeps: true },
    )).toEqual({ voiceCues: true, finalCountdownBeeps: false });
  });
});

describe('phase entry audio cue intents', () => {
  it('orders cycle, last-set, and phase announcements before deadline-based beeps', () => {
    const session = createSession(configuration);
    const cues = createPhaseEntryAudioCueIntents(session, 1000, { voiceCues: true, finalCountdownBeeps: true });

    expect(cues.map(cue => cue.type === 'voice' ? cue.message : cue.remainingSeconds)).toEqual([
      'Get ready',
      'Cycle 1 out of 1',
      'Last set',
      'Exercise',
      3,
      2,
      1,
    ]);
    expect(cues.map(cue => cue.dueElapsedRealtime)).toEqual([1000, 1000, 1000, 1000, 10000, 11000, 12000]);
    expect(new Set(cues.map(cue => cue.id)).size).toBe(cues.length);
  });

  it('does not emit disabled cue types', () => {
    const cues = createPhaseEntryAudioCueIntents(createSession(configuration), 0, {
      voiceCues: false,
      finalCountdownBeeps: true,
    });
    expect(cues.every(cue => cue.type === 'beep')).toBe(true);
    expect(cues).toHaveLength(3);
  });

  it('does not beep for phases shorter than three seconds', () => {
    const shortPhase = { ...configuration, exerciseIntervalSeconds: 2 };
    const cues = createPhaseEntryAudioCueIntents(createSession(shortPhase), 0, {
      voiceCues: false,
      finalCountdownBeeps: true,
    });
    expect(cues).toEqual([]);
  });

  it('schedules an eight-second warning only when the phase is longer than eight seconds and has a next phase', () => {
    const cues = createPhaseEntryAudioCueIntents(
      createSession({ ...configuration, numberOfCycles: 2 }),
      500,
      { voiceCues: true, finalCountdownBeeps: false },
    );
    expect(cues.find(cue => cue.id.endsWith('warning-8'))).toEqual({
      id: 'phase:1:voice:warning-8',
      type: 'voice',
      dueElapsedRealtime: 4_500,
      priority: 80,
      message: 'Exercise coming up',
    });

    const eightSeconds = createPhaseEntryAudioCueIntents(
      createSession({ ...configuration, exerciseIntervalSeconds: 8, numberOfCycles: 2 }),
      500,
      { voiceCues: true, finalCountdownBeeps: false },
    );
    expect(eightSeconds.some(cue => cue.id.endsWith('warning-8'))).toBe(false);
  });
});
