# Workout Timer

An offline-first interval workout timer for Android, planned with a shared React Native and TypeScript foundation and room for a future iOS version.

## Project status

The initial Expo project scaffold is in place. Product requirements and phased implementation details are in [PROJECT-PLAN.md](PROJECT-PLAN.md). Workout features have not been implemented yet.

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

The app uses Expo Router with routes under `src/app`. The template's starter UI is temporary and will be replaced as product screens are implemented.

### Native project workflow

The project uses Expo Continuous Native Generation (CNG). Generated `android/` and `ios/` directories are ignored by Git; app configuration and native module source are kept in tracked project files and `modules/`. Expo can regenerate native projects from that source when needed.

### Builds and tests

Release build, lint, and test workflows will be finalized as Phase 1 continues. See [PROJECT-PLAN.md](PROJECT-PLAN.md) for implementation phases and acceptance criteria. Cloud builds are optional; Android builds can be performed locally.

## License

No license has been selected yet. All rights are reserved unless a license is added to this repository.
