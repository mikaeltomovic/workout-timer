package com.mikaeltomovic.workoutsession

enum class WorkoutPhase(val wireName: String) {
  INITIAL_COUNTDOWN("initial-countdown"),
  EXERCISE("exercise"),
  REST("rest"),
  RECOVERY("recovery"),
  COMPLETED("completed"),
}

data class WorkoutPlan(
  val initialCountdownSeconds: Long,
  val exerciseIntervalSeconds: Long,
  val restIntervalSeconds: Long,
  val setsPerCycle: Int,
  val recoveryIntervalSeconds: Long,
  val numberOfCycles: Int,
) {
  init {
    require(initialCountdownSeconds >= 0) { "Initial countdown cannot be negative." }
    require(exerciseIntervalSeconds > 0) { "Exercise must last at least one second." }
    require(restIntervalSeconds >= 0) { "Rest cannot be negative." }
    require(setsPerCycle > 0) { "A cycle must contain at least one set." }
    require(recoveryIntervalSeconds >= 0) { "Recovery cannot be negative." }
    require(numberOfCycles > 0) { "A workout must contain at least one cycle." }
  }

  fun totalDurationSeconds(): Long {
    val exerciseTime = Math.multiplyExact(exerciseIntervalSeconds, setsPerCycle.toLong())
    val restTime = Math.multiplyExact(restIntervalSeconds, (setsPerCycle - 1).toLong())
    val cycleTime = Math.addExact(exerciseTime, restTime)
    val allCycles = Math.multiplyExact(cycleTime, numberOfCycles.toLong())
    val recoveries = Math.multiplyExact(recoveryIntervalSeconds, (numberOfCycles - 1).toLong())
    return Math.addExact(Math.addExact(initialCountdownSeconds, allCycles), recoveries)
  }
}

data class WorkoutPhaseState(
  val phase: WorkoutPhase,
  val cycleIndex: Int,
  val setIndex: Int,
  val phaseId: Long,
  val durationMilliseconds: Long,
)

/** Stateless phase rules shared by initial setup, skip, and deadline completion. */
class WorkoutPhaseMachine {
  fun initial(plan: WorkoutPlan): WorkoutPhaseState {
    return if (plan.initialCountdownSeconds > 0) {
      state(WorkoutPhase.INITIAL_COUNTDOWN, 1, 1, 1, plan.initialCountdownSeconds)
    } else {
      state(WorkoutPhase.EXERCISE, 1, 1, 1, plan.exerciseIntervalSeconds)
    }
  }

  fun next(plan: WorkoutPlan, current: WorkoutPhaseState): WorkoutPhaseState {
    if (current.phase == WorkoutPhase.COMPLETED) return current
    var next = transition(plan, current)
    var zeroDurationTransitions = 0
    while (next.phase != WorkoutPhase.COMPLETED && next.durationMilliseconds == 0L) {
      check(zeroDurationTransitions < MAX_ZERO_DURATION_TRANSITIONS) {
        "Too many zero-duration workout transitions."
      }
      next = transition(plan, next)
      zeroDurationTransitions += 1
    }
    return next
  }

  private fun transition(plan: WorkoutPlan, current: WorkoutPhaseState): WorkoutPhaseState {
    val nextId = Math.addExact(current.phaseId, 1L)
    return when (current.phase) {
      WorkoutPhase.INITIAL_COUNTDOWN -> state(WorkoutPhase.EXERCISE, current.cycleIndex, current.setIndex, nextId, plan.exerciseIntervalSeconds)
      WorkoutPhase.REST -> state(WorkoutPhase.EXERCISE, current.cycleIndex, current.setIndex + 1, nextId, plan.exerciseIntervalSeconds)
      WorkoutPhase.RECOVERY -> state(WorkoutPhase.EXERCISE, current.cycleIndex + 1, 1, nextId, plan.exerciseIntervalSeconds)
      WorkoutPhase.EXERCISE -> when {
        current.setIndex < plan.setsPerCycle && plan.restIntervalSeconds > 0 -> state(WorkoutPhase.REST, current.cycleIndex, current.setIndex, nextId, plan.restIntervalSeconds)
        current.setIndex < plan.setsPerCycle -> state(WorkoutPhase.EXERCISE, current.cycleIndex, current.setIndex + 1, nextId, plan.exerciseIntervalSeconds)
        current.cycleIndex < plan.numberOfCycles && plan.recoveryIntervalSeconds > 0 -> state(WorkoutPhase.RECOVERY, current.cycleIndex, current.setIndex, nextId, plan.recoveryIntervalSeconds)
        current.cycleIndex < plan.numberOfCycles -> state(WorkoutPhase.EXERCISE, current.cycleIndex + 1, 1, nextId, plan.exerciseIntervalSeconds)
        else -> state(WorkoutPhase.COMPLETED, current.cycleIndex, current.setIndex, nextId, 0)
      }
      WorkoutPhase.COMPLETED -> current
    }
  }

  private fun state(phase: WorkoutPhase, cycle: Int, set: Int, id: Long, seconds: Long) = WorkoutPhaseState(
    phase = phase,
    cycleIndex = cycle,
    setIndex = set,
    phaseId = id,
    durationMilliseconds = Math.multiplyExact(seconds, 1000L),
  )

  companion object {
    private const val MAX_ZERO_DURATION_TRANSITIONS = 5
  }
}
