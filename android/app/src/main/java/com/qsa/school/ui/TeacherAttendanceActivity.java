package com.qsa.school.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.model.AttendanceRecord;
import com.qsa.school.network.ApiClient;
import com.qsa.school.network.SessionManager;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import android.util.Log;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;
import com.qsa.school.network.GsonHelper;

public class TeacherAttendanceActivity extends AppCompatActivity {

    private TextView tvAttClassHeader;
    private Button btnMarkAllPresentApp, btnSubmitAttendanceApp;
    private RecyclerView rvAttendanceList;
    private ProgressBar pbAttLoading;

    private SessionManager session;
    private final Gson gson = GsonHelper.getGson();
    private final List<AttendanceRecord> students = new ArrayList<>();
    private final Map<Integer, String> attendanceMap = new HashMap<>();
    private TeacherAttendanceAdapter adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_teacher_attendance);

        session = new SessionManager(this);

        Toolbar toolbar = findViewById(R.id.toolbarTeachAtt);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        }
        toolbar.setNavigationOnClickListener(v -> finish());

        tvAttClassHeader = findViewById(R.id.tvAttClassHeader);
        btnMarkAllPresentApp = findViewById(R.id.btnMarkAllPresentApp);
        btnSubmitAttendanceApp = findViewById(R.id.btnSubmitAttendanceApp);
        rvAttendanceList = findViewById(R.id.rvAttendanceList);
        pbAttLoading = findViewById(R.id.pbAttLoading);

        rvAttendanceList.setLayoutManager(new LinearLayoutManager(this));
        adapter = new TeacherAttendanceAdapter();
        rvAttendanceList.setAdapter(adapter);

        btnMarkAllPresentApp.setOnClickListener(v -> {
            for (AttendanceRecord s : students) {
                attendanceMap.put(s.id, "Present");
            }
            adapter.notifyDataSetChanged();
            Toast.makeText(this, "Marked all students Present", Toast.LENGTH_SHORT).show();
        });

        btnSubmitAttendanceApp.setOnClickListener(v -> submitAttendance());

        loadClassStudents();
    }

    private void loadClassStudents() {
        pbAttLoading.setVisibility(View.VISIBLE);
        String token = session.getToken();

        ApiClient.getInstance(this).get("/api/attendance", token, new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> {
                    pbAttLoading.setVisibility(View.GONE);
                    Toast.makeText(TeacherAttendanceActivity.this, "Failed to load: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);
                        if (json.has("students")) {
                            JsonArray arr = json.getAsJsonArray("students");
                            students.clear();
                            for (JsonElement el : arr) {
                                AttendanceRecord rec = gson.fromJson(el, AttendanceRecord.class);
                                students.add(rec);
                                attendanceMap.put(rec.id, rec.status != null ? rec.status : "Present");
                            }
                            runOnUiThread(() -> {
                                pbAttLoading.setVisibility(View.GONE);
                                adapter.notifyDataSetChanged();
                            });
                        }
                    } catch (Exception e) {
                        Log.e("TeacherAttendance", "Error parsing students", e);
                        runOnUiThread(() -> pbAttLoading.setVisibility(View.GONE));
                    }
                }
            }
        });
    }

    private void submitAttendance() {
        if (students.isEmpty()) return;

        pbAttLoading.setVisibility(View.VISIBLE);
        btnSubmitAttendanceApp.setEnabled(false);

        JsonObject user = session.getUser();
        int classId = user.has("assigned_class_id") ? user.get("assigned_class_id").getAsInt() : 5;
        int sectionId = user.has("assigned_section_id") ? user.get("assigned_section_id").getAsInt() : 1;

        JsonObject payload = new JsonObject();
        payload.addProperty("class_id", classId);
        payload.addProperty("section_id", sectionId);

        JsonArray list = new JsonArray();
        for (AttendanceRecord st : students) {
            JsonObject item = new JsonObject();
            item.addProperty("student_id", st.id);
            item.addProperty("status", attendanceMap.getOrDefault(st.id, "Present"));
            list.add(item);
        }
        payload.add("attendance_list", list);

        ApiClient.getInstance(this).post("/api/attendance/mark", payload.toString(), session.getToken(), new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> {
                    pbAttLoading.setVisibility(View.GONE);
                    btnSubmitAttendanceApp.setEnabled(true);
                    Toast.makeText(TeacherAttendanceActivity.this, "Save error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                runOnUiThread(() -> {
                    pbAttLoading.setVisibility(View.GONE);
                    btnSubmitAttendanceApp.setEnabled(true);
                    Toast.makeText(TeacherAttendanceActivity.this, "Attendance saved! Absent alerts dispatched.", Toast.LENGTH_LONG).show();
                    finish();
                });
            }
        });
    }

    private class TeacherAttendanceAdapter extends RecyclerView.Adapter<TeacherAttendanceAdapter.ViewHolder> {

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_attendance_row, parent, false);
            return new ViewHolder(view);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            AttendanceRecord s = students.get(position);
            holder.tvRoll.setText(String.valueOf(s.roll_no != 0 ? s.roll_no : position + 1));
            holder.tvName.setText(s.first_name + " " + (s.last_name != null ? s.last_name : ""));
            holder.tvAdm.setText(s.admission_no);

            String status = attendanceMap.getOrDefault(s.id, "Present");
            if ("Absent".equalsIgnoreCase(status)) {
                holder.rbAbsent.setChecked(true);
            } else {
                holder.rbPresent.setChecked(true);
            }

            holder.rgStatus.setOnCheckedChangeListener((group, checkedId) -> {
                if (checkedId == R.id.rbAbsent) {
                    attendanceMap.put(s.id, "Absent");
                } else {
                    attendanceMap.put(s.id, "Present");
                }
            });
        }

        @Override
        public int getItemCount() {
            return students.size();
        }

        class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvRoll, tvName, tvAdm;
            RadioGroup rgStatus;
            RadioButton rbPresent, rbAbsent;

            public ViewHolder(@NonNull View itemView) {
                super(itemView);
                tvRoll = itemView.findViewById(R.id.tvAttRoll);
                tvName = itemView.findViewById(R.id.tvAttStudentName);
                tvAdm = itemView.findViewById(R.id.tvAttAdmNo);
                rgStatus = itemView.findViewById(R.id.rgStatus);
                rbPresent = itemView.findViewById(R.id.rbPresent);
                rbAbsent = itemView.findViewById(R.id.rbAbsent);
            }
        }
    }
}
