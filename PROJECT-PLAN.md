# Workout Timer

## Product Specification & Technical Implementation Plan

**Version:** 1.5 (working draft)
**Initial platform:** Android
**Future platform consideration:** iOS may be added later
**Framework:** React Native + Expo + TypeScript
**Initial toolchain baseline:** Expo SDK 58, Node.js 24.22.2 (`.nvmrc`), Java 17
**Storage:** Local device storage
**Connectivity:** Offline-first

> This document is the working product and implementation plan. Items marked **Decision to confirm** should be resolved before the affected implementation phase. Defaults below make the plan actionable while preserving those decisions for review.

**Implementation status (2026-11-10):** The shared workout model, validation, duration calculation, formatting, and deterministic phase state machine have unit coverage. The Android foreground service receives workout configuration and owns phase deadlines and transitions using elapsed realtime. The API 37 emulator has verified the earlier timer to completion while locked and the current phase service changing phases and updating its notification while locked. Physical-device reliability, a full locked workout, audio, and call interruption behavior remain unverified. The Android service currently declares `specialUse` for a user-started timer; Google Play reviews this justification, so confirm release-policy eligibility before committing to a store release.

---

# 1. Project Overview

Workout Timer is an interval-training timer for creating reusable workouts and running them with accurate timing and audio cues. The initial release targets Android. The project structure should keep shared product logic and UI separate from operating-system-specific session execution so a future iOS app can reuse the domain model and much of the interface.

The app should be simple to operate during exercise, with a clear interface, large countdown display, and spoken announcements that let the user follow a workout without constantly looking at the phone.

On Android, a workout must continue accurately and provide audio cues when the app is backgrounded or the screen is locked. Background execution on iOS has different operating-system constraints and must be designed and validated separately if iOS support is approved; the Android foreground-service design is not an iOS guarantee.

## 1.1 Primary objectives

1. Allow users to create and save multiple workouts.
2. Configure exercise, rest, and recovery intervals.
3. Support multiple sets per cycle and multiple cycles per workout.
4. Show the current interval and remaining time.
5. Provide spoken announcements for interval transitions and workout progress.
6. Provide an optional three-second countdown with three short beeps.
7. On Android, continue timing and delivering audio cues when the phone is locked, subject to documented platform constraints.
8. Work without an internet connection.
9. Keep the app responsive and easy to operate during exercise.
10. Keep shared code portable enough to support a future iOS version without prematurely claiming iOS background behavior.
11. Let users control spoken voice cues and countdown beeps independently, with global defaults and per-workout overrides.
12. Keep source code readable and maintainable in the repository, with documented production build workflows and portfolio-quality project documentation.
13. Provide prominent pause/play, stop, and reset controls during a workout.
14. Pause a workout automatically during an active phone call, without playing a workout cue.
15. Support light and dark themes, following the device appearance by default and allowing an explicit user choice.

## 1.2 Out of scope for the initial Android release

- User accounts, cloud synchronisation, social features, or workout sharing.
- Fitness tracker integrations or recording repetitions, weights, or performance.
- Exercise libraries or instructions.
- Apple Watch or Wear OS integration.
- iOS release implementation (though the architecture should accommodate it).

---

# 2. Technology and Architecture

## 2.1 Recommended technologies

| Technology | Purpose |
|---|---|
| React Native | Cross-platform application UI |
| Expo | React Native development framework |
| TypeScript | Application language |
| Expo Router | Navigation |
| AsyncStorage | Initial local workout persistence |
| Android native module | Android session execution and background audio |
| Android Foreground Service | Active Android workout execution while backgrounded/locked |
| Android TextToSpeech | Android spoken announcements |
| Android native audio playback | Android countdown beeps |
| Platform audio session APIs | Mix cues with other audio without requesting focus that pauses or ducks it, where the OS permits |
| iOS native session adapter (future) | Platform-specific iOS audio/session behavior, to be evaluated before iOS work |
| Android Studio | Android SDK, emulator, and native debugging |
| Jest | Unit testing |
| Platform appearance APIs | Follow system light/dark appearance and support a saved user override |

