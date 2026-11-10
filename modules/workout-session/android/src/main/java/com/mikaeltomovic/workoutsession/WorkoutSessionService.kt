package com.mikaeltomovic.workoutsession

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.speech.tts.TextToSpeech
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import java.util.Locale

/** Owns workout deadlines and phase transitions independently of React Native rendering. */
class WorkoutSessionService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val phaseMachine = WorkoutPhaseMachine()
  private val cuePlanner = WorkoutAudioCuePlanner()
  private val pendingCueCallbacks = mutableMapOf<String, Runnable>()
  private val deliveredCueIds = mutableSetOf<String>()
  private var audioPreferences = AudioCuePreferences(true, true)
  private var textToSpeech: TextToSpeech? = null
  private var ttsReady = false
  private val pendingSpeech = mutableListOf<Pair<String, String>>()
  private var toneGenerator: ToneGenerator? = null
  private var workoutWakeLock: PowerManager.WakeLock? = null
  private var workoutName = "Workout"
  private var telephonyManager: TelephonyManager? = null
  private var phoneStateListener: PhoneStateListener? = null
  private var telephonyCallback: TelephonyCallback? = null
  private var callActive = false
  private var completionCleanup: Runnable? = null
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
        cancelPendingCues()
        val next = phaseMachine.next(workoutPlan, phaseState ?: return stopInvalidSession())
        phaseState = next
        transitions += 1
        if (next.phase == WorkoutPhase.COMPLETED) {
          completeWorkout(next)
          return
        }
        phaseDeadline = Math.addExact(phaseDeadline, next.durationMilliseconds)
        deadlineElapsedRealtime = phaseDeadline
        scheduleCues(next, phaseDeadline - next.durationMilliseconds)
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
    toneGenerator = ToneGenerator(android.media.AudioManager.STREAM_MUSIC, 80)
    textToSpeech = TextToSpeech(this) { status ->
      if (status == TextToSpeech.SUCCESS) {
        textToSpeech?.setLanguage(Locale.getDefault())
        textToSpeech?.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        ttsReady = true
        pendingSpeech.toList().forEach { (id, message) -> speak(id, message) }
        pendingSpeech.clear()
      }
    }
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
    cancelPendingCues()
    textToSpeech?.stop()
    textToSpeech?.shutdown()
    textToSpeech = null
    unregisterCallStateListener()
    toneGenerator?.release()
    toneGenerator = null
    releaseWorkoutWakeLock()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startSession(intent: Intent) {
    if (status == STATUS_RUNNING || status == STATUS_PAUSED) return
    completionCleanup?.let(handler::removeCallbacks)
    completionCleanup = null
    val workoutPlan = planFromIntent(intent)
    val totalDurationSeconds = workoutPlan.totalDurationSeconds()
    require(totalDurationSeconds > 0) { "Workout duration must be positive." }

    plan = workoutPlan
    workoutName = intent.getStringExtra(EXTRA_WORKOUT_NAME)?.takeIf { it.isNotBlank() } ?: "Workout"
    audioPreferences = audioPreferences(intent)
    deliveredCueIds.clear()
    phaseState = phaseMachine.initial(workoutPlan)
    pausedRemainingMillis = phaseState!!.durationMilliseconds
    deadlineElapsedRealtime = Math.addExact(SystemClock.elapsedRealtime(), pausedRemainingMillis)
    status = STATUS_RUNNING
    startForeground(NOTIFICATION_ID, buildNotification())
    acquireWorkoutWakeLock()
    registerCallStateListener()
    scheduleCues(phaseState!!, SystemClock.elapsedRealtime())
    handler.removeCallbacks(tick)
    handler.post(tick)
    publishSnapshot()
  }

  private fun pauseSession() {
    if (status != STATUS_RUNNING) return
    pausedRemainingMillis = remainingMillis()
    status = STATUS_PAUSED
    handler.removeCallbacks(tick)
    cancelPendingCues()
    releaseWorkoutWakeLock()
    publishSnapshot()
    updateNotification()
  }

  private fun resumeSession() {
    if (status != STATUS_PAUSED || callActive) return
    status = STATUS_RUNNING
    deadlineElapsedRealtime = Math.addExact(SystemClock.elapsedRealtime(), pausedRemainingMillis)
    acquireWorkoutWakeLock()
    val resumedPhase = phaseState ?: return
    scheduleCues(resumedPhase, deadlineElapsedRealtime - resumedPhase.durationMilliseconds)
    handler.post(tick)
    publishSnapshot()
    updateNotification()
  }

  private fun skipPhase() {
    if (status != STATUS_RUNNING && status != STATUS_PAUSED) return
    val workoutPlan = plan ?: return
    cancelPendingCues()
    val next = phaseMachine.next(workoutPlan, phaseState ?: return)
    phaseState = next
    if (next.phase == WorkoutPhase.COMPLETED) {
      handler.removeCallbacks(tick)
      completeWorkout(next)
      return
    }
    pausedRemainingMillis = next.durationMilliseconds
    if (status == STATUS_RUNNING) {
      deadlineElapsedRealtime = Math.addExact(SystemClock.elapsedRealtime(), pausedRemainingMillis)
      handler.removeCallbacks(tick)
      scheduleCues(next, deadlineElapsedRealtime - pausedRemainingMillis)
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
      releaseWorkoutWakeLock()
      publishSnapshot()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  private fun resetSession(intent: Intent) {
    completionCleanup?.let(handler::removeCallbacks)
    completionCleanup = null
    val workoutPlan = planFromIntent(intent)
    audioPreferences = audioPreferences(intent)
    deliveredCueIds.clear()
    plan = workoutPlan
    handler.removeCallbacks(tick)
    cancelPendingCues()
    phaseState = phaseMachine.initial(workoutPlan)
    pausedRemainingMillis = phaseState!!.durationMilliseconds
    deadlineElapsedRealtime = 0L
    status = STATUS_IDLE
    releaseWorkoutWakeLock()
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
    releaseWorkoutWakeLock()
    publishSnapshot()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun remainingMillis(): Long = maxOf(0L, deadlineElapsedRealtime - SystemClock.elapsedRealtime())

  private fun audioPreferences(intent: Intent) = AudioCuePreferences(
    intent.getBooleanExtra(EXTRA_VOICE_CUES, true),
    intent.getBooleanExtra(EXTRA_COUNTDOWN_BEEPS, true),
  )

  private fun scheduleCues(phase: WorkoutPhaseState, phaseStartedAt: Long) {
    val workoutPlan = plan ?: return
    val now = SystemClock.elapsedRealtime()
    cuePlanner.cues(workoutPlan, phase, phaseStartedAt, audioPreferences).forEach { cue ->
      if (cue.id in deliveredCueIds || cue.dueElapsedRealtime < now) return@forEach
      val callback = Runnable {
        pendingCueCallbacks.remove(cue.id)
        if (status != STATUS_RUNNING || cue.id in deliveredCueIds) return@Runnable
        deliveredCueIds += cue.id
        when (cue) {
          is WorkoutAudioCue.Voice -> {
            if (ttsReady) speak(cue.id, cue.message) else pendingSpeech += cue.id to cue.message
          }
          is WorkoutAudioCue.Beep -> toneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP, BEEP_DURATION_MILLISECONDS)
        }
      }
      pendingCueCallbacks[cue.id] = callback
      val uptimeDeadline = SystemClock.uptimeMillis() + (cue.dueElapsedRealtime - now)
      handler.postAtTime(callback, uptimeDeadline)
    }
  }

  private fun speak(id: String, message: String) {
    textToSpeech?.speak(message, TextToSpeech.QUEUE_ADD, null, id)
  }

  private fun playCompletionCue(phase: WorkoutPhaseState) {
    if (!audioPreferences.voiceCues) return
    val id = "phase:" + phase.phaseId + ":voice:complete"
    if (id in deliveredCueIds) return
    deliveredCueIds += id
    if (ttsReady) speak(id, "Workout complete") else pendingSpeech += id to "Workout complete"
  }

  private fun completeWorkout(phase: WorkoutPhaseState) {
    status = STATUS_COMPLETED
    pausedRemainingMillis = 0L
    deadlineElapsedRealtime = 0L
    cancelPendingCues()
    playCompletionCue(phase)
    publishSnapshot()
    releaseWorkoutWakeLock()
    updateNotification()
    completionCleanup?.let(handler::removeCallbacks)
    completionCleanup = Runnable {
      completionCleanup = null
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
    handler.postDelayed(completionCleanup!!, COMPLETION_NOTIFICATION_MILLISECONDS)
  }

  private fun acquireWorkoutWakeLock() {
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    val lock = workoutWakeLock ?: powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "WorkoutTimer::ActiveSession").also {
      it.setReferenceCounted(false)
      workoutWakeLock = it
    }
    if (!lock.isHeld) lock.acquire()
  }

  private fun releaseWorkoutWakeLock() {
    workoutWakeLock?.let { if (it.isHeld) it.release() }
  }

  @Suppress("DEPRECATION")
  private fun registerCallStateListener() {
    if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return
    val manager = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return
    telephonyManager = manager
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
          override fun onCallStateChanged(state: Int) {
            callActive = state != TelephonyManager.CALL_STATE_IDLE
            if (callActive && status == STATUS_RUNNING) pauseSession()
          }
        }
        telephonyCallback = callback
        manager.registerTelephonyCallback(mainExecutor, callback)
      } else {
        val listener = object : PhoneStateListener() {
          override fun onCallStateChanged(state: Int, phoneNumber: String?) {
            callActive = state != TelephonyManager.CALL_STATE_IDLE
            if (callActive && status == STATUS_RUNNING) pauseSession()
          }
        }
        phoneStateListener = listener
        manager.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
      }
    } catch (_: SecurityException) {
      // Permission may be revoked between the check and listener registration.
    } catch (_: UnsupportedOperationException) {
      // Devices without telephony radio support can still run workouts.
    }
  }

  @Suppress("DEPRECATION")
  private fun unregisterCallStateListener() {
    val manager = telephonyManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (telephonyCallback as? TelephonyCallback)?.let(manager::unregisterTelephonyCallback)
      telephonyCallback = null
    } else {
      phoneStateListener?.let { manager.listen(it, PhoneStateListener.LISTEN_NONE) }
      phoneStateListener = null
    }
    telephonyManager = null
  }

  private fun cancelPendingCues() {
    pendingCueCallbacks.values.forEach(handler::removeCallbacks)
    pendingCueCallbacks.clear()
    pendingSpeech.clear()
    textToSpeech?.stop()
  }

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
    .setContentTitle(if (status == STATUS_COMPLETED) "Workout complete" else workoutName)
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
    if (status == STATUS_COMPLETED) return "Great work — session finished"
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
    const val EXTRA_WORKOUT_NAME = "workoutName"
    const val EXTRA_VOICE_CUES = "voiceCues"
    const val EXTRA_COUNTDOWN_BEEPS = "finalCountdownBeeps"

    private const val STATUS_IDLE = "idle"
    private const val STATUS_RUNNING = "running"
    private const val STATUS_PAUSED = "paused"
    private const val STATUS_COMPLETED = "completed"
    private const val STATUS_STOPPED = "stopped"
    private const val CHANNEL_ID = "active-workout"
    private const val NOTIFICATION_ID = 7101
    private const val MAX_TRANSITIONS_PER_TICK = 10_000
    private const val BEEP_DURATION_MILLISECONDS = 100
    private const val COMPLETION_NOTIFICATION_MILLISECONDS = 4_000L
    private val lock = Any()
    private var lastSnapshot: Map<String, Any>? = null
    val observers = mutableSetOf<(String, Map<String, Any>) -> Unit>()

    @Suppress("UNUSED_PARAMETER")
    fun snapshot(context: Context?): Map<String, Any>? = synchronized(lock) { lastSnapshot }
  }
}
