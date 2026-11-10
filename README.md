# Workout Timer

An offline-first interval workout timer for Android, planned with a shared React Native and TypeScript foundation and room for a future iOS version.

## Project status

The shared workout model, validation, duration calculation, duration display, deterministic phase state machine, audio preference resolution, and phase-entry cue-intent scheduling are implemented and covered by unit tests. The Android foreground service receives workout configuration and owns phase deadlines and transitions, service snapshots, and notification controls. The API 37 emulator has verified the earlier timer to completion while locked and the current phase service changing phases and updating its notification while locked. Android speech/beep playback, physical-device reliability, full locked-workout behavior, and audio mixing checks are still outstanding. Product requirements and phased implementation details are in [PROJECT-PLAN.md](PROJECT-PLAN.md).

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

The app uses Expo Router with routes under `src/app`. On Android, the home screen currently exposes a two-cycle sample workout for exercising the native service; this is temporary development UI, not the finished workout library.

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

Release build workflows will be finalized as Phase 1 continues. See [PROJECT-PLAN.md](PROJECT-PLAN.md) for implementation phases and acceptance criteria. Cloud builds are optional; Android builds can be performed locally.

Custom native Android source lives in `modules/workout-session`; generated `android/` and `ios/` directories remain ignored under the Expo Continuous Native Generation workflow. The foreground service currently uses Android's `specialUse` type for a user-started workout timer. Google Play reviews the declared reason for this type; release eligibility must be checked against current Play policy. Physical-device checks for lock-screen timing, notification behavior, audio mixing, and interruptions are still outstanding.

## License

No license has been selected yet. All rights are reserved unless a license is added to this repository.
