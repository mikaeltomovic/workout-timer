import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ThemePreference } from '@/domain/app-preferences';
import { useAppPreferences } from '@/state/app-preferences';

const themes: ThemePreference[] = ['system', 'light', 'dark'];

export default function SettingsScreen() {
  const { preferences, updatePreferences, storageError } = useAppPreferences();
  const dark = useColorScheme() === 'dark';
  const [saving, setSaving] = useState(false);
  const save = async (next: typeof preferences) => {
    setSaving(true);
    try { await updatePreferences(next); }
    catch (error) { Alert.alert('Settings not saved', error instanceof Error ? error.message : 'Try again.'); }
    finally { setSaving(false); }
  };
  return (
    <SafeAreaView style={[styles.safe, dark && styles.safeDark]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>PERSONALIZE</Text>
        <Text style={[styles.title, dark && styles.textDark]}>Settings</Text>
        <Text style={[styles.intro, dark && styles.secondaryDark]}>Choose your defaults. A workout can override either audio setting.</Text>
        {storageError && <Text style={styles.error}>Saved preferences could not be read and are preserved. Settings are read-only until this data is recovered: {storageError}</Text>}
        <View style={[styles.card, dark && styles.cardDark]}>
          <SettingRow dark={dark} title="Voice cues" description="Spoken phase and workout announcements" value={preferences.audio.voiceCues} disabled={saving} onChange={voiceCues => void save({ ...preferences, audio: { ...preferences.audio, voiceCues } })} />
          <View style={styles.divider} />
          <SettingRow dark={dark} title="Countdown beeps" description="Three short beeps before a phase ends" value={preferences.audio.finalCountdownBeeps} disabled={saving} onChange={finalCountdownBeeps => void save({ ...preferences, audio: { ...preferences.audio, finalCountdownBeeps } })} />
        </View>
        <Text style={[styles.section, dark && styles.textDark]}>Appearance</Text>
        <Text style={[styles.intro, dark && styles.secondaryDark]}>System follows your device setting. Choose a theme to override it.</Text>
        <View style={styles.themes}>{themes.map(theme => <Pressable key={theme} onPress={() => void save({ ...preferences, theme })} style={[styles.theme, preferences.theme === theme && styles.themeSelected]}><Text style={[styles.themeText, preferences.theme === theme && styles.themeTextSelected]}>{theme[0].toUpperCase() + theme.slice(1)}</Text></Pressable>)}</View>
        <Text style={styles.note}>Settings are saved on this device. Workout definitions and preferences remain available offline.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({ title, description, value, disabled, dark, onChange }: { title: string; description: string; value: boolean; disabled: boolean; dark: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.rowText}><Text style={[styles.rowTitle, dark && styles.textDark]}>{title}</Text><Text style={[styles.rowDescription, dark && styles.secondaryDark]}>{description}</Text></View><Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: '#1769D2' }} /></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  safeDark: { backgroundColor: '#101722' },
  textDark: { color: '#F2F5FA' },
  secondaryDark: { color: '#AAB6C6' },
  cardDark: { backgroundColor: '#192435', borderColor: '#344255' },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: 24, gap: 14 },
  kicker: { color: '#5273A1', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#172033', fontSize: 36, fontWeight: '800' },
  intro: { color: '#647286', fontSize: 15, lineHeight: 22 },
  card: { borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E6ED', paddingHorizontal: 16, marginTop: 10 },
  row: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { color: '#172033', fontSize: 16, fontWeight: '800' },
  rowDescription: { color: '#68778A', fontSize: 13, lineHeight: 18 },
  divider: { height: 1, backgroundColor: '#E7EBF0' },
  section: { color: '#172033', fontSize: 18, fontWeight: '800', marginTop: 12 },
  themes: { flexDirection: 'row', gap: 10 },
  theme: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#CCD4E0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  themeSelected: { borderColor: '#1769D2', backgroundColor: '#E5F0FF' },
  themeText: { color: '#46566D', fontWeight: '700' },
  themeTextSelected: { color: '#1556A8' },
  note: { color: '#79869A', fontSize: 13, lineHeight: 19, marginTop: 20 },
  error: { color: '#922F2F', backgroundColor: '#FFF0F0', padding: 12, borderRadius: 12, lineHeight: 19 },
});
