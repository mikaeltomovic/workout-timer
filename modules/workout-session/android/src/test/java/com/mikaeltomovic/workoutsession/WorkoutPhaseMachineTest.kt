package com.mikaeltomovic.workoutsession

import org.junit.Assert.assertEquals
import org.junit.Test

class WorkoutPhaseMachineTest {
  @Test
  fun `creates phase audio cues in announcement order and at deadline offsets`() {
    val planner = WorkoutAudioCuePlanner()
    val plan = WorkoutPlan(0, 12, 0, 1, 0, 2)
    val phase = WorkoutPhaseMachine().initial(plan)
    val cues = planner.cues(plan, phase, 1_000L, AudioCuePreferences(true, true))

    assertEquals(
      listOf("voice:Get ready", "voice:Cycle 1 out of 2", "voice:Last set", "voice:Exercise", "voice:Exercise coming up", "beep:3", "beep:2", "beep:1"),
      cues.map { cue -> if (cue is WorkoutAudioCue.Voice) "voice:${cue.message}" else "beep:${(cue as WorkoutAudioCue.Beep).remainingSeconds}" },
    )
    assertEquals(listOf(1_000L, 1_000L, 1_000L, 1_000L, 10_000L, 11_000L, 12_000L, 5_000L).sorted(), cues.map { it.dueElapsedRealtime }.sorted())
  }

  @Test
  fun `suppresses cue types independently and omits warnings at eight seconds`() {
    val planner = WorkoutAudioCuePlanner()
    val plan = WorkoutPlan(0, 8, 0, 1, 0, 2)
    val phase = WorkoutPhaseMachine().initial(plan)

    assertEquals(emptyList<WorkoutAudioCue>(), planner.cues(plan, phase, 0L, AudioCuePreferences(false, false)))
    assertEquals(3, planner.cues(plan, phase, 0L, AudioCuePreferences(false, true)).size)
    assertEquals(0, planner.cues(plan, phase, 0L, AudioCuePreferences(true, false)).count { it is WorkoutAudioCue.Voice && it.message.endsWith("coming up") })
  }

  @Test
  fun `uses recovery after the last set and finishes without a final break`() {
    val machine = WorkoutPhaseMachine()
    val plan = WorkoutPlan(0, 10, 3, 2, 4, 2)
    var state = machine.initial(plan)
    val phases = mutableListOf<String>()
    while (state.phase != WorkoutPhase.COMPLETED) {
      phases += "${state.phase.wireName}:${state.cycleIndex}:${state.setIndex}"
      state = machine.next(plan, state)
    }

    assertEquals(
      listOf(
        "exercise:1:1", "rest:1:1", "exercise:1:2", "recovery:1:2",
        "exercise:2:1", "rest:2:1", "exercise:2:2",
      ),
      phases,
    )
  }

  @Test
  fun `zero countdown rest and recovery are skipped`() {
    val machine = WorkoutPhaseMachine()
    val plan = WorkoutPlan(0, 5, 0, 2, 0, 2)
    var state = machine.initial(plan)
    assertEquals(WorkoutPhase.EXERCISE, state.phase)
    state = machine.next(plan, state)
    assertEquals(2, state.setIndex)
    assertEquals(WorkoutPhase.EXERCISE, state.phase)
    state = machine.next(plan, state)
    assertEquals(2, state.cycleIndex)
    assertEquals(WorkoutPhase.EXERCISE, state.phase)
  }

  @Test
  fun `keeps a nonzero initial countdown as the first phase`() {
    val machine = WorkoutPhaseMachine()
    val state = machine.initial(WorkoutPlan(3, 10, 2, 1, 0, 1))
    assertEquals(WorkoutPhase.INITIAL_COUNTDOWN, state.phase)
    assertEquals(3_000L, state.durationMilliseconds)
  }

  @Test
  fun `one set cycles go to recovery without a rest and the final cycle completes`() {
    val machine = WorkoutPhaseMachine()
    val plan = WorkoutPlan(0, 5, 2, 1, 3, 2)
    var state = machine.initial(plan)
    state = machine.next(plan, state)
    assertEquals(WorkoutPhase.RECOVERY, state.phase)
    state = machine.next(plan, state)
    assertEquals(2, state.cycleIndex)
    assertEquals(WorkoutPhase.EXERCISE, state.phase)
    state = machine.next(plan, state)
    assertEquals(WorkoutPhase.COMPLETED, state.phase)
  }
}
