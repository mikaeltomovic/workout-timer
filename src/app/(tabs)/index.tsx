import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { calculateWorkoutDurationSeconds } from '@/domain/duration';
import type { Workout } from '@/domain/workout';
import { LocalWorkoutStore } from '@/storage/workout-store';

const store = new LocalWorkoutStore();

export default function WorkoutLibraryScreen() {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setWorkouts(await store.getWorkouts());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Saved workouts could not be loaded.');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const remove = (workout: Workout) => Alert.alert('Delete workout?', '“' + workout.name + '” will be removed from this device.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void store.deleteWorkout(workout.id).then(load).catch(showError) },
  ]);
  const duplicate = (workout: Workout) => void store.duplicateWorkout(workout.id).then(load).catch(showError);
  const showError = (reason: unknown) => Alert.alert('Workout error', reason instanceof Error ? reason.message : 'Try again.');

  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}>
        <View style={styles.header}>
          <View><Text style={styles.kicker}>TRAINING, ON YOUR TERMS</Text><Text style={[styles.title, dark && styles.textDark]}>Workouts</Text></View>
          <Pressable accessibilityRole="button" style={styles.settings} onPress={() => router.push('/explore')}><Text style={styles.settingsText}>Settings</Text></Pressable>
        </View>
        <Text style={[styles.subtitle, dark && styles.secondaryDark]}>Your interval plans, ready when you are.</Text>
        {!!error && <View style={styles.errorBox}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View>}
        {!error && workouts.length === 0 && <View style={[styles.empty, dark && styles.cardDark]}>
          <Text style={styles.emptyIcon}>◷</Text>
          <Text style={[styles.emptyTitle, dark && styles.textDark]}>Make your first workout</Text>
          <Text style={[styles.emptyBody, dark && styles.secondaryDark]}>Set your work, rest, and recovery intervals. Your workouts stay on this device.</Text>
        </View>}
        {workouts.map(workout => {
          const duration = calculateWorkoutDurationSeconds(workout);
          return <View key={workout.id} style={[styles.card, dark && styles.cardDark]}>
            <View style={styles.cardTop}><View style={styles.cardTitleWrap}><Text style={[styles.cardTitle, dark && styles.textDark]}>{workout.name}</Text><Text style={[styles.meta, dark && styles.secondaryDark]}>{workout.numberOfCycles} cycles · {workout.setsPerCycle} sets · {formatDuration(duration)}</Text></View><Text style={styles.chevron}>›</Text></View>
            <View style={styles.cardActions}>
              <Pressable style={[styles.action, styles.start]} onPress={() => router.push({ pathname: '/active-workout', params: { workoutId: workout.id } })}><Text style={styles.startText}>Start</Text></Pressable>
              <Pressable style={styles.action} onPress={() => router.push({ pathname: '/workout-editor', params: { id: workout.id } })}><Text style={styles.actionText}>Edit</Text></Pressable>
              <Pressable style={styles.action} onPress={() => duplicate(workout)}><Text style={styles.actionText}>Duplicate</Text></Pressable>
              <Pressable style={styles.deleteAction} onPress={() => remove(workout)}><Text style={styles.deleteText}>Delete</Text></Pressable>
            </View>
          </View>;
        })}
        <Pressable accessibilityRole="button" style={styles.add} onPress={() => router.push('/workout-editor')}><Text style={styles.addText}>＋  Create workout</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? minutes + ' min' + (remainder ? ' ' + remainder + ' sec' : '') : seconds + ' sec';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  safeDark: { backgroundColor: '#101722' },
  textDark: { color: '#F2F5FA' },
  secondaryDark: { color: '#AAB6C6' },
  cardDark: { backgroundColor: '#192435', borderColor: '#344255' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, paddingTop: 16, paddingBottom: 40, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: '#5273A1', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#172033', fontSize: 36, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#647286', fontSize: 16, marginBottom: 8 },
  settings: { borderRadius: 20, backgroundColor: '#EAF0F7', paddingHorizontal: 15, paddingVertical: 10 },
  settingsText: { color: '#34557D', fontWeight: '700' },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 40, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E6ED', gap: 10, marginTop: 20 },
  emptyIcon: { color: '#1769D2', fontSize: 54, fontWeight: '300' },
  emptyTitle: { color: '#172033', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: '#647286', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  card: { borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E6ED', padding: 16, gap: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  cardTitleWrap: { flex: 1, gap: 5 },
  cardTitle: { color: '#172033', fontSize: 19, fontWeight: '800' },
  meta: { color: '#68778A', fontSize: 13 },
  chevron: { color: '#A3AFBE', fontSize: 25, paddingHorizontal: 4 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 40, justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: '#D6DDE6', paddingHorizontal: 13 },
  start: { backgroundColor: '#1769D2', borderColor: '#1769D2', paddingHorizontal: 18 },
  startText: { color: '#FFFFFF', fontWeight: '800' },
  actionText: { color: '#42536A', fontWeight: '700', fontSize: 13 },
  deleteAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 9 },
  deleteText: { color: '#A44646', fontWeight: '700', fontSize: 13 },
  add: { marginTop: 4, minHeight: 58, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#90A4BD', borderRadius: 16 },
  addText: { color: '#245D9E', fontWeight: '800', fontSize: 16 },
  errorBox: { padding: 16, gap: 8, borderRadius: 14, backgroundColor: '#FFF1F1' },
  error: { color: '#8E2424' },
  retry: { color: '#185AA8', fontWeight: '800' },
});
