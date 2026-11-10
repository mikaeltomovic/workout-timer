# Workout Timer

An offline-first interval workout timer for Android, planned with a shared React Native and TypeScript foundation and room for a future iOS version.

## Project status

The app now has a local workout library/editor, versioned JSON documents backed by AsyncStorage, global audio/theme settings, a large active workout screen, and an Android foreground session service with native speech/beep scheduling and call-state pause handling. The API 37 emulator has verified workout creation and persistence across app restart, active-screen navigation and controls, phase/notification updates while locked, and wake-lock release on stop. Automated checks cover 39 TypeScript tests and 6 native phase/audio-planner tests. Physical-device audio mixing, call interruption, long-session reliability, and battery behavior still need testing before a beta. See [PROJECT-PLAN.md](PROJECT-PLAN.md) for requirements and release constraints.

## Planned capabilities

- Create and reuse workouts with configurable exercise, rest, recovery, sets, and cycles.
- Run workouts with a large timer and pause, play, skip, stop, and reset controls.
- Configure voice cues and countdown beeps globally or per workout.
- Keep workout timing and audio working while an Android workout is backgrounded, subject to platform limits.
- Store workout data locally and work offline.
- Follow the device's light/dark appearance or choose a theme in settings.

## Documentation

- [Product and implementation plan](PROJECT-PLAN.md)
- [Repository guidance for Codex](AGENTS.md)

## Development

### Prerequisites

- Node.js `24.22.2` (managed with nvm; pinned in `.nvmrc`).
- Android Studio with the Android SDK, command-line tools, and an emulator or Android device.
- Java 17 for Android Gradle builds.
- Watchman on macOS for file watching.

### Install and run

```sh
nvm use
npm ci
npx expo start
```

For a local Android development build:

```sh
npx expo run:android
```

The app uses Expo Router with a library/settings tab group and stack routes for workout editing and the active session. Workouts and preferences are stored locally and are available offline.

### Native project workflow

The project uses Expo Continuous Native Generation (CNG). Generated `android/` and `ios/` directories are ignored by Git; app configuration and native module source are kept in tracked project files and `modules/`. Expo can regenerate native projects from that source when needed.

### Builds and tests

Run the shared domain unit tests and static checks with:

```sh
npm test -- --runInBand
npx tsc --noEmit
npm run lint
```

The test suite uses Jest with Expo's Jest preset. Domain tests use deterministic timestamps as a controllable monotonic clock. Run the native Android phase-rule unit tests with:

```sh
cd android
./gradlew :workout-session:testDebugUnitTest
```

Create a standalone Android alpha APK with:

```sh
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. The generated Android project remains ignored by Git. This local alpha build is suitable for sideload testing; configure a protected release signing key and Play policy eligibility before distribution. Production Gradle builds bundle/minify JavaScript while repository source remains readable.

Custom native Android source lives in `modules/workout-session`; generated `android/` and `ios/` directories remain ignored under Expo Continuous Native Generation. The foreground service uses Android's `specialUse` type, which Google Play reviews. Starting a workout requests notification permission and phone-state access; the latter enables silent auto-pause on telephony calls and does not read phone numbers. A partial wake lock is held only during a running session so scheduled cues and transitions can run while the screen is off; this can affect battery life. Physical-device checks for audio mixing, phone-call behavior, and battery use remain outstanding.

## License

No license has been selected yet. All rights are reserved unless a license is added to this repository.
