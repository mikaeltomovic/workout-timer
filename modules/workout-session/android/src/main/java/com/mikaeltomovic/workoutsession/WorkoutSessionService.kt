package com.mikaeltomovic.workoutsession

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat

/** Owns workout deadlines and phase transitions independently of React Native rendering. */
class WorkoutSessionService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val phaseMachine = WorkoutPhaseMachine()
  private var status = STATUS_STOPPED
  private var plan: WorkoutPlan? = null
  private var phaseState: WorkoutPhaseState? = null
  private var deadlineElapsedRealtime = 0L
  private var pausedRemainingMillis = 0L

  private val tick = object : Runnable {
    override fun run() {
      if (status != STATUS_RUNNING) return
      val workoutPlan = plan ?: return stopInvalidSession()
      var transitions = 0
      var phaseDeadline = deadlineElapsedRealtime
      val now = SystemClock.elapsedRealtime()

      while (phaseDeadline <= now && transitions < MAX_TRANSITIONS_PER_TICK) {
        val next = phaseMachine.next(workoutPlan, phaseState ?: return stopInvalidSession())
        phaseState = next
        transitions += 1
        if (next.phase == WorkoutPhase.COMPLETED) {
          status = STATUS_COMPLETED
          deadlineElapsedRealtime = 0L
          pausedRemainingMillis = 0L
          publishSnapshot()
          stopForeground(STOP_FOREGROUND_REMOVE)
          stopSelf()
          return
        }
        phaseDeadline = Math.addExact(phaseDeadline, next.durationMilliseconds)
        deadlineElapsedRealtime = phaseDeadline
      }

      publishSnapshot()
      val remaining = remainingMillis()
      val displayedSeconds = (remaining + 999L) / 1000L
      val nextDisplayBoundary = (displayedSeconds - 1L) * 1000L
      handler.postDelayed(this, maxOf(1L, remaining - nextDisplayBoundary))
    }
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> startSession(intent)
      ACTION_PAUSE -> pauseSession()
      ACTION_RESUME -> resumeSession()
      ACTION_SKIP -> skipPhase()
      ACTION_STOP -> stopSession()
      ACTION_RESET -> resetSession(intent)
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startSession(intent: Intent) {
    if (status == STATUS_RUNNING || status == STATUS_PAUSED) return
    val workoutPlan = planFromIntent(intent)
    val totalDurationSeconds = workoutPlan.totalDurationSeconds()
    require(totalDurationSeconds > 0) { "Workout duration must be positive." }

    plan = workoutPlan
    phaseState = phaseMachine.initial(workoutPlan)
    pausedRemainingMillis = phaseState!!.durationMilliseconds
    deadlineElapsedRealtime = Math.addExact(SystemClock.elapsedRealtime(), pausedRemainingMillis)
    status = STATUS_RUNNING
    startForeground(NOTIFICATION_ID, buildNotification())
    handler.removeCallbacks(tick)
    handler.post(tick)
    publishSnapshot()
  }

  private fun pauseSession() {
    if (status != STATUS_RUNNING) return
    pausedRemainingMillis = remainingMillis()
    status = STATUS_PAUSED
    handler.removeCallbacks(tick)
    publishSnapshot()
    updateNotification()
  }

  private fun resumeSession() {
    if (status != STATUS_PAUSED) return
    status = STATUS_RUNNING
    deadlineElapsedRealtime = Math.addExact(SystemClock.elapsedRealtime(), pausedRemainingMillis)
    handler.post(tick)
    publishSnapshot()
    updateNotification()
  }

  private fun skipPhase() {
    if (status != STATUS_RUNNING && status != STATUS_PAUSED) return
    val workoutPlan = plan ?: return
    val next = phaseMachine.next(workoutPlan, phaseState ?: return)
    phaseState = next
    if (next.phase == WorkoutPhase.COMPLETED) {
      status = STATUS_COMPLETED
      pausedRemainingMillis = 0L
      deadlineElapsedRealtime = 0L
      handler.removeCallbacks(tick)
      publishSnapshot()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return
    }
    pausedRemainingMillis = next.durationMilliseconds
    if (status == STATUS_RUNNING) {
      deadlineElapsedRealtime = Math.addExact(SystemClock.elapsedRealtime(), pausedRemainingMillis)
      handler.removeCallbacks(tick)
      handler.post(tick)
    } else {
      deadlineElapsedRealtime = 0L
    }
    publishSnapshot()
    updateNotification()
  }

  private fun stopSession() {
    if (status == STATUS_RUNNING || status == STATUS_PAUSED) {
      status = STATUS_STOPPED
      pausedRemainingMillis = 0L
      deadlineElapsedRealtime = 0L
      handler.removeCallbacks(tick)
      publishSnapshot()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  private fun resetSession(intent: Intent) {
    val workoutPlan = planFromIntent(intent)
    plan = workoutPlan
    handler.removeCallbacks(tick)
    phaseState = phaseMachine.initial(workoutPlan)
    pausedRemainingMillis = phaseState!!.durationMilliseconds
    deadlineElapsedRealtime = 0L
    status = STATUS_IDLE
    publishSnapshot()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun planFromIntent(intent: Intent) = WorkoutPlan(
    initialCountdownSeconds = intent.getLongExtra(EXTRA_INITIAL_COUNTDOWN_SECONDS, -1L),
    exerciseIntervalSeconds = intent.getLongExtra(EXTRA_EXERCISE_INTERVAL_SECONDS, -1L),
    restIntervalSeconds = intent.getLongExtra(EXTRA_REST_INTERVAL_SECONDS, -1L),
    setsPerCycle = intent.getIntExtra(EXTRA_SETS_PER_CYCLE, 0),
    recoveryIntervalSeconds = intent.getLongExtra(EXTRA_RECOVERY_INTERVAL_SECONDS, -1L),
    numberOfCycles = intent.getIntExtra(EXTRA_NUMBER_OF_CYCLES, 0),
  ).also { require(it.totalDurationSeconds() > 0) { "Workout duration must be positive." } }

  private fun stopInvalidSession() {
    status = STATUS_STOPPED
    pausedRemainingMillis = 0L
    deadlineElapsedRealtime = 0L
    handler.removeCallbacks(tick)
    publishSnapshot()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun remainingMillis(): Long = maxOf(0L, deadlineElapsedRealtime - SystemClock.elapsedRealtime())

  private fun currentSnapshot(): Map<String, Any> {
    val state = phaseState
    val remaining = when (status) {
      STATUS_RUNNING -> (remainingMillis() + 999L) / 1000L
      STATUS_COMPLETED, STATUS_STOPPED -> 0L
      else -> (pausedRemainingMillis + 999L) / 1000L
    }
    return mapOf(
      "status" to status,
      "phase" to (state?.phase?.wireName ?: WorkoutPhase.COMPLETED.wireName),
      "cycleIndex" to (state?.cycleIndex ?: 1),
      "setIndex" to (state?.setIndex ?: 1),
      "phaseId" to (state?.phaseId ?: 0L),
      "totalDurationSeconds" to (plan?.totalDurationSeconds() ?: 0L),
      "remainingSeconds" to remaining,
    )
  }

  private fun publishSnapshot() {
    val snapshot = currentSnapshot()
    synchronized(lock) { lastSnapshot = snapshot }
    observers.toList().forEach { observer -> observer("onSnapshotChanged", snapshot) }
    if (status == STATUS_RUNNING || status == STATUS_PAUSED) updateNotification()
  }

  private fun buildNotification(): Notification = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(android.R.drawable.ic_media_play)
    .setContentTitle("Workout in progress")
    .setContentText(notificationText())
    .setOngoing(true)
    .setCategory(NotificationCompat.CATEGORY_SERVICE)
    .setPriority(NotificationCompat.PRIORITY_LOW)
    .addAction(0, if (status == STATUS_PAUSED) "Resume" else "Pause", commandPendingIntent(if (status == STATUS_PAUSED) ACTION_RESUME else ACTION_PAUSE))
    .addAction(0, "Skip", commandPendingIntent(ACTION_SKIP))
    .addAction(0, "Stop", commandPendingIntent(ACTION_STOP))
    .build()

  private fun notificationText(): String {
    if (status == STATUS_PAUSED) return "Workout paused"
    val snapshot = currentSnapshot()
    val phase = snapshot["phase"] as String
    val seconds = snapshot["remainingSeconds"] as Long
    return "$phase · ${seconds}s remaining · Cycle ${snapshot["cycleIndex"]}, set ${snapshot["setIndex"]}"
  }

  private fun updateNotification() {
    getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
  }

  private fun commandPendingIntent(action: String): PendingIntent {
    val intent = Intent(this, WorkoutSessionService::class.java).setAction(action)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getService(this, action.hashCode(), intent, flags)
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Active workout", NotificationManager.IMPORTANCE_LOW)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  companion object {
    const val ACTION_START = "com.mikaeltomovic.workoutsession.START"
    const val ACTION_PAUSE = "com.mikaeltomovic.workoutsession.PAUSE"
    const val ACTION_RESUME = "com.mikaeltomovic.workoutsession.RESUME"
    const val ACTION_SKIP = "com.mikaeltomovic.workoutsession.SKIP"
    const val ACTION_STOP = "com.mikaeltomovic.workoutsession.STOP"
    const val ACTION_RESET = "com.mikaeltomovic.workoutsession.RESET"
    const val EXTRA_INITIAL_COUNTDOWN_SECONDS = "initialCountdownSeconds"
    const val EXTRA_EXERCISE_INTERVAL_SECONDS = "exerciseIntervalSeconds"
    const val EXTRA_REST_INTERVAL_SECONDS = "restIntervalSeconds"
    const val EXTRA_SETS_PER_CYCLE = "setsPerCycle"
    const val EXTRA_RECOVERY_INTERVAL_SECONDS = "recoveryIntervalSeconds"
    const val EXTRA_NUMBER_OF_CYCLES = "numberOfCycles"

    private const val STATUS_IDLE = "idle"
    private const val STATUS_RUNNING = "running"
    private const val STATUS_PAUSED = "paused"
    private const val STATUS_COMPLETED = "completed"
    private const val STATUS_STOPPED = "stopped"
    private const val CHANNEL_ID = "active-workout"
    private const val NOTIFICATION_ID = 7101
    private const val MAX_TRANSITIONS_PER_TICK = 10_000
    private val lock = Any()
    private var lastSnapshot: Map<String, Any>? = null
    val observers = mutableSetOf<(String, Map<String, Any>) -> Unit>()

    @Suppress("UNUSED_PARAMETER")
    fun snapshot(context: Context?): Map<String, Any>? = synchronized(lock) { lastSnapshot }
  }
}
