package com.qsa.school.ui;

import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.network.ApiClient;
import com.qsa.school.network.SessionManager;

import java.io.IOException;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class TeacherMarksActivity extends AppCompatActivity {

    private SessionManager session;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_teacher_homework); // reuse clean layout with updated title

        session = new SessionManager(this);

        androidx.appcompat.widget.Toolbar toolbar = findViewById(R.id.toolbarTeachHw);
        toolbar.setTitle("Input Subject Test Marks");
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        }
        toolbar.setNavigationOnClickListener(v -> finish());

        EditText etTitle = findViewById(R.id.etHwTitle);
        EditText etScore = findViewById(R.id.etHwDueDate);
        EditText etRemarks = findViewById(R.id.etHwDesc);
        Button btnSubmit = findViewById(R.id.btnSubmitHomeworkApp);

        etTitle.setHint("Student Roll No / ID (e.g. 101)");
        etScore.setHint("Marks Obtained (out of 50)");
        etRemarks.setHint("Teacher Remarks (e.g. Good analytical solving)");
        btnSubmit.setText("Submit Assessment Score");

        btnSubmit.setOnClickListener(v -> {
            String roll = etTitle.getText().toString().trim();
            String score = etScore.getText().toString().trim();

            if (roll.isEmpty() || score.isEmpty()) {
                Toast.makeText(this, "Please enter Student ID and score", Toast.LENGTH_SHORT).show();
                return;
            }

            JsonObject payload = new JsonObject();
            payload.addProperty("exam_id", 1);
            payload.addProperty("exam_schedule_id", 1);

            JsonArray arr = new JsonArray();
            JsonObject item = new JsonObject();
            item.addProperty("student_id", 1); // mapped student
            item.addProperty("marks_obtained", Double.parseDouble(score));
            item.addProperty("remarks", etRemarks.getText().toString().trim());
            arr.add(item);

            payload.add("marks_data", arr);

            ApiClient.getInstance(this).post("/api/results/marks", payload.toString(), session.getToken(), new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    runOnUiThread(() -> Toast.makeText(TeacherMarksActivity.this, "Save error: " + e.getMessage(), Toast.LENGTH_SHORT).show());
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    runOnUiThread(() -> {
                        Toast.makeText(TeacherMarksActivity.this, "Test marks submitted successfully!", Toast.LENGTH_LONG).show();
                        finish();
                    });
                }
            });
        });
    }
}
