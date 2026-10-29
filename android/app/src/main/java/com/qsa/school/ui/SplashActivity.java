package com.qsa.school.ui;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;

import com.qsa.school.R;
import com.qsa.school.network.SessionManager;

public class SplashActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            SessionManager session = new SessionManager(this);
            if (session.isLoggedIn()) {
                String role = session.getRole();
                if ("admin".equalsIgnoreCase(role)) {
                    startActivity(new Intent(SplashActivity.this, AdminMainActivity.class));
                } else if ("teacher".equalsIgnoreCase(role)) {
                    startActivity(new Intent(SplashActivity.this, TeacherMainActivity.class));
                } else {
                    startActivity(new Intent(SplashActivity.this, StudentMainActivity.class));
                }
            } else {
                startActivity(new Intent(SplashActivity.this, LoginActivity.class));
            }
            finish();
        }, 1200);
    }
}