Use an Expo development build rather than relying exclusively on Expo Go, because custom native functionality is required.

## 2.2 Shared and platform-specific boundaries

Keep the following in shared TypeScript where practical:

- Workout and session domain types.
- Duration calculation and validation.
- Deterministic phase-transition rules.
- Cue intent generation and identifiers.
- Workout library, editor, and platform-neutral screen components.
- Storage interfaces and workout persistence, with platform-specific implementations only where needed.

Keep operating-system capabilities behind platform adapters. The Android adapter owns the foreground service, Android monotonic clock access, TextToSpeech, native beep playback, and notification actions. A future iOS adapter must use iOS-supported background/audio mechanisms and be tested independently. Shared code can define commands and session snapshots, but must not assume that either OS offers identical background guarantees.

The session adapter should also surface supported audio/call interruption events to shared session policy. Platform-specific detection belongs in the adapter; the shared policy pauses silently on a detected active call and requires explicit user resume afterward.

Suggested conceptual interfaces:

```ts
export interface WorkoutSessionController {
  start(snapshot: WorkoutSessionSnapshot): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;
  getSnapshot(): Promise<WorkoutSessionSnapshot | null>;
  subscribe(listener: (snapshot: WorkoutSessionSnapshot | null) => void): () => void;
}
```

Platform selection should use React Native platform files or a small adapter registry, for example `session-controller.android.ts` and (when implemented) `session-controller.ios.ts`. Do not add an unimplemented iOS adapter just to satisfy the structure; document the boundary until iOS scope is approved.

## 2.3 Android Studio

Use Android Studio for:

- Installing and managing Android SDK versions.
- Emulator configuration.
- Native Android development and debugging.
- Inspecting logs.
- Testing foreground services.
- Building and inspecting Android packages.

The React Native app itself can be developed in the preferred code editor with Codex.

## 2.4 Android timer ownership

The Android app must not depend on JavaScript timers to keep an active workout running. Android may suspend JavaScript while the app is backgrounded. The native Android foreground service owns the active Android session clock, phase transitions, and audio scheduling; React Native displays session snapshots and sends user commands.

---

# 3. Workout Configuration

Each workout has a name and six configurable timing/structure parameters.

| Parameter | Description |
|---|---|
| Initial countdown | One-time countdown before the workout begins |
| Exercise interval | Duration of each exercise set |
| Rest interval | Rest between sets in the same cycle |
| Number of sets | Sets in each cycle |
| Recovery interval | Recovery between cycles |
| Number of cycles | Cycles in the workout |

Durations are integer seconds internally and displayed in minutes and seconds. Set and cycle counts are positive integers.

## 3.1 Additional workout setting

Each audio preference has a global default and an optional per-workout override:

| Preference | Global setting | Per-workout setting |
|---|---|---|
| Spoken voice cues | On/off; default: on | Inherit global, or explicitly on/off |
| Final 3-second beep countdown | On/off; default: on | Inherit global, or explicitly on/off |

The settings apply independently. An explicit workout choice overrides the corresponding global default; **Inherit global** follows the current global value. Global settings are defaults for new workouts and remain the fallback for existing workouts that inherit them. The editor must make the effective value clear. Changing a global default must not overwrite explicit workout overrides.

## 3.2 Workout model

```ts
export type Workout = {
  id: string;
  name: string;
  initialCountdownSeconds: number;
  exerciseIntervalSeconds: number;
  restIntervalSeconds: number;
  setsPerCycle: number;
  recoveryIntervalSeconds: number;
  numberOfCycles: number;
  audioPreferences: {
    voiceCues: boolean | null; // null means inherit the global setting
    finalCountdownBeeps: boolean | null;
  };
  createdAt: string;
  updatedAt: string;
};
```

Use unique IDs rather than array positions. A running session uses an immutable configuration snapshot, so later edits to the saved workout do not change that session.

---

# 4. Workout Execution Logic

## 4.1 Sequence

1. Optional initial countdown.
2. Exercise.
3. Rest between sets, except after the final set of a cycle.
4. Repeat exercise/rest until the cycle's final set.
5. Recovery after each non-final cycle.
6. Start the next cycle with exercise.
7. Complete immediately after the final exercise of the final cycle.

