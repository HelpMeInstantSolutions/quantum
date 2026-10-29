package com.qsa.school.ui;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;

import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.network.ApiClient;
import com.qsa.school.network.SessionManager;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class TeacherHomeworkActivity extends AppCompatActivity {

    private EditText etHwTitle, etHwDueDate, etHwDesc;
    private Button btnSubmitHomeworkApp;
    private ProgressBar pbHwLoading;
    private SessionManager session;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_teacher_homework);

        session = new SessionManager(this);

        Toolbar toolbar = findViewById(R.id.toolbarTeachHw);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        }
        toolbar.setNavigationOnClickListener(v -> finish());

        etHwTitle = findViewById(R.id.etHwTitle);
        etHwDueDate = findViewById(R.id.etHwDueDate);
        etHwDesc = findViewById(R.id.etHwDesc);
        btnSubmitHomeworkApp = findViewById(R.id.btnSubmitHomeworkApp);
        pbHwLoading = findViewById(R.id.pbHwLoading);

        btnSubmitHomeworkApp.setOnClickListener(v -> submitHomework());
    }

    private void submitHomework() {
        String title = etHwTitle.getText().toString().trim();
        String due = etHwDueDate.getText().toString().trim();
        String desc = etHwDesc.getText().toString().trim();

        if (title.isEmpty() || desc.isEmpty() || due.isEmpty()) {
            Toast.makeText(this, "Please fill in title, due date, and instructions", Toast.LENGTH_SHORT).show();
            return;
        }

        pbHwLoading.setVisibility(View.VISIBLE);
        btnSubmitHomeworkApp.setEnabled(false);

        JsonObject user = session.getUser();
        int classId = user.has("assigned_class_id") ? user.get("assigned_class_id").getAsInt() : 5; // default 10th
        int sectionId = user.has("assigned_section_id") ? user.get("assigned_section_id").getAsInt() : 1;

        JsonObject payload = new JsonObject();
        payload.addProperty("class_id", classId);
        payload.addProperty("section_id", sectionId);
        payload.addProperty("subject_id", 1); // math / science
        payload.addProperty("title", title);
        payload.addProperty("description", desc);
        payload.addProperty("due_date", due);

        ApiClient.getInstance(this).post("/api/homework/create", payload.toString(), session.getToken(), new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> {
                    pbHwLoading.setVisibility(View.GONE);
                    btnSubmitHomeworkApp.setEnabled(true);
                    Toast.makeText(TeacherHomeworkActivity.this, "Failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                runOnUiThread(() -> {
                    pbHwLoading.setVisibility(View.GONE);
                    btnSubmitHomeworkApp.setEnabled(true);
                    Toast.makeText(TeacherHomeworkActivity.this, "Homework assigned and notification published to students!", Toast.LENGTH_LONG).show();
                    finish();
                });
            }
        });
    }
}
