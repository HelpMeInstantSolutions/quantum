package com.qsa.school.ui;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.cardview.widget.CardView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.network.SessionManager;

public class TeacherMainActivity extends AppCompatActivity {

    private ImageView imgTeacherAvatar;
    private TextView tvTeacherName, tvTeacherDesignation, tvClassTeacherBadge, tvAttendanceSubtext;
    private CardView cardMarkAttendance, cardPostHomework, cardEnterMarks, cardTeacherNotifs;
    private ImageButton btnLogoutTeacher;
    private SessionManager session;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_teacher_main);

        session = new SessionManager(this);

        // Request Notification permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1003);
            }
        }

        imgTeacherAvatar = findViewById(R.id.imgTeacherAvatar);
        tvTeacherName = findViewById(R.id.tvTeacherName);
        tvTeacherDesignation = findViewById(R.id.tvTeacherDesignation);
        tvClassTeacherBadge = findViewById(R.id.tvClassTeacherBadge);
        tvAttendanceSubtext = findViewById(R.id.tvAttendanceSubtext);

        cardMarkAttendance = findViewById(R.id.cardMarkAttendance);
        cardPostHomework = findViewById(R.id.cardPostHomework);
        cardEnterMarks = findViewById(R.id.cardEnterMarks);
        cardTeacherNotifs = findViewById(R.id.cardTeacherNotifs);
        btnLogoutTeacher = findViewById(R.id.btnLogoutTeacher);

        setupTeacherProfile();

        // 1. Mark Attendance (Class Teacher permission check)
        cardMarkAttendance.setOnClickListener(v -> {
            if (session.isClassTeacher()) {
                startActivity(new Intent(TeacherMainActivity.this, TeacherAttendanceActivity.class));
            } else {
                Toast.makeText(TeacherMainActivity.this, "Limited Permission: Only designated Class Teachers can record daily class attendance.", Toast.LENGTH_LONG).show();
            }
        });

        // 2. Post Homework
        cardPostHomework.setOnClickListener(v -> startActivity(new Intent(TeacherMainActivity.this, TeacherHomeworkActivity.class)));

        // 3. Enter Marks
        cardEnterMarks.setOnClickListener(v -> startActivity(new Intent(TeacherMainActivity.this, TeacherMarksActivity.class)));

        // 4. Notifications
        cardTeacherNotifs.setOnClickListener(v -> startActivity(new Intent(TeacherMainActivity.this, NotificationHubActivity.class)));

        // 5. Logout
        btnLogoutTeacher.setOnClickListener(v -> {
            session.logout();
            startActivity(new Intent(TeacherMainActivity.this, LoginActivity.class));
            finish();
        });
    }

    private void setupTeacherProfile() {
        JsonObject user = session.getUser();
        if (user != null) {
            tvTeacherName.setText(user.get("name").getAsString());

            String gender = user.has("gender") && !user.get("gender").isJsonNull() ? user.get("gender").getAsString() : "Male";
            if ("Female".equalsIgnoreCase(gender)) {
                imgTeacherAvatar.setImageResource(R.drawable.ic_avatar_female);
            } else {
                imgTeacherAvatar.setImageResource(R.drawable.ic_avatar_male);
            }

            if (user.has("designation") && !user.get("designation").isJsonNull()) {
                tvTeacherDesignation.setText(user.get("designation").getAsString());
            }

            boolean isClassTeacher = session.isClassTeacher();
            if (isClassTeacher && user.has("class_teacher_of") && !user.get("class_teacher_of").isJsonNull()) {
                String ctOf = user.get("class_teacher_of").getAsString();
                tvClassTeacherBadge.setVisibility(View.VISIBLE);
                tvClassTeacherBadge.setText("★ Class Teacher: " + ctOf + " (Full Attendance Access)");
                tvAttendanceSubtext.setText("Class Teacher privilege: Mark daily attendance for " + ctOf);
            } else {
                tvClassTeacherBadge.setVisibility(View.GONE);
                tvAttendanceSubtext.setText("Subject Teacher: Daily attendance requires Class Teacher designation.");
                cardMarkAttendance.setAlpha(0.7f);
            }
        }
    }
}
