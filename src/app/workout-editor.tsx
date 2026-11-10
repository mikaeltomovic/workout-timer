import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { validateWorkoutConfiguration } from '@/domain/validation';
import type { Workout, WorkoutAudioPreferences, WorkoutConfiguration } from '@/domain/workout';
import { LocalWorkoutStore } from '@/storage/workout-store';
import { useAppPreferences } from '@/state/app-preferences';

const store = new LocalWorkoutStore();
const blank: WorkoutConfiguration = {
  name: '',
  initialCountdownSeconds: 3,
  exerciseIntervalSeconds: 30,
  restIntervalSeconds: 15,
  setsPerCycle: 3,
  recoveryIntervalSeconds: 60,
  numberOfCycles: 2,
  audioPreferences: { voiceCues: null, finalCountdownBeeps: null },
};
const fields: { key: keyof Omit<WorkoutConfiguration, 'audioPreferences' | 'name'>; label: string; optional?: boolean }[] = [
  { key: 'initialCountdownSeconds', label: 'Initial countdown', optional: true },
  { key: 'exerciseIntervalSeconds', label: 'Exercise' },
  { key: 'restIntervalSeconds', label: 'Rest between sets', optional: true },
  { key: 'setsPerCycle', label: 'Sets per cycle' },
  { key: 'recoveryIntervalSeconds', label: 'Recovery between cycles', optional: true },
  { key: 'numberOfCycles', label: 'Cycles' },
];

export default function WorkoutEditorScreen() {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { preferences } = useAppPreferences();
  const [workout, setWorkout] = useState<WorkoutConfiguration>(blank);
  const [saved, setSaved] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [issues, setIssues] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    void store.getWorkouts().then(items => {
      const value = items.find(item => item.id === id);
      if (!value) throw new Error('This workout could not be found.');
      setSaved(value);
      setWorkout({
        name: value.name,
        initialCountdownSeconds: value.initialCountdownSeconds,
        exerciseIntervalSeconds: value.exerciseIntervalSeconds,
        restIntervalSeconds: value.restIntervalSeconds,
        setsPerCycle: value.setsPerCycle,
        recoveryIntervalSeconds: value.recoveryIntervalSeconds,
        numberOfCycles: value.numberOfCycles,
        audioPreferences: { ...value.audioPreferences },
      });
    }).catch(error => Alert.alert('Could not open workout', error instanceof Error ? error.message : 'Try again.'))
      .finally(() => setLoading(false));
  }, [id]);

  const updateAudio = (key: keyof WorkoutAudioPreferences, value: boolean | null) => {
    setWorkout(current => ({ ...current, audioPreferences: { ...current.audioPreferences, [key]: value } }));
  };

  const save = async () => {
    const validation = validateWorkoutConfiguration(workout);
    if (validation.length) {
      setIssues(validation.map(issue => issue.message));
      return;
    }
    const timestamp = new Date().toISOString();
    const value: Workout = {
      ...workout,
      name: workout.name.trim(),
      id: saved?.id ?? Crypto.randomUUID(),
      createdAt: saved?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    try {
      await store.saveWorkout(value);
      router.back();
    } catch (error) {
      Alert.alert('Could not save workout', error instanceof Error ? error.message : 'Try again.');
    }
  };

  if (loading) return <SafeAreaView style={styles.safe}><Text style={styles.help}>Loading workout…</Text></SafeAreaView>;
  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>{saved ? 'EDIT WORKOUT' : 'NEW WORKOUT'}</Text>
        <Text style={[styles.title, dark && styles.textDark]}>{saved ? 'Tune your intervals' : 'Build a workout'}</Text>
        <Text style={styles.label}>Workout name</Text>
        <TextInput value={workout.name} onChangeText={name => setWorkout(current => ({ ...current, name }))} placeholder="e.g. Strength circuit" placeholderTextColor={dark ? '#8392A7' : undefined} style={[styles.input, dark && styles.inputDark]} />
        <Text style={[styles.section, dark && styles.textDark]}>Timing and structure</Text>
        <View style={styles.grid}>
          {fields.map(field => <View style={styles.field} key={field.key}>
            <Text style={[styles.label, dark && styles.secondaryDark]}>{field.label}{field.optional ? ' · 0 skips' : ''}</Text>
            <TextInput
              value={String(workout[field.key])}
              keyboardType="number-pad"
              onChangeText={text => setWorkout(current => ({ ...current, [field.key]: text === '' ? 0 : Number(text) }))}
              style={[styles.input, dark && styles.inputDark]}
            />
          </View>)}
        </View>
        <Text style={[styles.section, dark && styles.textDark]}>Voice announcements</Text>
        <PreferencePicker value={workout.audioPreferences.voiceCues} globalValue={preferences.audio.voiceCues} onChange={value => updateAudio('voiceCues', value)} />
        <Text style={[styles.section, dark && styles.textDark]}>Final countdown beeps</Text>
        <PreferencePicker value={workout.audioPreferences.finalCountdownBeeps} globalValue={preferences.audio.finalCountdownBeeps} onChange={value => updateAudio('finalCountdownBeeps', value)} />
        {issues.map((issue, index) => <Text style={styles.error} key={index}>• {issue}</Text>)}
        <View style={styles.actions}>
          <Action label="Save workout" primary onPress={() => void save()} />
          <Action label="Cancel" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PreferencePicker({ value, globalValue, onChange }: { value: boolean | null; globalValue: boolean; onChange: (value: boolean | null) => void }) {
  const options: { title: string; value: boolean | null }[] = [
    { title: 'Inherit global (' + (globalValue ? 'On' : 'Off') + ')', value: null },
    { title: 'On', value: true },
    { title: 'Off', value: false },
  ];
  return <View style={styles.choices}>{options.map(option => <Pressable key={option.title} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceSelected]}><Text style={[styles.choiceText, value === option.value && styles.choiceTextSelected]}>{option.title}</Text></Pressable>)}</View>;
}

function Action({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, primary && styles.buttonPrimary]}><Text style={[styles.buttonText, primary && styles.buttonPrimaryText]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  safeDark: { backgroundColor: '#101722' },
  textDark: { color: '#F2F5FA' },
  secondaryDark: { color: '#AAB6C6' },
  inputDark: { backgroundColor: '#192435', borderColor: '#344255', color: '#F2F5FA' },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 24, paddingBottom: 48, gap: 12 },
  kicker: { color: '#5273A1', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#172033', fontSize: 30, fontWeight: '800', marginBottom: 12 },
  section: { color: '#172033', fontSize: 18, fontWeight: '800', marginTop: 16 },
  label: { color: '#3E4C61', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  help: { padding: 24, color: '#172033' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { width: '48%', flexGrow: 1 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#D6DCE5', borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: '#172033', fontSize: 17 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#CCD4E0', backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12 },
  choiceSelected: { backgroundColor: '#E5F0FF', borderColor: '#216ED0' },
  choiceText: { color: '#46566D', fontSize: 13, fontWeight: '600' },
  choiceTextSelected: { color: '#1556A8' },
  actions: { gap: 10, marginTop: 16 },
  button: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#CAD3E0', backgroundColor: '#FFFFFF' },
  buttonPrimary: { backgroundColor: '#1769D2', borderColor: '#1769D2' },
  buttonText: { color: '#1B283B', fontSize: 16, fontWeight: '800' },
  buttonPrimaryText: { color: '#FFFFFF' },
  error: { color: '#A62929', fontSize: 14 },
});
