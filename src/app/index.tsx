import { useEffect, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { androidSessionController } from '@/platform/session-controller';
import type { WorkoutSessionSnapshot } from '../../modules/workout-session/src/WorkoutSession.types';
import type { WorkoutConfiguration } from '@/domain/workout';

const SAMPLE_WORKOUT: WorkoutConfiguration = {
  name: 'Two cycle demo',
  initialCountdownSeconds: 3,
  exerciseIntervalSeconds: 5,
  restIntervalSeconds: 2,
  setsPerCycle: 2,
  recoveryIntervalSeconds: 3,
  numberOfCycles: 2,
  audioPreferences: { voiceCues: false, finalCountdownBeeps: false },
};

export default function HomeScreen() {
  const [snapshot, setSnapshot] = useState<WorkoutSessionSnapshot | null>(null);

  useEffect(() => {
    const unsubscribe = androidSessionController.subscribe(setSnapshot);
    void androidSessionController.getSnapshot().then(setSnapshot).catch(() => undefined);
    return unsubscribe;
  }, []);

  const start = async () => {
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Notifications needed', 'Allow notifications so Android can show the active workout timer while it runs.');
          return;
        }
      }
      await androidSessionController.start(SAMPLE_WORKOUT);
    } catch (error) {
      Alert.alert('Session unavailable', error instanceof Error ? error.message : 'Could not start the timer.');
    }
  };

  const runCommand = async (command: 'pause' | 'resume' | 'skip' | 'stop') => {
    try {
      await androidSessionController[command]();
    } catch (error) {
      Alert.alert('Session unavailable', error instanceof Error ? error.message : 'Could not control the timer.');
    }
  };

  const reset = () => {
    Alert.alert('Reset workout?', 'Return this workout to its ready state?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => void androidSessionController.reset(SAMPLE_WORKOUT).catch(error => {
          Alert.alert('Reset unavailable', error instanceof Error ? error.message : 'Could not reset the workout.');
        }),
      },
    ]);
  };

  const active = snapshot?.status === 'running' || snapshot?.status === 'paused';
  const terminal = snapshot?.status === 'completed' || snapshot?.status === 'stopped';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>ANDROID TIMER PROOF OF CONCEPT</Text>
          <Text style={styles.title}>Workout Timer</Text>
          <Text style={styles.description}>
            Native session service with an elapsed-realtime clock and an ongoing notification.
          </Text>
        </View>

        <View style={styles.sessionCard}>
          <Text style={styles.label}>SESSION STATUS</Text>
          <Text style={styles.status}>{snapshot?.status ?? 'Ready'}</Text>
          {snapshot && <Text style={styles.phase}>
            {snapshot.phase === 'completed' ? 'Workout complete' : `${snapshot.phase.replace('-', ' ')} · Cycle ${snapshot.cycleIndex}, set ${snapshot.setIndex}`}
          </Text>}
          <Text style={styles.remaining}>
            {snapshot?.status === 'completed' ? 'Done' : snapshot ? `${snapshot.remainingSeconds}` : `${SAMPLE_WORKOUT.initialCountdownSeconds}`}
          </Text>
          <Text style={styles.units}>{active ? 'seconds remaining' : 'seconds until start'}</Text>
        </View>

        <View style={styles.controls}>
          {!active && (
            <ActionButton label="Start 2-cycle workout" onPress={() => void start()} primary />
          )}
          {snapshot?.status === 'running' && (
            <ActionButton label="Pause" onPress={() => void runCommand('pause')} primary />
          )}
          {snapshot?.status === 'paused' && (
            <ActionButton label="Resume" onPress={() => void runCommand('resume')} primary />
          )}
          {active && <ActionButton label="Skip phase" onPress={() => void runCommand('skip')} />}
          {active && <ActionButton label="Stop" onPress={() => void runCommand('stop')} />}
          {(terminal || snapshot?.status === 'paused') && <ActionButton label="Reset workout" onPress={reset} />}
        </View>
        <Text style={styles.note}>
          This temporary screen validates native phase timing. Audio cues, preferences, and storage are still ahead.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ActionButton({ label, onPress, primary = false }: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.primaryButton, pressed && styles.pressed]}>
      <Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FB' },
  content: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 32, justifyContent: 'center', gap: 32 },
  heading: { gap: 12 },
  eyebrow: { color: '#536174', fontSize: 12, fontWeight: '700', letterSpacing: 1.1 },
  title: { color: '#142033', fontSize: 36, fontWeight: '800' },
  description: { color: '#536174', fontSize: 16, lineHeight: 24 },
  sessionCard: { alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 32, paddingHorizontal: 20, borderColor: '#E2E8F0', borderWidth: 1 },
  label: { color: '#536174', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  status: { color: '#142033', fontSize: 22, fontWeight: '700', textTransform: 'capitalize' },
  phase: { color: '#536174', fontSize: 15, textTransform: 'capitalize' },
  remaining: { color: '#1769D2', fontSize: 72, fontWeight: '800', lineHeight: 82, fontVariant: ['tabular-nums'] },
  units: { color: '#536174', fontSize: 15 },
  controls: { gap: 12 },
  button: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#C8D3E2', backgroundColor: '#FFFFFF', paddingHorizontal: 24 },
  primaryButton: { backgroundColor: '#1769D2', borderColor: '#1769D2' },
  pressed: { opacity: 0.78 },
  buttonText: { color: '#142033', fontSize: 17, fontWeight: '700' },
  primaryButtonText: { color: '#FFFFFF' },
  note: { color: '#68778A', fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
