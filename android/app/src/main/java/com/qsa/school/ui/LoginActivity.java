package com.qsa.school.ui;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.material.button.MaterialButton;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.network.ApiClient;
import com.qsa.school.network.GsonHelper;
import com.qsa.school.network.SessionManager;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class LoginActivity extends AppCompatActivity {

    private static final int REQ_NOTIF_PERMISSION = 1002;

    private EditText etUsername, etPassword;
    private MaterialButton btnLogin;
    private ProgressBar pbLoading;
    private TextView btnServerConfig;
    private MaterialButton chipDemoParent, chipDemoStudent, chipDemoTeacher, chipDemoAdmin;

    private SessionManager session;
    private final Gson gson = GsonHelper.getGson();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        session = new SessionManager(this);

        // Prompt for notification permission on Android 13+
        requestNotificationPermission();

        etUsername = findViewById(R.id.etUsername);
        etPassword = findViewById(R.id.etPassword);
        btnLogin = findViewById(R.id.btnLogin);
        pbLoading = findViewById(R.id.pbLoading);
        btnServerConfig = findViewById(R.id.btnServerConfig);

        chipDemoParent = findViewById(R.id.chipDemoParent);
        chipDemoStudent = findViewById(R.id.chipDemoStudent);
        chipDemoTeacher = findViewById(R.id.chipDemoTeacher);
        chipDemoAdmin = findViewById(R.id.chipDemoAdmin);

        btnLogin.setOnClickListener(v -> performLogin());
        btnServerConfig.setOnClickListener(v -> showServerConfigDialog());

        // 1-Tap Quick Fill Demo Listeners
        chipDemoParent.setOnClickListener(v -> {
            etUsername.setText("parent1");
            etPassword.setText("parent123");
            Toast.makeText(this, "Filled Parent (Sunil Sharma)", Toast.LENGTH_SHORT).show();
        });

        chipDemoStudent.setOnClickListener(v -> {
            etUsername.setText("student1");
            etPassword.setText("student123");
            Toast.makeText(this, "Filled Student (Aarav Sharma)", Toast.LENGTH_SHORT).show();
        });

        chipDemoTeacher.setOnClickListener(v -> {
            etUsername.setText("teacher1");
            etPassword.setText("teacher123");
            Toast.makeText(this, "Filled Teacher (Dr. Ramesh Sharma)", Toast.LENGTH_SHORT).show();
        });

        chipDemoAdmin.setOnClickListener(v -> {
            etUsername.setText("admin");
            etPassword.setText("admin123");
            Toast.makeText(this, "Filled Admin Account", Toast.LENGTH_SHORT).show();
        });
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF_PERMISSION);
            }
        }
    }

    private void performLogin() {
        String username = etUsername.getText().toString().trim();
        String password = etPassword.getText().toString().trim();

        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Please enter username and password", Toast.LENGTH_SHORT).show();
            return;
        }

        pbLoading.setVisibility(View.VISIBLE);
        btnLogin.setEnabled(false);

        JsonObject payload = new JsonObject();
        payload.addProperty("username", username);
        payload.addProperty("password", password);

        ApiClient.getInstance(this).post("/api/auth/login", payload.toString(), null, new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> {
                    pbLoading.setVisibility(View.GONE);
                    btnLogin.setEnabled(true);
                    Toast.makeText(LoginActivity.this, "Connection failed: " + e.getMessage() + "\nCheck internet & server URL", Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                final String responseBody = response.body() != null ? response.body().string() : "";
                runOnUiThread(() -> {
                    pbLoading.setVisibility(View.GONE);
                    btnLogin.setEnabled(true);

                    try {
                        JsonObject json = gson.fromJson(responseBody, JsonObject.class);
                        if (response.isSuccessful() && json.has("success") && json.get("success").getAsBoolean()) {
                            String token = json.get("token").getAsString();
                            JsonObject user = json.getAsJsonObject("user");
                            String role = user.get("role").getAsString();

                            session.saveLoginSession(token, user);

                            // Send FCM push token to backend for instant notifications
                            try {
                                com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                                    if (task.isSuccessful() && task.getResult() != null) {
                                        JsonObject fcmJson = new JsonObject();
                                        fcmJson.addProperty("token", task.getResult());
                                        fcmJson.addProperty("provider", "fcm");
                                        fcmJson.addProperty("device_type", "android");
                                        ApiClient.getInstance(LoginActivity.this).post("/api/save-fcm-token", fcmJson.toString(), token, new okhttp3.Callback() {
                                            @Override public void onFailure(@NonNull okhttp3.Call call, @NonNull java.io.IOException e) {}
                                            @Override public void onResponse(@NonNull okhttp3.Call call, @NonNull okhttp3.Response res) {
                                                try { res.close(); } catch (Exception ignored) {}
                                            }
                                        });
                                    }
                                });
                            } catch (Exception ignored) {}

                            Toast.makeText(LoginActivity.this, "Welcome " + user.get("name").getAsString() + "!", Toast.LENGTH_SHORT).show();

                            if ("admin".equalsIgnoreCase(role)) {
                                startActivity(new Intent(LoginActivity.this, AdminMainActivity.class));
                            } else if ("teacher".equalsIgnoreCase(role)) {
                                startActivity(new Intent(LoginActivity.this, TeacherMainActivity.class));
                            } else {
                                startActivity(new Intent(LoginActivity.this, StudentMainActivity.class));
                            }
                            finish();
                        } else {
                            String msg = json.has("message") ? json.get("message").getAsString() : "Invalid credentials";
                            Toast.makeText(LoginActivity.this, msg, Toast.LENGTH_LONG).show();
                        }
                    } catch (Exception e) {
                        Log.e("LoginActivity", "Login parse error", e);
                        Toast.makeText(LoginActivity.this, "Server error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                });
            }
        });
    }

    private void showServerConfigDialog() {
        EditText input = new EditText(this);
        input.setText(ApiClient.getInstance(this).getBaseUrl());
        input.setPadding(32, 24, 32, 24);

        new AlertDialog.Builder(this)
                .setTitle("Configure Server Base URL")
                .setMessage("Live Production: https://qunatum.mybhiwani.in\nLocal Testing: http://10.0.2.2:5004")
                .setView(input)
                .setPositiveButton("Save", (dialog, which) -> {
                    String url = input.getText().toString().trim();
                    if (!url.isEmpty()) {
                        if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
                        ApiClient.getInstance(this).setBaseUrl(url);
                        Toast.makeText(this, "Base URL updated: " + url, Toast.LENGTH_SHORT).show();
                    }
                })
                .setNeutralButton("Reset Default", (dialog, which) -> {
                    ApiClient.getInstance(this).setBaseUrl(ApiClient.DEFAULT_BASE_URL);
                    Toast.makeText(this, "Reset to live server: " + ApiClient.DEFAULT_BASE_URL, Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
}
