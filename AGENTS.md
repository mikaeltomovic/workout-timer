# Repository Guidance

## Start here

- Read `PROJECT-PLAN.md` before making product or architecture changes. It is the source of truth for scope, behavior, and acceptance criteria.
- If implementation reveals a conflict with the plan, explain it and update the plan when the product decision is clear. Do not silently change requirements.
- This project targets Android first. Keep shared workout logic and UI separate from operating-system-specific session execution so a future iOS version can reuse appropriate shared code. Do not assume Android background behavior or APIs apply to iOS.

## Engineering principles

- Use TypeScript strict mode and current, supported React Native, Expo, and Android APIs.
- Keep domain logic deterministic, platform-neutral, and independently testable.
- Use absolute deadlines based on a platform monotonic clock for workout timing. JavaScript interval counters must not be the source of truth for an active Android workout.
- Android background session execution and audio belong in the native Android session implementation, independent of React Native rendering.
- Keep saved workout definitions, global preferences, and active session snapshots separate.
- Store local user data in versioned app-private storage and preserve it across ordinary app updates. Implement and test explicit schema migrations; never discard unreadable data as a fallback.
- Voice cues and countdown beeps are independently configurable. Resolve per-workout overrides before global defaults, and keep the effective preference clear in the UI.
- Audio cues should not intentionally pause or duck audio from other apps. Verify platform audio behavior on physical devices and document limitations.
- Avoid unnecessary dependencies, permissions, abstractions, and platform-specific code in shared modules.

## Testing and implementation workflow

- Follow test-driven development for domain behavior, preference resolution, storage migrations, and regression fixes: define expected behavior in tests before or alongside implementation.
- Use a controllable clock for timer tests; do not wait for real seconds in unit tests.
- Run relevant tests, type checks, and linting after meaningful changes. Do not claim behavior works until it has been verified at the appropriate level, including physical-device checks for Android background behavior.
- Validate persisted data when loading. Migration failures must leave original data recoverable.
- Do not replace native functionality with mocks to make production requirements appear satisfied.

## Repository and documentation

- Keep committed source readable and non-minified. Use the standard production toolchain to bundle/minify release artifacts.
- Keep the repository focused: exclude generated build output, dependencies, secrets, and machine-specific files unless the build workflow explicitly requires otherwise.
- Keep `README.md` useful and current, covering purpose, prerequisites, setup, development commands, testing, build/release steps, architecture, and known limitations.
- Update relevant documentation when behavior, setup, or architecture changes. Keep project documentation accurate and portfolio-ready.

## Android background execution

- Before implementing or changing the foreground service, check current official Android requirements for service types, permissions, notification channels/permissions, audio focus, and target SDK behavior.
- Test lock/unlock, app backgrounding, notifications, and audio mixing on physical Android hardware.
- Do not silently restart an interrupted workout. Follow the recovery policy in `PROJECT-PLAN.md` and require a deliberate user action.
