import { Stack } from 'expo-router';
import { AppPreferencesProvider } from '@/state/app-preferences';

export default function RootLayout() {
  return <AppPreferencesProvider><Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="workout-editor" />
    <Stack.Screen name="active-workout" />
  </Stack></AppPreferencesProvider>;
}