## 4.2 Exact transition rules

- Initial countdown runs once. If zero, skip it and begin cycle 1.
- Exercise runs once per set and is greater than zero.
- Rest runs after each set except the final set of a cycle. If zero, skip it and advance immediately.
- Recovery runs after the final set of each cycle except the final cycle. It replaces rest there. If zero, advance immediately to the next cycle.
- There is no rest or recovery after the final exercise of the final cycle.
- Any optional timed sequence configured as zero (the lowest allowed value) is skipped. In particular, zero recovery begins the next cycle immediately after the previous cycle's final exercise; zero rest immediately begins the next exercise set; zero initial countdown begins the workout immediately.
- Zero-length optional phases are logical transitions, not timed phases: they issue no phase-start audio, beep countdown, or time display and the engine advances synchronously until it reaches a nonzero phase or completion. The engine must guard against an unbounded transition loop.

**Decision to confirm:** This plan treats zero rest/recovery as skipped phases with no spoken “Rest”/“Recovery” announcement. If product intent is to announce these instantaneous transitions, decide before implementing the cue policy.

## 4.3 Example

For 3 cycles, 3 sets per cycle, 40-second exercise, 20-second rest, and 60-second recovery:

```text
Initial countdown
Cycle 1: Exercise 1, Rest, Exercise 2, Rest, Exercise 3, Recovery
Cycle 2: Exercise 1, Rest, Exercise 2, Rest, Exercise 3, Recovery
Cycle 3: Exercise 1, Rest, Exercise 2, Rest, Exercise 3
Workout complete
```

Recovery replaces rest after the last set of non-final cycles.

---

# 5. Workout Duration Calculation

Let I = initial countdown seconds, E = exercise seconds, R = rest seconds, S = sets per cycle, V = recovery seconds, and C = cycles.

```text
T = I + C(SE + (S - 1)R) + (C - 1)V
```

Display in readable form, such as `18 minutes`, `25 minutes 30 seconds`, or `1 hour 5 minutes`. Implement and test the calculation independently of UI. Use safe integer bounds and reject configurations whose computed duration exceeds the supported maximum.

Example: I=10, E=40, R=20, S=5, V=60, C=3 yields 970 seconds (16 minutes 10 seconds).

---

# 6. Audio Cue System

Audio is optional and controlled by user preference. Voice cues and beeps have separate effective settings, each resolved from a workout override when present or from the global setting otherwise. If a cue type is disabled, do not schedule or play any cues of that type. Audio rendering is platform-specific; cue intent and scheduling rules should be shared where practical, while actual speech and sound playback run through the platform session adapter.

## 6.0 Audio mixing with other apps

Audio cues must not intentionally pause, duck, or interrupt other device audio such as Spotify. The platform audio implementation should use a non-exclusive/mixing playback configuration and avoid requesting transient or permanent audio focus in a way that signals other apps to pause or lower volume. On Android, investigate the appropriate audio attributes/focus behavior for the supported SDK range; on iOS, use a mixing audio-session category if iOS is later approved. Platform behavior and other apps may still impose limitations, so verify the non-interruption requirement on physical devices with music playback active. If an OS/API makes this impossible for a cue path, document the limitation and choose the least disruptive supported behavior before release.

## 6.1 Spoken announcements

- Workout start: “Get ready”.
- Phase starts: “Exercise”, “Rest”, or “Recovery”.
- Eight-second upcoming-phase announcement when a timed phase has a next phase: “Rest coming up”, “Recovery coming up”, or “Exercise coming up”.
- At every cycle start, including the first: “Cycle one out of eight”, using the actual numbers.
- At the beginning of the final set of every cycle: “Last set”, including a one-set cycle.
- On completion, once: “Workout complete”.

Cycle announcement must precede the first exercise announcement for that cycle. For a one-set cycle, deliver “Cycle …” then “Last set” then “Exercise” (or document and consistently apply another order). Resuming a paused workout must not replay already delivered phase-start announcements.

### Eight-second warning

