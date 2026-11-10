package com.mikaeltomovic.workoutsession

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import android.content.Intent
import android.os.Build

class WorkoutSessionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WorkoutSession")

    Events("onSnapshotChanged")

    AsyncFunction("start") { configuration: Map<String, Any?>, promise: Promise ->
      val context = appContext.reactContext ?: error("React context is unavailable.")
      val intent = sessionIntent(context, WorkoutSessionService.ACTION_START, configuration)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
      promise.resolve(null)
    }

    AsyncFunction("pause") {
      sendCommand(WorkoutSessionService.ACTION_PAUSE)
    }

    AsyncFunction("resume") {
      sendCommand(WorkoutSessionService.ACTION_RESUME)
    }

    AsyncFunction("skip") {
      sendCommand(WorkoutSessionService.ACTION_SKIP)
    }

    AsyncFunction("stop") {
      sendCommand(WorkoutSessionService.ACTION_STOP)
    }

    AsyncFunction("reset") { configuration: Map<String, Any?> ->
      val context = appContext.reactContext ?: error("React context is unavailable.")
      context.startService(sessionIntent(context, WorkoutSessionService.ACTION_RESET, configuration))
    }

    AsyncFunction("getSnapshot") {
      WorkoutSessionService.snapshot(appContext.reactContext)
    }

    OnStartObserving {
      WorkoutSessionService.observers += ::sendEvent
    }

    OnStopObserving {
      WorkoutSessionService.observers -= ::sendEvent
    }
  }

  private fun sendCommand(action: String) {
    val context = appContext.reactContext ?: error("React context is unavailable.")
    context.startService(Intent(context, WorkoutSessionService::class.java).setAction(action))
  }

  private fun sessionIntent(context: android.content.Context, action: String, configuration: Map<String, Any?>) =
    Intent(context, WorkoutSessionService::class.java)
      .setAction(action)
      .putExtra(WorkoutSessionService.EXTRA_WORKOUT_NAME, configuration["name"] as? String ?: "Workout")
      .putExtra(WorkoutSessionService.EXTRA_INITIAL_COUNTDOWN_SECONDS, configuration.long("initialCountdownSeconds"))
      .putExtra(WorkoutSessionService.EXTRA_EXERCISE_INTERVAL_SECONDS, configuration.long("exerciseIntervalSeconds"))
      .putExtra(WorkoutSessionService.EXTRA_REST_INTERVAL_SECONDS, configuration.long("restIntervalSeconds"))
      .putExtra(WorkoutSessionService.EXTRA_SETS_PER_CYCLE, configuration.int("setsPerCycle"))
      .putExtra(WorkoutSessionService.EXTRA_RECOVERY_INTERVAL_SECONDS, configuration.long("recoveryIntervalSeconds"))
      .putExtra(WorkoutSessionService.EXTRA_NUMBER_OF_CYCLES, configuration.int("numberOfCycles"))
      .putExtra(WorkoutSessionService.EXTRA_VOICE_CUES, configuration.audioPreference("voiceCues"))
      .putExtra(WorkoutSessionService.EXTRA_COUNTDOWN_BEEPS, configuration.audioPreference("finalCountdownBeeps"))

  private fun Map<String, Any?>.audioPreference(key: String): Boolean {
    val preferences = this["audioPreferences"] as? Map<*, *> ?: return true
    return preferences[key] as? Boolean ?: true
  }

  private fun Map<String, Any?>.long(key: String): Long {
    val value = this[key] as? Number ?: error("Missing numeric workout field: $key")
    val doubleValue = value.toDouble()
    require(doubleValue.isFinite() && doubleValue >= 0 && doubleValue <= MAX_SAFE_INTEGER.toDouble()) {
      "Invalid workout field: $key"
    }
    require(doubleValue % 1.0 == 0.0) { "Workout field must be a whole number: $key" }
    return value.toLong()
  }

  private fun Map<String, Any?>.int(key: String): Int {
    val value = long(key)
    require(value in 1..MAX_SUPPORTED_COUNT.toLong()) { "Invalid workout count: $key" }
    return value.toInt()
  }

  companion object {
    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991L
    private const val MAX_SUPPORTED_COUNT = 1_000_000
  }
}
