package com.mikaeltomovic.workoutsession

data class AudioCuePreferences(val voiceCues: Boolean, val finalCountdownBeeps: Boolean)

sealed class WorkoutAudioCue(
  val id: String,
  val dueElapsedRealtime: Long,
  val priority: Int,
) {
  class Voice(id: String, dueElapsedRealtime: Long, priority: Int, val message: String) :
    WorkoutAudioCue(id, dueElapsedRealtime, priority)

  class Beep(id: String, dueElapsedRealtime: Long, val remainingSeconds: Int) :
    WorkoutAudioCue(id, dueElapsedRealtime, 100)
}

/** Produces deterministic cue times from the same monotonic phase deadline as the timer. */
class WorkoutAudioCuePlanner {
  fun cues(
    plan: WorkoutPlan,
    phase: WorkoutPhaseState,
    phaseStartedAtElapsedRealtime: Long,
    preferences: AudioCuePreferences,
  ): List<WorkoutAudioCue> {
    val deadline = Math.addExact(phaseStartedAtElapsedRealtime, phase.durationMilliseconds)
    val cues = mutableListOf<WorkoutAudioCue>()
    fun voice(suffix: String, priority: Int, message: String, due: Long = phaseStartedAtElapsedRealtime) {
      if (preferences.voiceCues) cues += WorkoutAudioCue.Voice("phase:${phase.phaseId}:voice:$suffix", due, priority, message)
    }

    if (phase.phase == WorkoutPhase.COMPLETED) {
      voice("complete", 10, "Workout complete")
      return cues
    }
    if (phase.phase == WorkoutPhase.INITIAL_COUNTDOWN || (phase.phaseId == 1L && plan.initialCountdownSeconds == 0L)) {
      voice("ready", 10, "Get ready")
    }
    if (phase.phase == WorkoutPhase.EXERCISE) {
      if (phase.setIndex == 1) voice("cycle", 20, "Cycle ${phase.cycleIndex} out of ${plan.numberOfCycles}")
      if (phase.setIndex == plan.setsPerCycle) voice("last-set", 30, "Last set")
    }
    phaseName(phase.phase)?.let { voice("start", 40, it) }

    val nextPhase = nextTimedPhase(plan, phase)
    if (phase.durationMilliseconds > 8_000L && nextPhase != null) {
      phaseName(nextPhase)?.let { voice("warning-8", 80, "$it coming up", deadline - 8_000L) }
    }
    if (preferences.finalCountdownBeeps && phase.durationMilliseconds >= 3_000L) {
      for (seconds in 3 downTo 1) {
        cues += WorkoutAudioCue.Beep("phase:${phase.phaseId}:beep:$seconds", deadline - seconds * 1_000L, seconds)
      }
    }
    return cues.sortedWith(compareBy<WorkoutAudioCue> { it.dueElapsedRealtime }.thenBy { it.priority })
  }

  private fun nextTimedPhase(plan: WorkoutPlan, current: WorkoutPhaseState): WorkoutPhase? {
    val next = WorkoutPhaseMachine().next(plan, current)
    return next.phase.takeUnless { it == WorkoutPhase.COMPLETED }
  }

  private fun phaseName(phase: WorkoutPhase): String? = when (phase) {
    WorkoutPhase.EXERCISE -> "Exercise"
    WorkoutPhase.REST -> "Rest"
    WorkoutPhase.RECOVERY -> "Recovery"
    WorkoutPhase.INITIAL_COUNTDOWN, WorkoutPhase.COMPLETED -> null
  }
}