Announce the next phase when exactly eight seconds remain, if the current timed phase is longer than eight seconds and a next phase exists. No warning is issued when the current phase is eight seconds or shorter, or when there is no next phase. This resolves the boundary as: a phase beginning at exactly eight seconds receives no warning.

**Decision to confirm:** The product may prefer an immediate “coming up” warning for a phase that starts at exactly eight seconds. Current default is no warning for duration `<= 8` seconds, matching “phases shorter than eight seconds” conservatively while avoiding a cue simultaneous with phase start.

### Pause semantics for due cues

Pausing cancels pending cues associated with the current phase. On resume, cues whose intended time passed while paused are skipped, not played late; future cues not yet due are rescheduled from the resumed phase deadline/remaining time. Delivered cues remain recorded so they are never duplicated. This keeps speech and beeps from referring to time that has already elapsed.

## 6.2 Optional final-three-second beeps

When enabled, play three distinct short beeps at 3, 2, and 1 seconds remaining. Do not speak the numbers.

- Schedule against the actual phase deadline, not a repeated decrementing counter.
- Speech delays must not move beep times.
- Pause, skip, stop, and phase completion cancel pending beeps.
- Never play a late beep after the phase ends.
- Play the countdown only for timed phases of at least three seconds; phases shorter than three seconds skip it. A phase of exactly three seconds plays at most one beep at each of 3, 2, and 1 seconds according to its deadline.
- The countdown is available for initial countdown, exercise, rest, and recovery phases.

**Decision to confirm:** If “exactly three seconds” should omit the beep at the instant the phase begins due to scheduling latency, adjust the eligibility rule before native audio implementation. Current default uses an inclusive three-second threshold and deadline-based scheduling.

## 6.3 Scheduler and cue ordering

Use a central native/platform audio scheduler that prevents duplicate, stale, and unintended overlapping speech. Suggested precedence:

1. Phase transitions and phase names.
2. Cycle announcements.
3. Last-set announcements.
4. Eight-second warnings.
5. Optional beeps.

Define deterministic ordering for simultaneous speech cues. Beeps should not block transitions or cause drift. Give every phase and cue a stable unique ID, so reconnecting the UI cannot issue duplicates. Do not block timer transitions while waiting for speech synthesis.

When voice cues are disabled, suppress spoken announcements while preserving the timer and UI state. When beeps are disabled, suppress only the countdown beeps. The app must not enable one preference implicitly when the other is enabled.

---

# 7. Workout Timer State Machine

Suggested phases:

```ts
export type WorkoutPhase =
  | "initial-countdown"
  | "exercise"
  | "rest"
  | "recovery"
  | "completed";

export type WorkoutSessionStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "stopped";
```

Track phase, remaining time, phase deadline, set/cycle indexes and totals, status, phase ID, and delivered/scheduled cue IDs.

## 7.1 Timer accuracy

Use an absolute phase deadline based on the platform's monotonic clock:

```text
remaining = max(0, phaseDeadline - monotonicNow)
```

Do not treat a counter decremented once per second as the source of truth. The platform session controller owns timing, phase transitions, pause/resume, cue scheduling, and completion. The UI receives snapshots and sends commands.

## 7.2 Pause and resume

- Pause freezes the phase and saves remaining duration.
- Cancel pending cues for that phase.
- Preserve phase, set, cycle, and delivered cue IDs.
- Resume by creating a new deadline from saved remaining duration.
- Skip cues that became due while paused; reschedule only not-yet-due cues.
- Do not repeat phase/cycle/last-set announcements already delivered.

## 7.3 Skip, stop, and reset

Skip advances to the next logical phase, applying the same zero-duration rules as natural completion, and cancels cues for the skipped phase. Skipping the final exercise completes the session.

Stopping ends the active session immediately, cancels cues, stops platform session execution, and removes Android's ongoing notification. Reset clears the current session progress and returns the workout to its ready-to-start state; it does not delete or alter the saved workout definition. Confirm before stopping or resetting a running workout. Reset is available after stopping or pausing and starts a fresh session only when the user explicitly presses Play.

## 7.4 Phone call interruption

