package com.qsa.school.network;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.ui.SplashActivity;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import java.io.IOException;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "QSANotifications";
    private static final String CHANNEL_ID = "qsa_school_notifications";
    private static final String CHANNEL_NAME = "School Alerts & Notices";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "New FCM Device Token: " + token);
        sendRegistrationToServer(token);
    }

    private void sendRegistrationToServer(String token) {
        try {
            SessionManager session = new SessionManager(this);
            String jwtToken = session.getToken();
            if (jwtToken != null && !jwtToken.isEmpty()) {
                JsonObject json = new JsonObject();
                json.addProperty("token", token);
                json.addProperty("provider", "fcm");
                json.addProperty("device_type", "android");
                JsonObject active = session.getActiveStudent();
                if (active != null && active.has("id")) {
                    json.addProperty("student_id", active.get("id").getAsInt());
                }
                ApiClient.getInstance(this).post("/api/save-fcm-token", json.toString(), jwtToken, new Callback() {
                    @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {
                        Log.w(TAG, "Failed to upload FCM token to backend", e);
                    }
                    @Override public void onResponse(@NonNull Call call, @NonNull Response response) {
                        try { response.close(); } catch (Exception ignored) {}
                    }
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "Error sending FCM token to backend", e);
        }
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        String title = "Quantum Science Academy";
        String message = "New school notification received.";

        if (remoteMessage.getNotification() != null) {
            if (remoteMessage.getNotification().getTitle() != null) {
                title = remoteMessage.getNotification().getTitle();
            }
            if (remoteMessage.getNotification().getBody() != null) {
                message = remoteMessage.getNotification().getBody();
            }
        }
        
        if (remoteMessage.getData().size() > 0) {
            if (remoteMessage.getData().containsKey("title") && remoteMessage.getData().get("title") != null) {
                title = remoteMessage.getData().get("title");
            }
            if (remoteMessage.getData().containsKey("message") && remoteMessage.getData().get("message") != null) {
                message = remoteMessage.getData().get("message");
            } else if (remoteMessage.getData().containsKey("body") && remoteMessage.getData().get("body") != null) {
                message = remoteMessage.getData().get("body");
            }
        }

        showNotification(title, message);
    }

    private void showNotification(String title, String message) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Attendance, homework, fee reminders and general school circulars");
            channel.enableVibration(true);
            channel.enableLights(true);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, SplashActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                (int) (System.currentTimeMillis() % 100000),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_qsa_logo)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setContentIntent(pendingIntent);

        manager.notify((int) (System.currentTimeMillis() % 100000), builder.build());
    }
}
