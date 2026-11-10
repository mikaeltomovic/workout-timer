import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getNextPhase, createSession } from '@/domain/session';
import { resolveAudioPreferences } from '@/domain/audio-preferences';
import type { Workout } from '@/domain/workout';
import { LocalWorkoutStore } from '@/storage/workout-store';
import { androidSessionController } from '@/platform/session-controller';
import type { WorkoutSessionSnapshot } from '../../modules/workout-session/src/WorkoutSession.types';
import { useAppPreferences } from '@/state/app-preferences';

const store = new LocalWorkoutStore();
export default function ActiveWorkoutScreen() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const { preferences } = useAppPreferences();
  const dark = useColorScheme() === 'dark';
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [snapshot, setSnapshot] = useState<WorkoutSessionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    void store.getWorkouts().then(items => {
      const selected = items.find(item => item.id === workoutId);
      if (!selected) throw new Error('This workout could not be found.');
      if (mounted) setWorkout(selected);
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Workout could not be loaded.'));
    const unsubscribe = androidSessionController.subscribe(setSnapshot);
    void androidSessionController.getSnapshot().then(value => { if (mounted && value) setSnapshot(value); }).catch(() => undefined);
    return () => { mounted = false; unsubscribe(); };
  }, [workoutId]);
  const run = useCallback(async (operation: () => Promise<void>) => {
    setBusy(true);
    try { await operation(); }
    catch (reason) { Alert.alert('Workout session unavailable', reason instanceof Error ? reason.message : 'Try again.'); }
    finally { setBusy(false); }
  }, []);
  const config = useMemo(() => workout ? ({
    name: workout.name,
    initialCountdownSeconds: workout.initialCountdownSeconds,
    exerciseIntervalSeconds: workout.exerciseIntervalSeconds,
    restIntervalSeconds: workout.restIntervalSeconds,
    setsPerCycle: workout.setsPerCycle,
    recoveryIntervalSeconds: workout.recoveryIntervalSeconds,
    numberOfCycles: workout.numberOfCycles,
    audioPreferences: resolveAudioPreferences(workout.audioPreferences, preferences.audio),
  }) : null, [workout, preferences.audio]);
  const start = () => run(async () => {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Allow notifications so the active workout can remain visible while your phone is locked.');
    }
    if (Platform.OS === 'android') {
      const permission = PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE;
      const alreadyGranted = await PermissionsAndroid.check(permission);
      if (!alreadyGranted) {
        const result = await PermissionsAndroid.request(permission, {
          title: 'Pause during phone calls',
          message: 'Allow phone state access so a workout pauses quietly when a call starts. Workout Timer does not read phone numbers or call details.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        });
        if (result !== PermissionsAndroid.RESULTS.GRANTED) setError('Call pausing is unavailable because phone state access was declined. The workout will still run.');
      }
    }
    if (!config) throw new Error('Workout configuration is unavailable.');
    await androidSessionController.start(config);
  });
  const active = snapshot?.status === 'running' || snapshot?.status === 'paused';
  const nextPhase = useMemo(() => {
    if (!workout || !snapshot || snapshot.phase === 'completed') return undefined;
    return getNextPhase({ ...createSession(workout), status: snapshot.status, phase: snapshot.phase, cycleIndex: snapshot.cycleIndex, setIndex: snapshot.setIndex, phaseId: snapshot.phaseId, remainingMilliseconds: snapshot.remainingSeconds * 1000 });
  }, [workout, snapshot]);
  const phaseName = snapshot?.phase === 'completed' ? 'Workout complete' : snapshot?.phase.replace('-', ' ') ?? 'Ready';
  const timer = snapshot ? formatTime(snapshot.remainingSeconds) : config ? formatTime(config.initialCountdownSeconds || config.exerciseIntervalSeconds) : '--:--';
  const colors = dark ? { background: '#101722', card: '#192435', text: '#F2F5FA', secondary: '#AAB6C6', border: '#344255' } : { background: '#F6F7F9', card: '#FFFFFF', text: '#172033', secondary: '#647286', border: '#E1E6ED' };
  const stop = () => Alert.alert('Stop workout?', 'Your current progress will end.', [{ text: 'Keep going', style: 'cancel' }, { text: 'Stop', style: 'destructive', onPress: () => void run(() => androidSessionController.stop()) }]);
  const reset = () => Alert.alert('Reset workout?', 'Return to the beginning. Press Play when ready.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => config && void run(() => androidSessionController.reset(config)) }]);

  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}><View style={styles.content}>
    <Pressable onPress={() => router.replace('/(tabs)')}><Text style={[styles.back, { color: colors.secondary }]}>‹  Workout library</Text></Pressable>
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.workoutName, { color: colors.secondary }]}>{workout?.name ?? error ?? 'Loading workout…'}</Text>
      <Text style={[styles.phase, { color: colors.text }]}>{phaseName}</Text>
      {snapshot && active && <Text style={[styles.position, { color: colors.secondary }]}>Cycle {snapshot.cycleIndex} of {workout?.numberOfCycles} · Set {snapshot.setIndex} of {workout?.setsPerCycle}</Text>}
      <Text style={[styles.timer, { color: dark ? '#77B4FF' : '#1769D2' }]}>{timer}</Text>
      <Text style={[styles.caption, { color: colors.secondary }]}>{active ? 'remaining in this interval' : snapshot?.status === 'completed' ? 'Nice work. You completed the workout.' : 'minutes : seconds'}</Text>
      {active && nextPhase && <Text style={[styles.next, { color: colors.secondary }]}>Next: {nextPhase}</Text>}
    </View>
    {!snapshot && <Button label="Start workout" primary disabled={!config || busy} onPress={start} />}
    {snapshot?.status === 'idle' && <Button label="Start workout" primary disabled={busy} onPress={start} />}
    {snapshot?.status === 'stopped' && <Button label="Start again" primary disabled={!config || busy} onPress={start} />}
    {snapshot?.status === 'completed' && <Button label="Start again" primary disabled={!config || busy} onPress={start} />}
    {snapshot?.status === 'running' && <Button label="Ⅱ   Pause" primary large disabled={busy} onPress={() => void run(() => androidSessionController.pause())} />}
    {snapshot?.status === 'paused' && <Button label="▶   Play" primary large disabled={busy} onPress={() => void run(() => androidSessionController.resume())} />}
    {active && <View style={styles.row}><Button label="Skip phase" disabled={busy} onPress={() => void run(() => androidSessionController.skip())} /><Button label="Reset" disabled={busy} onPress={reset} /><Button label="Stop" disabled={busy} onPress={stop} /></View>}
    {(snapshot?.status === 'paused' || snapshot?.status === 'stopped' || snapshot?.status === 'completed') && <Button label="Reset workout" disabled={busy} onPress={reset} />}
    {snapshot?.status === 'completed' && <Button label="Back to workouts" onPress={() => router.replace('/(tabs)')} />}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View></SafeAreaView>;
}
function formatTime(seconds: number) { return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); }
function Button({ label, onPress, primary, large, disabled }: { label: string; onPress: () => void; primary?: boolean; large?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, large && styles.largeButton, primary && styles.primary, disabled && styles.disabled]}><Text style={[styles.buttonText, primary && styles.primaryText, large && styles.largeText]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center', padding: 24, justifyContent: 'center', gap: 14 },
  back: { fontSize: 16, fontWeight: '700', marginBottom: 8 }, card: { alignItems: 'center', borderRadius: 26, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 34, gap: 8 },
  workoutName: { fontSize: 13, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', textAlign: 'center' }, phase: { fontSize: 24, fontWeight: '800', textTransform: 'capitalize', textAlign: 'center' },
  position: { fontSize: 14, fontWeight: '700', marginTop: 4 }, timer: { fontSize: 88, lineHeight: 102, fontWeight: '800', fontVariant: ['tabular-nums'] }, caption: { fontSize: 14 },
  next: { fontSize: 15, fontWeight: '700', marginTop: 16, textTransform: 'capitalize' }, button: { minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#CBD4E1', backgroundColor: '#FFFFFF', paddingHorizontal: 16 },
  largeButton: { minHeight: 70 }, primary: { backgroundColor: '#1769D2', borderColor: '#1769D2' }, buttonText: { color: '#34465E', fontSize: 15, fontWeight: '800' }, primaryText: { color: '#FFFFFF' }, largeText: { fontSize: 22 },
  disabled: { opacity: 0.55 }, row: { flexDirection: 'row', gap: 8 }, error: { color: '#A84646', textAlign: 'center', lineHeight: 20 },
});