When the operating system reports that a phone call has become active during a running workout, pause the workout automatically and freeze its remaining time. Do not play a pause announcement, beep, or any other workout audio cue as part of the automatic pause. Cancel pending cues. After the call ends, leave the workout paused and require the user to press Play to resume; do not resume automatically. If the platform does not provide reliable call-state information, use its supported audio interruption signal and document the behavior.

## 7.5 Reset behavior

Reset clears elapsed session progress, current phase, set/cycle position, and cue-delivery state, then returns to a ready state based on the same saved workout snapshot. It does not delete the saved workout or change its configuration. No countdown or audio begins until the user explicitly starts the reset session.

---

# 8. Android Background Execution

This is a critical Android requirement. The timer and audio must continue when the screen is locked, another app is in use, or the display turns off, within documented Android and device constraints.

```text
React Native UI
      |
Platform session controller / native bridge
      |
Android Workout Foreground Service
      +-- Monotonic timer and state machine
      +-- Audio cue scheduler
      +-- Android TextToSpeech
      +-- Native beep playback
      +-- Persistent notification and actions
```

The Android service must start for an active workout, retain session state independently of React Native rendering, expose snapshots, support pause/resume/skip/stop, show an ongoing notification, and stop on completion or stop.

Investigate current foreground-service type, permissions, notification permission/channel, TextToSpeech lifecycle, audio focus, target SDK requirements, and manufacturer battery restrictions. Do not assume a JavaScript background task is sufficient.

Notification should show workout name, current phase, remaining time, set/cycle, and pause/resume and stop actions. Consider skip if interaction design permits.

## 8.1 Lifecycle and unexpected service termination

Handle UI destruction/recreation, app switching, screen lock/unlock, audio interruptions, duplicate start requests, and cleanup. Reconnecting the UI must never start a new workout or replay cues.

If the service terminates unexpectedly, the app must mark the active session as interrupted, show the last known snapshot and an explanation, and require the user to choose **Restart workout** or **Return to library**. Do not silently resume. This is the default recovery policy and should be confirmed before implementing recovery UX. Force-stopping the app or manually stopping its service is outside the uninterrupted-execution guarantee.

---

# 9. User Interface

Initial Android release has four primary screens.

## 9.1 Workout Library

List saved workouts with name, estimated duration, Start, Edit, Duplicate, and Delete actions; provide Add Workout and an empty state.

## 9.2 Workout Editor

Sections: General (name), Timing (initial countdown, exercise, rest, recovery), Structure (sets/cycles), Audio (voice cues and beep countdown, each with Inherit global/On/Off choices), Summary (estimated duration). Show effective values when inheriting. Use clear numeric duration inputs, validation messages, and Save/Cancel actions. Invalid workouts cannot be saved.

## 9.3 Active Workout

Show phase, large countdown, set and cycle, next phase and duration, overall progress, and a prominent large Pause/Play button while a workout is running or paused. Also provide Skip, Stop, and Reset controls. Distinguish Exercise, Rest, and Recovery clearly. Stop and Reset require confirmation while the workout is running.

```text
KETTLEBELL CIRCUIT
        EXERCISE
          00:32
       SET 2 OF 5
      CYCLE 1 OF 3
      NEXT: REST (20s)
       [ PAUSE ]
 [ SKIP ] [ RESET ] [ STOP ]
```

## 9.4 Completion

Show completion, workout name, actual elapsed duration, Start Again, and Return to Library. Do not add performance tracking in the first release.

## 9.5 Design direction

Modern minimal fitness interface with light and dark themes, high contrast, large timer digits, phase differentiation, large touch targets, responsive layouts, and minimal animation. Follow the device's system appearance by default.

## 9.6 Global settings

Provide global defaults for spoken voice cues and final three-second beeps. These are independent controls, used for new workouts and for any workout preference set to **Inherit global**. Include clear explanatory copy and do not silently change explicit workout overrides.

Provide a theme preference with three options: **System** (default), **Light**, and **Dark**. System follows the device's current appearance and updates when the system setting changes. Persist the user's choice locally.

---

# 10. Data Persistence

