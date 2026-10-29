package com.qsa.school.network;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class ApiClient {

    // Default base URL pointing to live production server
    public static final String DEFAULT_BASE_URL = "https://qunatum.mybhiwani.in";
    public static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private static ApiClient instance;
    private final OkHttpClient client;
    private final Context appContext;

    private ApiClient(Context context) {
        this.appContext = context.getApplicationContext();
        this.client = new OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .writeTimeout(20, TimeUnit.SECONDS)
                .build();
    }

    public static synchronized ApiClient getInstance(Context context) {
        if (instance == null) {
            instance = new ApiClient(context);
        }
        return instance;
    }

    public String getBaseUrl() {
        SharedPreferences prefs = appContext.getSharedPreferences("app_config", Context.MODE_PRIVATE);
        String saved = prefs.getString("server_url", DEFAULT_BASE_URL);
        if (saved == null || saved.isEmpty() || saved.contains("10.0.2.2") || saved.contains("localhost")) {
            return DEFAULT_BASE_URL;
        }
        return saved;
    }

    public void setBaseUrl(String url) {
        SharedPreferences prefs = appContext.getSharedPreferences("app_config", Context.MODE_PRIVATE);
        prefs.edit().putString("server_url", url).apply();
    }

    public void get(String endpoint, String token, Callback callback) {
        Request.Builder builder = new Request.Builder()
                .url(getBaseUrl() + endpoint);

        if (token != null && !token.isEmpty()) {
            builder.addHeader("Authorization", "Bearer " + token);
        }

        // Attach active student ID if user is parent or student
        try {
            SessionManager session = new SessionManager(appContext);
            int studentId = session.getActiveStudentId();
            if (studentId > 0) {
                builder.addHeader("x-student-id", String.valueOf(studentId));
            }
        } catch (Exception ignored) {}

        client.newCall(builder.build()).enqueue(callback);
    }

    public void post(String endpoint, String jsonBody, String token, Callback callback) {
        RequestBody body = RequestBody.create(jsonBody, JSON);
        Request.Builder builder = new Request.Builder()
                .url(getBaseUrl() + endpoint)
                .post(body);

        if (token != null && !token.isEmpty()) {
            builder.addHeader("Authorization", "Bearer " + token);
        }

        // Attach active student ID if user is parent or student
        try {
            SessionManager session = new SessionManager(appContext);
            int studentId = session.getActiveStudentId();
            if (studentId > 0) {
                builder.addHeader("x-student-id", String.valueOf(studentId));
            }
        } catch (Exception ignored) {}

        client.newCall(builder.build()).enqueue(callback);
    }
}
