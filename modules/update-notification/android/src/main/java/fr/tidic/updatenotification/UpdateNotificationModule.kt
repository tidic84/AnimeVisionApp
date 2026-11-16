package fr.tidic.updatenotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val CHANNEL_ID = "app-update"
private const val NOTIFICATION_ID = 4601
private const val APK_MIME = "application/vnd.android.package-archive"

/** Notification de téléchargement de la mise à jour de l'app, avec barre de progression native. */
class UpdateNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val manager: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  override fun definition() = ModuleDefinition {
    Name("UpdateNotification")

    Function("progress") { title: String, text: String, percent: Int ->
      val builder = builder(title, text, android.R.drawable.stat_sys_download)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(openAppIntent())
      if (percent < 0) builder.setProgress(0, 0, true) else builder.setProgress(100, percent.coerceIn(0, 100), false)
      post(builder)
    }

    Function("ready") { title: String, text: String, contentUri: String ->
      val install = Intent(Intent.ACTION_VIEW)
        .setDataAndType(Uri.parse(contentUri), APK_MIME)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      val pending = PendingIntent.getActivity(context, 1, install, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      post(builder(title, text, android.R.drawable.stat_sys_download_done).setAutoCancel(true).setContentIntent(pending))
    }

    Function("failed") { title: String, text: String ->
      post(builder(title, text, android.R.drawable.stat_notify_error).setAutoCancel(true).setContentIntent(openAppIntent()))
    }

    Function("cancel") {
      manager.cancel(NOTIFICATION_ID)
    }
  }

  private fun builder(title: String, text: String, icon: Int): NotificationCompat.Builder {
    ensureChannel()
    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(icon)
      .setContentTitle(title)
      .setContentText(text)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || manager.getNotificationChannel(CHANNEL_ID) != null) return
    // Importance basse : ni son ni vibration à chaque mise à jour de la barre.
    val channel = NotificationChannel(CHANNEL_ID, "Mises à jour de l'application", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Progression du téléchargement des nouvelles versions"
    manager.createNotificationChannel(channel)
  }

  private fun openAppIntent(): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun post(builder: NotificationCompat.Builder) {
    // Sans la permission POST_NOTIFICATIONS (Android 13+), Android ignore la notification.
    try {
      manager.notify(NOTIFICATION_ID, builder.build())
    } catch (error: SecurityException) {
      android.util.Log.w("UpdateNotification", "Notification refusée", error)
    }
  }
}