Persist workout definitions locally in app-private storage, so they survive ordinary app restarts and app updates. Store a versioned JSON document initially: this is a reasonable standard for a small, local, offline-first collection of structured records and works well with explicit schema migrations. Do not use exported/minified bundle files or cache directories for user data. Keep the storage API independent of UI; if data volume, query needs, transactional requirements, or corruption resilience grow, consider a local database such as SQLite rather than forcing JSON to fit.

Load on launch; support create/edit/delete/duplicate; retain data across updates; operate offline. Keep global settings, saved workout definitions, and active session state logically separate. Start a session from an immutable workout snapshot. Version the storage schema and provide tested migrations from every released schema. Migration failure must preserve the original data until a safe recovery path is available; never silently replace unreadable user data with an empty collection.

The storage API should be independent of UI so the persistence mechanism can change without changing workout-domain logic. Persist global preferences as versioned app settings, separately from workout records. A workout audio value of `null` means inherit; `true` or `false` means an explicit override.

---

# 11. Validation Rules

Implement validation independently of UI:

- Name is non-empty after trimming.
- Exercise duration is greater than zero.
- Set and cycle counts are positive integers.
- Initial countdown, rest, and recovery may be zero.
- Durations are whole seconds; negative and fractional values are invalid.
- Enforce upper bounds that prevent unsafe integer overflow and unsupported workout lengths.
- Calculate estimated duration safely.

Show understandable editor errors.

Validate persisted documents when loading as well as when saving. Handle unknown schema versions and malformed JSON without destructive fallback. Keep migration code deterministic and test fixtures for each supported prior schema.

---

# 12. Project Structure

Organize by shared product/domain code and platform-specific adapters from the start. This enables future iOS work without implying that Android native service code is portable.

```text
workout-timer/
├── src/
│   ├── app/                          # Shared Expo Router screens/routes
│   ├── components/                   # Shared UI components
│   ├── features/
│   │   ├── workouts/                 # Library/editor flows
│   │   └── session/                  # Session UI and shared view models
│   ├── domain/                       # Platform-neutral rules
│   │   ├── workout.ts
│   │   ├── workout-engine.ts
│   │   ├── duration.ts
│   │   └── validation.ts
│   ├── storage/                      # Versioned JSON repository and migrations initially
│   ├── settings/                     # Global defaults and effective-preference resolution
│   ├── session/
│   │   ├── types.ts                  # Commands, snapshots, controller contract
│   │   ├── session-controller.ts     # Platform selection/facade
│   │   ├── session-controller.android.ts
│   │   └── session-controller.ios.ts # Add when iOS implementation is approved
│   ├── theme/                        # Shared design tokens
│   └── platform/                     # Optional OS-specific utilities
├── modules/
│   └── workout-session/
│       └── android/                  # Android service, bridge, audio, notification
├── ios/                              # Generated native project (ignored by Git)
├── android/                          # Generated native project (ignored by Git)
├── tests/                            # Domain/controller contract tests
├── docs/
│   ├── ARCHITECTURE.md
│   └── TESTING.md
├── app.json
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore
```

Do not create placeholder iOS native code or claim iOS background support before its behavior is designed and tested. Use Expo Continuous Native Generation: generated `android/` and `ios/` directories are ignored by Git, while custom native module source under `modules/` and app configuration remain tracked. Adjust the structure if the implementation remains simpler without weakening the shared/platform boundary.

---

# 13. Development Plan

Build incrementally. Validate Android background execution early, before extensive UI work.

## Phase 1 — Project Foundation

- Inspect Node.js, Java, Android SDK, Android Studio, and Expo tooling.
- Initialize Expo React Native project, TypeScript strict mode, and Expo Router.
- Use the current stable Expo SDK and keep the Node.js version pinned in `.nvmrc`.
- Establish shared/platform-specific module boundaries.
- Configure Android package identifier, lint/format, and unit tests.
- Establish readable, non-minified source conventions and production build/minification workflow.
- Create and maintain a useful README with project purpose, setup, architecture overview, commands, and current status.
- Document setup and development commands.

**Acceptance:** launches on emulator and physical Android device; TypeScript, lint, and test commands work.

