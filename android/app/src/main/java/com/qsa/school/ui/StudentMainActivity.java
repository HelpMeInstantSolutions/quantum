package com.qsa.school.ui;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.appcompat.widget.Toolbar;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.tabs.TabLayout;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.adapter.CalendarGridAdapter;
import com.qsa.school.adapter.HomeworkAdapter;
import com.qsa.school.adapter.NotificationAdapter;
import com.qsa.school.adapter.StudentAttendanceAdapter;
import com.qsa.school.model.AttendanceRecord;
import com.qsa.school.model.CalendarDay;
import com.qsa.school.model.HomeworkItem;
import com.qsa.school.model.NotificationItem;
import com.qsa.school.network.ApiClient;
import com.qsa.school.network.GsonHelper;
import com.qsa.school.network.SessionManager;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class StudentMainActivity extends AppCompatActivity {

    private static final String TAG = "StudentMainActivity";
    private static final int REQ_POST_NOTIFS = 101;

    // Header Views
    private SwipeRefreshLayout swipeRefreshStudent;
    private Toolbar toolbarStudent;
    private ImageView imgStudentAvatar;
    private TextView tvStudentName, tvStudentClass, tvStudentAdm, tvPortalSubtitle;
    private MaterialButton btnSwitchChild;
    private ImageButton btnNotifHub, btnLogoutStudent;

    // Tabs
    private TabLayout studentTabLayout;
    private LinearLayout layoutTabAttendance, layoutTabHomework, layoutTabNotifications, layoutTabFees;

    // Tab 1: Attendance Views
    private TextView tvAttendancePct, tvAttStatusSubtext, tvSchoolPresents, tvTuitionPresents;
    private ImageButton btnPrevMonth, btnNextMonth;
    private TextView tvCurrentMonthTitle;
    private RecyclerView rvCalendarGrid;
    private TextView tvSelectedDateTitle, tvSelectedDateStatus, tvSelectedSchoolTimes, tvSelectedTuitionTimes, tvSelectedRemarks;
    private RecyclerView rvStudentAttendance;

    private final Map<String, AttendanceRecord> attendanceRecordMap = new HashMap<>();
    private final List<AttendanceRecord> attendanceRecordList = new ArrayList<>();
    private final List<CalendarDay> calendarDayList = new ArrayList<>();
    private CalendarGridAdapter calendarGridAdapter;
    private final Calendar currentCal = Calendar.getInstance();
    private String selectedDateStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());

    // Tab 2: Homework Views
    private RecyclerView rvStudentHomework;
    private TextView tvEmptyHomework;

    // Tab 3: Notifications Views
    private RecyclerView rvStudentNotifs;
    private TextView tvEmptyNotifs;

    // Tab 4: Fees Views
    private TextView tvFeePending, tvFeeStatusSubtext, tvFeePaid, tvFeePaymentMode;

    private SessionManager session;
    private final Gson gson = GsonHelper.getGson();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_student_main);

        session = new SessionManager(this);

        // 1. Request POST_NOTIFICATIONS Permission on Android 13+
        requestNotificationPermission();

        // 2. Bind Header Views
        swipeRefreshStudent = findViewById(R.id.swipeRefreshStudent);
        toolbarStudent = findViewById(R.id.toolbarStudent);
        imgStudentAvatar = findViewById(R.id.imgStudentAvatar);
        tvStudentName = findViewById(R.id.tvStudentName);
        tvStudentClass = findViewById(R.id.tvStudentClass);
        tvStudentAdm = findViewById(R.id.tvStudentAdm);
        tvPortalSubtitle = findViewById(R.id.tvPortalSubtitle);
        btnSwitchChild = findViewById(R.id.btnSwitchChild);
        btnNotifHub = findViewById(R.id.btnNotifHub);
        btnLogoutStudent = findViewById(R.id.btnLogoutStudent);

        // 3. Bind Tabs & Containers
        studentTabLayout = findViewById(R.id.studentTabLayout);
        layoutTabAttendance = findViewById(R.id.layoutTabAttendance);
        layoutTabHomework = findViewById(R.id.layoutTabHomework);
        layoutTabNotifications = findViewById(R.id.layoutTabNotifications);
        layoutTabFees = findViewById(R.id.layoutTabFees);

        // 4. Bind Tab 1 (Attendance) Views
        tvAttendancePct = findViewById(R.id.tvAttendancePct);
        tvAttStatusSubtext = findViewById(R.id.tvAttStatusSubtext);
        tvSchoolPresents = findViewById(R.id.tvSchoolPresents);
        tvTuitionPresents = findViewById(R.id.tvTuitionPresents);

        btnPrevMonth = findViewById(R.id.btnPrevMonth);
        btnNextMonth = findViewById(R.id.btnNextMonth);
        tvCurrentMonthTitle = findViewById(R.id.tvCurrentMonthTitle);
        rvCalendarGrid = findViewById(R.id.rvCalendarGrid);

        tvSelectedDateTitle = findViewById(R.id.tvSelectedDateTitle);
        tvSelectedDateStatus = findViewById(R.id.tvSelectedDateStatus);
        tvSelectedSchoolTimes = findViewById(R.id.tvSelectedSchoolTimes);
        tvSelectedTuitionTimes = findViewById(R.id.tvSelectedTuitionTimes);
        tvSelectedRemarks = findViewById(R.id.tvSelectedRemarks);
        rvStudentAttendance = findViewById(R.id.rvStudentAttendance);
        rvStudentAttendance.setLayoutManager(new LinearLayoutManager(this));

        // 5. Bind Tab 2 (Homework) Views
        rvStudentHomework = findViewById(R.id.rvStudentHomework);
        rvStudentHomework.setLayoutManager(new LinearLayoutManager(this));
        tvEmptyHomework = findViewById(R.id.tvEmptyHomework);

        // 6. Bind Tab 3 (Notifications) Views
        rvStudentNotifs = findViewById(R.id.rvStudentNotifs);
        rvStudentNotifs.setLayoutManager(new LinearLayoutManager(this));
        tvEmptyNotifs = findViewById(R.id.tvEmptyNotifs);

        // 7. Bind Tab 4 (Fees) Views
        tvFeePending = findViewById(R.id.tvFeePending);
        tvFeeStatusSubtext = findViewById(R.id.tvFeeStatusSubtext);
        tvFeePaid = findViewById(R.id.tvFeePaid);
        tvFeePaymentMode = findViewById(R.id.tvFeePaymentMode);

        // Setup Tab Switching Listener
        studentTabLayout.addOnTabSelectedListener(new TabLayout.OnTabSelectedListener() {
            @Override
            public void onTabSelected(TabLayout.Tab tab) {
                switchTab(tab.getPosition());
            }
            @Override public void onTabUnselected(TabLayout.Tab tab) {}
            @Override public void onTabReselected(TabLayout.Tab tab) {}
        });

        // Setup Month Calendar Grid
        setupCalendarGrid();

        // Pull to refresh
        swipeRefreshStudent.setColorSchemeResources(R.color.primary_blue, R.color.accent_gold);
        swipeRefreshStudent.setOnRefreshListener(this::loadDashboardData);

        // Header Actions
        setupUserData();
        btnNotifHub.setOnClickListener(v -> startActivity(new Intent(this, NotificationHubActivity.class)));
        btnLogoutStudent.setOnClickListener(v -> {
            new AlertDialog.Builder(this)
                    .setTitle("Sign Out")
                    .setMessage("Are you sure you want to sign out from Quantum Science Academy app?")
                    .setPositiveButton("Sign Out", (dialog, which) -> {
                        session.logout();
                        startActivity(new Intent(this, LoginActivity.class));
                        finish();
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
        });

        loadDashboardData();
        syncFcmDeviceToken();
    }

    @Override
    protected void onResume() {
        super.onResume();
        syncFcmDeviceToken();
    }

    private void syncFcmDeviceToken() {
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    String token = task.getResult();
                    JsonObject fcmJson = new JsonObject();
                    fcmJson.addProperty("token", token);
                    fcmJson.addProperty("provider", "fcm");
                    fcmJson.addProperty("device_type", "android");
                    JsonObject active = session.getActiveStudent();
                    if (active != null && active.has("id")) {
                        fcmJson.addProperty("student_id", active.get("id").getAsInt());
                    }
                    String jwtToken = session.getToken();
                    if (jwtToken != null && !jwtToken.isEmpty()) {
                        ApiClient.getInstance(this).post("/api/save-fcm-token", fcmJson.toString(), jwtToken, new Callback() {
                            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {
                                Log.w(TAG, "Failed to upload FCM token from StudentMainActivity", e);
                            }
                            @Override public void onResponse(@NonNull Call call, @NonNull Response res) {
                                try { res.close(); } catch (Exception ignored) {}
                            }
                        });
                    }
                }
            });
        } catch (Exception ignored) {}
    }

    private void setupCalendarGrid() {
        calendarGridAdapter = new CalendarGridAdapter(calendarDayList, day -> {
            selectedDateStr = day.dateStr;
            rebuildCalendarGridDays();
            showDateAttendanceDetail(selectedDateStr);
        });
        rvCalendarGrid.setLayoutManager(new GridLayoutManager(this, 7));
        rvCalendarGrid.setAdapter(calendarGridAdapter);

        btnPrevMonth.setOnClickListener(v -> {
            currentCal.add(Calendar.MONTH, -1);
            updateMonthViewAndFetch();
        });

        btnNextMonth.setOnClickListener(v -> {
            currentCal.add(Calendar.MONTH, 1);
            updateMonthViewAndFetch();
        });

        updateMonthHeader();
        rebuildCalendarGridDays();
    }

    private void updateMonthHeader() {
        SimpleDateFormat sdf = new SimpleDateFormat("MMMM yyyy", Locale.US);
        tvCurrentMonthTitle.setText(sdf.format(currentCal.getTime()));
    }

    private void updateMonthViewAndFetch() {
        updateMonthHeader();
        rebuildCalendarGridDays();
        loadAttendanceData();
    }

    private void rebuildCalendarGridDays() {
        calendarDayList.clear();

        Calendar tempCal = (Calendar) currentCal.clone();
        tempCal.set(Calendar.DAY_OF_MONTH, 1);

        int firstDayOfWeek = tempCal.get(Calendar.DAY_OF_WEEK); // Sunday = 1, Saturday = 7
        int daysInMonth = tempCal.getActualMaximum(Calendar.DAY_OF_MONTH);
        int year = tempCal.get(Calendar.YEAR);
        int month = tempCal.get(Calendar.MONTH); // 0-based

        String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());

        // Leading empty cells
        for (int i = 1; i < firstDayOfWeek; i++) {
            calendarDayList.add(new CalendarDay(0, "", false, false, false, false, false));
        }

        // Days of month
        for (int d = 1; d <= daysInMonth; d++) {
            String dateKey = String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, d);
            boolean isToday = dateKey.equals(todayStr);
            boolean isSelected = dateKey.equals(selectedDateStr);

            boolean hasSchool = false;
            boolean hasTuition = false;
            boolean isAbsent = false;

            AttendanceRecord rec = attendanceRecordMap.get(dateKey);
            if (rec != null) {
                if (rec.morning_in != null || "Present".equalsIgnoreCase(rec.morning_status) || "Present".equalsIgnoreCase(rec.status)) {
                    hasSchool = true;
                }
                if (rec.tuition_in != null || "Present".equalsIgnoreCase(rec.tuition_status)) {
                    hasTuition = true;
                }
                if ("Absent".equalsIgnoreCase(rec.status) && !hasSchool && !hasTuition) {
                    isAbsent = true;
                }
            }

            calendarDayList.add(new CalendarDay(d, dateKey, isToday, isSelected, hasSchool, hasTuition, isAbsent));
        }

        // Trailing padding cells to complete row
        int rem = calendarDayList.size() % 7;
        if (rem != 0) {
            int toAdd = 7 - rem;
            for (int i = 0; i < toAdd; i++) {
                calendarDayList.add(new CalendarDay(0, "", false, false, false, false, false));
            }
        }

        if (calendarGridAdapter != null) {
            calendarGridAdapter.notifyDataSetChanged();
        }
    }

    private void switchTab(int position) {
        layoutTabAttendance.setVisibility(position == 0 ? View.VISIBLE : View.GONE);
        layoutTabHomework.setVisibility(position == 1 ? View.VISIBLE : View.GONE);
        layoutTabNotifications.setVisibility(position == 2 ? View.VISIBLE : View.GONE);
        layoutTabFees.setVisibility(position == 3 ? View.VISIBLE : View.GONE);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_POST_NOTIFS);
            }
        }
    }

    private void setupUserData() {
        String role = session.getRole();
        if (tvPortalSubtitle != null) {
            tvPortalSubtitle.setText("parent".equalsIgnoreCase(role) ? "Parent Portal • Ward Overview" : "Student Portal • Academic Desk");
        }

        JsonObject active = session.getActiveStudent();
        if (active != null) {
            String name = active.has("name") ? active.get("name").getAsString() :
                    (active.has("first_name") ? active.get("first_name").getAsString() : "Student");
            tvStudentName.setText(name);

            String cls = active.has("class_name") ? active.get("class_name").getAsString() : "";
            String sec = active.has("section_name") ? active.get("section_name").getAsString() : "";
            String roll = active.has("roll_no") && !active.get("roll_no").isJsonNull() ? active.get("roll_no").getAsString() : "N/A";
            tvStudentClass.setText(cls + " - Section " + sec + " | Roll: " + roll);

            String adm = active.has("admission_no") ? active.get("admission_no").getAsString() : "";
            tvStudentAdm.setText("Admission No: " + adm);

            String gender = active.has("gender") && !active.get("gender").isJsonNull() ? active.get("gender").getAsString() : "Male";
            imgStudentAvatar.setImageResource("Female".equalsIgnoreCase(gender) ? R.drawable.ic_student_female : R.drawable.ic_student_male);
        } else {
            JsonObject user = session.getUser();
            if (user != null) {
                tvStudentName.setText(user.has("name") ? user.get("name").getAsString() : "User");
                String gender = user.has("gender") && !user.get("gender").isJsonNull() ? user.get("gender").getAsString() : "Male";
                imgStudentAvatar.setImageResource("Female".equalsIgnoreCase(gender) ? R.drawable.ic_avatar_female : R.drawable.ic_avatar_male);
            }
        }

        if (session.isMultiChild()) {
            JsonArray children = session.getChildren();
            btnSwitchChild.setVisibility(View.VISIBLE);
            btnSwitchChild.setText("Switch Ward (" + children.size() + " Available ▾)");
            btnSwitchChild.setOnClickListener(v -> showChildSelectionDialog());
        } else {
            btnSwitchChild.setVisibility(View.GONE);
        }
    }

    private void showChildSelectionDialog() {
        JsonArray children = session.getChildren();
        if (children == null || children.size() <= 1) return;

        int currentId = session.getActiveStudentId();
        int selectedIndex = 0;
        String[] items = new String[children.size()];

        for (int i = 0; i < children.size(); i++) {
            JsonObject ch = children.get(i).getAsJsonObject();
            String name = ch.has("name") ? ch.get("name").getAsString() : "Child " + (i + 1);
            String cls = ch.has("class_name") ? ch.get("class_name").getAsString() : "";
            String sec = ch.has("section_name") ? ch.get("section_name").getAsString() : "";
            int id = ch.has("id") ? ch.get("id").getAsInt() : 0;
            if (id == currentId) {
                selectedIndex = i;
            }
            items[i] = name + " (" + cls + (sec.isEmpty() ? "" : "-" + sec) + ")";
        }

        new AlertDialog.Builder(this)
                .setTitle("Select Active Child / Student")
                .setSingleChoiceItems(items, selectedIndex, (dialog, which) -> {
                    JsonObject selectedChild = children.get(which).getAsJsonObject();
                    session.setActiveStudent(selectedChild);
                    setupUserData();
                    loadDashboardData();
                    dialog.dismiss();
                    String cName = selectedChild.has("name") ? selectedChild.get("name").getAsString() : "";
                    Toast.makeText(this, "Active Ward: " + cName, Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showDateAttendanceDetail(String dateStr) {
        tvSelectedDateTitle.setText("Selected Date: " + dateStr);

        AttendanceRecord record = attendanceRecordMap.get(dateStr);
        if (record != null) {
            String status = record.status != null ? record.status : "Present";

            if (record.morning_in != null && record.tuition_in != null) {
                tvSelectedDateStatus.setText("School & Tuition");
                tvSelectedDateStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_green));
            } else if (record.morning_in != null) {
                tvSelectedDateStatus.setText("School Present");
                tvSelectedDateStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_green));
            } else if (record.tuition_in != null) {
                tvSelectedDateStatus.setText("Tuition Present");
                tvSelectedDateStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_gold_dark));
            } else if ("Present".equalsIgnoreCase(status)) {
                tvSelectedDateStatus.setText("Present");
                tvSelectedDateStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_green));
            } else if ("Absent".equalsIgnoreCase(status)) {
                tvSelectedDateStatus.setText("Absent");
                tvSelectedDateStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_red));
            } else {
                tvSelectedDateStatus.setText(status);
                tvSelectedDateStatus.setTextColor(ContextCompat.getColor(this, R.color.accent_gold_dark));
            }

            // Morning School Session
            String morningIn = record.morning_in != null ? record.morning_in.substring(0, Math.min(5, record.morning_in.length())) : "--";
            String morningOut = record.morning_out != null ? record.morning_out.substring(0, Math.min(5, record.morning_out.length())) : "--";
            tvSelectedSchoolTimes.setText("IN: " + morningIn + " | OUT: " + morningOut);

            // Evening Tuition Session
            String tuitionIn = record.tuition_in != null ? record.tuition_in.substring(0, Math.min(5, record.tuition_in.length())) : "--";
            String tuitionOut = record.tuition_out != null ? record.tuition_out.substring(0, Math.min(5, record.tuition_out.length())) : "--";
            tvSelectedTuitionTimes.setText("IN: " + tuitionIn + " | OUT: " + tuitionOut);

            tvSelectedRemarks.setText(record.remarks != null && !record.remarks.isEmpty() ? record.remarks : "Biometric Machine Recorded");
        } else {
            tvSelectedDateStatus.setText("No Record");
            tvSelectedDateStatus.setTextColor(ContextCompat.getColor(this, R.color.text_muted));
            tvSelectedSchoolTimes.setText("IN: -- | OUT: --");
            tvSelectedTuitionTimes.setText("IN: -- | OUT: --");
            tvSelectedRemarks.setText("No biometric attendance punches recorded on this date.");
        }
    }

    private void loadAttendanceData() {
        String token = session.getToken();
        ApiClient api = ApiClient.getInstance(this);

        String monthParam = new SimpleDateFormat("yyyy-MM", Locale.US).format(currentCal.getTime());
        String url = "/api/attendance?month=" + monthParam;

        api.get(url, token, new Callback() {
            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> swipeRefreshStudent.setRefreshing(false));
            }
            @Override public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);

                        // Stats
                        if (json.has("stats")) {
                            JsonObject stats = json.getAsJsonObject("stats");
                            int pct = stats.has("percentage") ? stats.get("percentage").getAsInt() : 100;
                            int schoolPres = stats.has("school_presents") ? stats.get("school_presents").getAsInt() : 0;
                            int tuitionPres = stats.has("tuition_presents") ? stats.get("tuition_presents").getAsInt() : 0;

                            runOnUiThread(() -> {
                                tvAttendancePct.setText(pct + "%");
                                tvSchoolPresents.setText(schoolPres + " Days");
                                tvTuitionPresents.setText(tuitionPres + " Days");

                                if (pct >= 85) {
                                    tvAttStatusSubtext.setText("High Regularity");
                                    tvAttStatusSubtext.setTextColor(ContextCompat.getColor(StudentMainActivity.this, R.color.accent_green));
                                } else if (pct >= 75) {
                                    tvAttStatusSubtext.setText("Satisfactory");
                                    tvAttStatusSubtext.setTextColor(ContextCompat.getColor(StudentMainActivity.this, R.color.primary_blue));
                                } else {
                                    tvAttStatusSubtext.setText("Low Attendance");
                                    tvAttStatusSubtext.setTextColor(ContextCompat.getColor(StudentMainActivity.this, R.color.accent_red));
                                }
                            });
                        }

                        // Records
                        if (json.has("records")) {
                            JsonArray recArr = json.getAsJsonArray("records");
                            attendanceRecordMap.clear();
                            attendanceRecordList.clear();

                            for (JsonElement el : recArr) {
                                AttendanceRecord rec = gson.fromJson(el, AttendanceRecord.class);
                                if (rec.attendance_date != null) {
                                    // Normalize YYYY-MM-DD
                                    String dateKey = rec.attendance_date.split("T")[0];
                                    attendanceRecordMap.put(dateKey, rec);
                                    attendanceRecordList.add(rec);
                                }
                            }

                            runOnUiThread(() -> {
                                rebuildCalendarGridDays();
                                rvStudentAttendance.setAdapter(new StudentAttendanceAdapter(attendanceRecordList));
                                showDateAttendanceDetail(selectedDateStr);
                            });
                        }
                    } catch (Exception e) {
                        Log.e("StudentMainActivity", "Error parsing attendance", e);
                    }
                }
            }
        });
    }

    private void loadDashboardData() {
        String token = session.getToken();
        ApiClient api = ApiClient.getInstance(this);

        swipeRefreshStudent.setRefreshing(true);

        // 1. Fetch Attendance (Calendar + Statistics + History)
        loadAttendanceData();

        // 2. Fetch Homework
        api.get("/api/homework", token, new Callback() {
            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {}
            @Override public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);
                        if (json.has("homework")) {
                            JsonArray arr = json.getAsJsonArray("homework");
                            List<HomeworkItem> list = new ArrayList<>();
                            for (JsonElement el : arr) {
                                list.add(gson.fromJson(el, HomeworkItem.class));
                            }
                            runOnUiThread(() -> {
                                rvStudentHomework.setAdapter(new HomeworkAdapter(list));
                                tvEmptyHomework.setVisibility(list.isEmpty() ? View.VISIBLE : View.GONE);
                            });
                        }
                    } catch (Exception e) {
                        Log.e("StudentMainActivity", "Error parsing homework", e);
                    }
                }
            }
        });

        // 3. Fetch Notifications / Notices
        api.get("/api/notifications", token, new Callback() {
            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {}
            @Override public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);
                        if (json.has("notifications")) {
                            JsonArray arr = json.getAsJsonArray("notifications");
                            List<NotificationItem> list = new ArrayList<>();
                            for (JsonElement el : arr) {
                                list.add(gson.fromJson(el, NotificationItem.class));
                            }
                            runOnUiThread(() -> {
                                rvStudentNotifs.setAdapter(new NotificationAdapter(list));
                                tvEmptyNotifs.setVisibility(list.isEmpty() ? View.VISIBLE : View.GONE);
                            });
                        }
                    } catch (Exception e) {
                        Log.e("StudentMainActivity", "Error parsing notifications", e);
                    }
                }
            }
        });

        // 4. Fetch Fees
        api.get("/api/fees", token, new Callback() {
            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> swipeRefreshStudent.setRefreshing(false));
            }
            @Override public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                runOnUiThread(() -> swipeRefreshStudent.setRefreshing(false));
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);
                        if (json.has("summary")) {
                            JsonObject sum = json.getAsJsonObject("summary");
                            double pending = sum.has("totalPending") ? sum.get("totalPending").getAsDouble() : 0.0;
                            double paid = sum.has("totalPaid") ? sum.get("totalPaid").getAsDouble() : 0.0;

                            runOnUiThread(() -> {
                                tvFeePending.setText("₹" + (int) pending);
                                tvFeePaid.setText("₹" + (int) paid);

                                if (pending <= 0) {
                                    tvFeeStatusSubtext.setText("✓ Dues Cleared");
                                    tvFeeStatusSubtext.setTextColor(ContextCompat.getColor(StudentMainActivity.this, R.color.accent_green));
                                    tvFeePaymentMode.setText("Up to date");
                                } else {
                                    tvFeeStatusSubtext.setText("⚠️ Pending Dues");
                                    tvFeeStatusSubtext.setTextColor(ContextCompat.getColor(StudentMainActivity.this, R.color.accent_red));
                                    tvFeePaymentMode.setText("Payment Due");
                                }
                            });
                        }
                    } catch (Exception e) {
                        Log.e("StudentMainActivity", "Error parsing fees", e);
                    }
                }
            }
        });
    }
}