## Phase 2 — Shared Workout Domain and State Machine

Implement model, global/workout preference resolution, duration, validation, deterministic transitions, set/cycle tracking, pause/resume, skip, and completion using a controllable clock. Develop test-first: write a focused failing test for each rule or behavior before implementing it, then keep tests updated as behavior changes.

**Acceptance:** transition rules match this document, including recovery replacing rest, zero-duration phase skipping, and no final recovery; duration matches expected sequence; domain has no UI dependency.

## Phase 3 — Android Background Execution Proof of Concept

Build a minimal Android native foreground service, monotonic timer, state snapshot, TextToSpeech, beep playback, cue scheduler, notification, controls, and bridge.

Test a short workout on a physical Android device while locked through multiple transitions. Unlock and confirm the snapshot is accurate. Do not proceed to extensive UI until this succeeds.

**Acceptance:** timer and audio cues continue while locked without JavaScript execution.

## Phase 4 — Workout Persistence and Library

Implement versioned app-private JSON storage, tested migrations, global settings persistence, CRUD/duplicate, listing, empty state, and estimates. Preserve user data through app updates and handle malformed/unknown-version data safely.

**Acceptance:** workouts persist across restart; invalid configurations cannot be saved.

## Phase 5 — User Interface

Implement library, editor, active workout, completion, and settings screens. UI reflects native state accurately and remains readable during exercise.

## Phase 6 — Audio Integration

Implement independently configurable voice cues and beeps, non-interrupting audio mixing, deterministic cue ordering, eight-second boundaries, cycle and last-set announcements, cancellation, pause/resume, and reconnect duplicate prevention. Verify behavior alongside active music on physical Android devices.

Integrate platform call/audio interruption events: calls pause silently, cancel pending workout cues, preserve remaining time, and require an explicit Play action after the call.

## Phase 7 — Reliability and Testing

Test locking, background/foreground, pause/resume, skip/stop/reset, short and zero optional phases, single-set cycles, multiple cycles, call interruptions, notification actions, service cleanup, completion, UI recreation, and long sessions. Verify System/Light/Dark themes and live system appearance changes.

**Acceptance:** no timer drift, duplicate sessions/cues, orphaned service, incorrect recovery, or late beeps in supported scenarios.

## Phase 8 — Android Release

Configure release build, produce installable Android package, ensure production bundling/minification is performed by the standard build pipeline (while repository source remains non-minified), and update README and project documentation with installation/build instructions and known platform limits.

**Acceptance:** works offline without development tools; physical-device background behavior has been verified.

## Future iOS evaluation phase

Before committing to an iOS release, research current iOS background execution and audio-session rules, define supported behavior, choose an adapter implementation, and validate on physical iOS hardware. Reuse shared domain and UI where appropriate, but do not carry Android service assumptions into iOS acceptance criteria.

---

# 14. Automated Testing Requirements

Use a controllable clock; unit tests must not wait for wall-clock seconds. Follow test-driven development for domain behavior, preference resolution, persistence migrations, and regression fixes: establish expected behavior in a test before the implementation change where practical.

Test transition cases for one/multiple sets and cycles, rest/recovery, zero initial/rest/recovery, skip, pause/resume, stop/reset, completion, and exact boundaries. Test duration for single/multiple sets and cycles, zero phases, and maximum supported duration. Test preference inheritance and explicit overrides independently for voice and beeps, including changes to global defaults. Test theme system-following behavior, explicit light/dark selection, and persistence. Test call interruption pauses without emitting a cue, cancels pending cues, preserves remaining time, and does not auto-resume after the call ends. Test storage round trips, app-setting persistence, migrations from each prior schema, malformed JSON, unknown versions, and preservation of source data after migration failure. Test audio intents, no-next-phase warnings, cycle numbering, last set (including one-set cycles), beep enabled/disabled/short phases, cue cancellation, pause/resume semantics, duplicate prevention, delayed speech, and suppression when disabled. Add Android integration/manual coverage for lock/unlock, background/foreground, UI recreation, notification actions, audio focus/mixing while music plays, call interruption, service termination, and completion while UI is backgrounded.

---

# 15. Engineering Guidelines

1. Use TypeScript strict mode.
2. Separate domain, UI, and operating-system capabilities.
3. Keep workout logic deterministic and independently testable.
4. Use a platform monotonic clock for session deadlines.
5. Never use repeated JavaScript decrements as timer truth.
6. Keep Android session execution independent of React Native rendering.
7. Avoid unnecessary dependencies and permissions.
8. Use current official Android and Expo documentation.
9. Keep native modules small and manage async lifecycle safely.
10. Prevent duplicate service instances and audio cues.
11. Keep workout definitions separate from active snapshots.
12. Run tests and linting after meaningful changes.
13. Update documentation when architecture changes.
14. Do not substitute mock native functionality for production behavior.
15. Do not claim requirements work until tested.
16. Keep shared contracts portable, but permit platform-specific execution strategies.
17. Keep committed source code readable and non-minified; rely on the production toolchain to bundle/minify release artifacts.
18. Use test-driven development for core rules and regression fixes: write/adjust tests before or alongside implementation, and keep the suite as living documentation.
19. Maintain a clean repository: exclude generated build output, secrets, machine-specific files, and dependencies; commit only intentional project assets and source.
20. Keep README and docs accurate, useful, and portfolio-ready, including setup, architecture, build/release workflow, testing, and known limitations.

“Industry standards” means use current, documented conventions for the chosen React Native/Expo and Android toolchain, prefer supported APIs and maintainable defaults, and document justified exceptions. Do not introduce process or dependencies solely for formality.

Investigate current Android foreground-service permissions/types, notification permission/channel requirements, TextToSpeech lifecycle, audio focus, battery restrictions, and target SDK rules. Avoid copying obsolete manifest configuration.

---

# 16. Initial Codex Handoff

Use this prompt when implementation begins, after reviewing and accepting this plan:

> You are working on Workout Timer. Review `PROJECT-PLAN.md` and the current project state. First inspect Node.js, Java, Android SDK, Android Studio, and Expo tooling; identify missing prerequisites, recommend current dependency versions, review technical risks—especially Android foreground services and reliable background audio—and propose the Phase 1 project foundation. Do not implement the entire app at once. Follow the phases, explain architectural decisions, document deviations, and validate each phase. Prioritize reliable Android background execution. Keep shared domain/UI code separate from OS-specific session execution so a future iOS adapter can be added, but do not claim iOS background support without a separate design and device validation. Ask for clarification when a product decision marked in this plan affects the next implementation step.

---

# 17. Future Enhancements

Potential later features: custom announcements, speech rate/voice selection, custom beeps, workout history/statistics, import/export, cloud backup/synchronisation, iOS, and Wear OS. Do not implement without explicit request. iOS is a possible future platform, not an initial-release commitment. Light/dark theme support is included in the initial release.

---

# 18. Definition of Done

For the initial Android release, a user can:

1. Create, configure, save, and reuse multiple workouts with independent voice/beep preferences that inherit global defaults unless explicitly overridden.
2. See current phase, time, set, cycle, and progress.
3. Hear phase, upcoming-phase, cycle, last-set, and completion announcements.
4. Enable or disable three beeps at 3, 2, and 1 seconds for eligible phases.
5. Lock the Android phone and continue with verified timing and audio behavior on supported test devices.
6. Pause, resume, skip, and stop.
7. Complete a workout and receive completion announcement.
8. Retain workouts after app restart and use the app offline.
9. Keep saved workouts and settings across ordinary app updates, with tested migrations when a schema changes.
10. Continue other device audio without the timer intentionally pausing or ducking it, verified on supported physical devices.
11. Pause and resume with a prominent Play/Pause control, stop the workout, and reset it to a fresh ready state.
12. Automatically pause silently when a phone call begins and remain paused until the user presses Play.
13. Use System, Light, or Dark appearance, with System selected by default.

The app is reliable and accurate within the documented Android/device constraints. The priority is a dependable workout timer with audio cues, not a large feature set. A future iOS release requires its own approved scope, background behavior definition, and physical-device validation.
