package com.qsa.school.ui;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.textfield.TextInputEditText;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.network.ApiClient;
import com.qsa.school.network.GsonHelper;
import com.qsa.school.network.SessionManager;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class AdminMainActivity extends AppCompatActivity {

    private static final String TAG = "AdminMainActivity";

    // Header Views
    private SwipeRefreshLayout swipeRefreshAdmin;
    private ImageView imgAdminAvatar;
    private TextView tvAdminSubtitle;
    private ImageButton btnRefreshAdmin, btnLogoutAdmin;

    // Tabs
    private TabLayout adminTabLayout;
    private LinearLayout layoutTabOverview, layoutTabAttendance, layoutTabDirectory, layoutTabBroadcast, layoutTabFees;

    // Tab 0: Overview Views
    private TextView tvBiometricStatusBadge, tvBiometricSubtext;
    private TextView tvAdminTotalStudents, tvAdminTotalTeachers;
    private TextView tvSchoolAttPct, tvSchoolAttCounts;
    private TextView tvTuitionAttPct, tvTuitionAttCounts;
    private TextView tvAdminCollected, tvAdminPending;
    private RecyclerView rvRecentPunches;
    private TextView tvEmptyPunches;
    private final List<JsonObject> recentPunchesList = new ArrayList<>();
    private RecentPunchesAdapter recentPunchesAdapter;

    // Tab 1: Attendance Views
    private MaterialButton btnSessionSchool, btnSessionTuition;
    private String currentAttSession = "school"; // 'school' or 'tuition'
    private RecyclerView rvClassAttendance, rvAbsentees;
    private TextView tvAbsenteesHeader, tvEmptyAbsentees;
    private final List<JsonObject> classAttendanceList = new ArrayList<>();
    private final List<JsonObject> absenteesList = new ArrayList<>();
    private ClassAttendanceAdapter classAttendanceAdapter;
    private AbsenteesAdapter absenteesAdapter;

    // Tab 2: Directory Views
    private TextInputEditText etDirectorySearch;
    private MaterialButton btnDirFilterStudents, btnDirFilterTeachers;
    private String currentDirType = "students"; // 'students' or 'teachers'
    private RecyclerView rvDirectoryList;
    private TextView tvEmptyDirectory;
    private final List<JsonObject> directoryItemList = new ArrayList<>();
    private DirectoryAdapter directoryAdapter;

    // Tab 3: Broadcast Views
    private EditText etAdminNoticeTitle, etAdminNoticeMsg;
    private RadioGroup rgNoticeTarget;
    private MaterialButton btnAdminBroadcast;

    // Tab 4: Fees Views
    private TextView tvFeeMonthCollected, tvFeeTotalPending;
    private RecyclerView rvDefaulters;
    private TextView tvEmptyDefaulters;
    private final List<JsonObject> defaultersList = new ArrayList<>();
    private DefaultersAdapter defaultersAdapter;

    private SessionManager session;
    private final Gson gson = GsonHelper.getGson();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_admin_main);

        session = new SessionManager(this);

        // Bind Views
        bindViews();

        // Setup User Header
        setupHeader();

        // Setup Tab Navigation
        setupTabs();

        // Setup RecyclerViews
        setupRecyclerViews();

        // Setup Listeners
        setupListeners();

        // Sync Device Push Token for Admin
        syncAdminDeviceToken();

        // Initial Load
        loadAllData();
    }

    private void bindViews() {
        swipeRefreshAdmin = findViewById(R.id.swipeRefreshAdmin);
        imgAdminAvatar = findViewById(R.id.imgAdminAvatar);
        tvAdminSubtitle = findViewById(R.id.tvAdminSubtitle);
        btnRefreshAdmin = findViewById(R.id.btnRefreshAdmin);
        btnLogoutAdmin = findViewById(R.id.btnLogoutAdmin);

        adminTabLayout = findViewById(R.id.adminTabLayout);
        layoutTabOverview = findViewById(R.id.layoutTabOverview);
        layoutTabAttendance = findViewById(R.id.layoutTabAttendance);
        layoutTabDirectory = findViewById(R.id.layoutTabDirectory);
        layoutTabBroadcast = findViewById(R.id.layoutTabBroadcast);
        layoutTabFees = findViewById(R.id.layoutTabFees);

        // Tab 0 Views
        tvBiometricStatusBadge = findViewById(R.id.tvBiometricStatusBadge);
        tvBiometricSubtext = findViewById(R.id.tvBiometricSubtext);
        tvAdminTotalStudents = findViewById(R.id.tvAdminTotalStudents);
        tvAdminTotalTeachers = findViewById(R.id.tvAdminTotalTeachers);
        tvSchoolAttPct = findViewById(R.id.tvSchoolAttPct);
        tvSchoolAttCounts = findViewById(R.id.tvSchoolAttCounts);
        tvTuitionAttPct = findViewById(R.id.tvTuitionAttPct);
        tvTuitionAttCounts = findViewById(R.id.tvTuitionAttCounts);
        tvAdminCollected = findViewById(R.id.tvAdminCollected);
        tvAdminPending = findViewById(R.id.tvAdminPending);
        rvRecentPunches = findViewById(R.id.rvRecentPunches);
        tvEmptyPunches = findViewById(R.id.tvEmptyPunches);

        // Tab 1 Views
        btnSessionSchool = findViewById(R.id.btnSessionSchool);
        btnSessionTuition = findViewById(R.id.btnSessionTuition);
        rvClassAttendance = findViewById(R.id.rvClassAttendance);
        rvAbsentees = findViewById(R.id.rvAbsentees);
        tvAbsenteesHeader = findViewById(R.id.tvAbsenteesHeader);
        tvEmptyAbsentees = findViewById(R.id.tvEmptyAbsentees);

        // Tab 2 Views
        etDirectorySearch = findViewById(R.id.etDirectorySearch);
        btnDirFilterStudents = findViewById(R.id.btnDirFilterStudents);
        btnDirFilterTeachers = findViewById(R.id.btnDirFilterTeachers);
        rvDirectoryList = findViewById(R.id.rvDirectoryList);
        tvEmptyDirectory = findViewById(R.id.tvEmptyDirectory);

        // Tab 3 Views
        etAdminNoticeTitle = findViewById(R.id.etAdminNoticeTitle);
        etAdminNoticeMsg = findViewById(R.id.etAdminNoticeMsg);
        rgNoticeTarget = findViewById(R.id.rgNoticeTarget);
        btnAdminBroadcast = findViewById(R.id.btnAdminBroadcast);

        // Tab 4 Views
        tvFeeMonthCollected = findViewById(R.id.tvFeeMonthCollected);
        tvFeeTotalPending = findViewById(R.id.tvFeeTotalPending);
        rvDefaulters = findViewById(R.id.rvDefaulters);
        tvEmptyDefaulters = findViewById(R.id.tvEmptyDefaulters);
    }

    private void setupHeader() {
        JsonObject user = session.getUser();
        if (user != null) {
            String name = user.has("name") ? user.get("name").getAsString() : "Administrator";
            tvAdminSubtitle.setText("Welcome, " + name + " • Director Desk");
            String gender = user.has("gender") && !user.get("gender").isJsonNull() ? user.get("gender").getAsString() : "Male";
            imgAdminAvatar.setImageResource("Female".equalsIgnoreCase(gender) ? R.drawable.ic_avatar_female : R.drawable.ic_avatar_male);
        }
    }

    private void setupTabs() {
        adminTabLayout.addOnTabSelectedListener(new TabLayout.OnTabSelectedListener() {
            @Override
            public void onTabSelected(TabLayout.Tab tab) {
                switchTab(tab.getPosition());
            }
            @Override public void onTabUnselected(TabLayout.Tab tab) {}
            @Override public void onTabReselected(TabLayout.Tab tab) {}
        });
    }

    private void switchTab(int position) {
        layoutTabOverview.setVisibility(position == 0 ? View.VISIBLE : View.GONE);
        layoutTabAttendance.setVisibility(position == 1 ? View.VISIBLE : View.GONE);
        layoutTabDirectory.setVisibility(position == 2 ? View.VISIBLE : View.GONE);
        layoutTabBroadcast.setVisibility(position == 3 ? View.VISIBLE : View.GONE);
        layoutTabFees.setVisibility(position == 4 ? View.VISIBLE : View.GONE);

        // Auto load tab data when tapped
        if (position == 0) loadDashboardMetrics();
        else if (position == 1) loadAttendanceData();
        else if (position == 2) loadDirectoryData();
        else if (position == 4) loadFeesData();
    }

    private void setupRecyclerViews() {
        // Tab 0
        recentPunchesAdapter = new RecentPunchesAdapter(recentPunchesList);
        rvRecentPunches.setLayoutManager(new LinearLayoutManager(this));
        rvRecentPunches.setAdapter(recentPunchesAdapter);

        // Tab 1
        classAttendanceAdapter = new ClassAttendanceAdapter(classAttendanceList);
        rvClassAttendance.setLayoutManager(new LinearLayoutManager(this));
        rvClassAttendance.setAdapter(classAttendanceAdapter);

        absenteesAdapter = new AbsenteesAdapter(absenteesList, this::makePhoneCall);
        rvAbsentees.setLayoutManager(new LinearLayoutManager(this));
        rvAbsentees.setAdapter(absenteesAdapter);

        // Tab 2
        directoryAdapter = new DirectoryAdapter(directoryItemList, this::makePhoneCall, this::showEditBiometricDialog);
        rvDirectoryList.setLayoutManager(new LinearLayoutManager(this));
        rvDirectoryList.setAdapter(directoryAdapter);

        // Tab 4
        defaultersAdapter = new DefaultersAdapter(defaultersList, this::makePhoneCall);
        rvDefaulters.setLayoutManager(new LinearLayoutManager(this));
        rvDefaulters.setAdapter(defaultersAdapter);
    }

    private void setupListeners() {
        swipeRefreshAdmin.setColorSchemeResources(R.color.primary_blue, R.color.accent_gold);
        swipeRefreshAdmin.setOnRefreshListener(() -> {
            loadAllData();
            swipeRefreshAdmin.setRefreshing(false);
        });

        btnRefreshAdmin.setOnClickListener(v -> loadAllData());

        btnLogoutAdmin.setOnClickListener(v -> {
            new AlertDialog.Builder(this)
                    .setTitle("Sign Out")
                    .setMessage("Are you sure you want to sign out from the Admin Hub?")
                    .setPositiveButton("Sign Out", (dialog, which) -> {
                        session.logout();
                        startActivity(new Intent(this, LoginActivity.class));
                        finish();
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
        });

        // Tab 1: Session Selector
        btnSessionSchool.setOnClickListener(v -> {
            currentAttSession = "school";
            btnSessionSchool.setBackgroundColor(getResources().getColor(R.color.primary_blue));
            btnSessionSchool.setTextColor(getResources().getColor(android.R.color.white));
            btnSessionTuition.setBackgroundColor(getResources().getColor(android.R.color.transparent));
            btnSessionTuition.setTextColor(getResources().getColor(R.color.primary_blue));
            loadAttendanceData();
        });

        btnSessionTuition.setOnClickListener(v -> {
            currentAttSession = "tuition";
            btnSessionTuition.setBackgroundColor(getResources().getColor(R.color.primary_blue));
            btnSessionTuition.setTextColor(getResources().getColor(android.R.color.white));
            btnSessionSchool.setBackgroundColor(getResources().getColor(android.R.color.transparent));
            btnSessionSchool.setTextColor(getResources().getColor(R.color.primary_blue));
            loadAttendanceData();
        });

        // Tab 2: Directory Filter
        btnDirFilterStudents.setOnClickListener(v -> {
            currentDirType = "students";
            btnDirFilterStudents.setBackgroundColor(getResources().getColor(R.color.primary_blue));
            btnDirFilterStudents.setTextColor(getResources().getColor(android.R.color.white));
            btnDirFilterTeachers.setBackgroundColor(getResources().getColor(android.R.color.transparent));
            btnDirFilterTeachers.setTextColor(getResources().getColor(R.color.primary_blue));
            loadDirectoryData();
        });

        btnDirFilterTeachers.setOnClickListener(v -> {
            currentDirType = "teachers";
            btnDirFilterTeachers.setBackgroundColor(getResources().getColor(R.color.primary_blue));
            btnDirFilterTeachers.setTextColor(getResources().getColor(android.R.color.white));
            btnDirFilterStudents.setBackgroundColor(getResources().getColor(android.R.color.transparent));
            btnDirFilterStudents.setTextColor(getResources().getColor(R.color.primary_blue));
            loadDirectoryData();
        });

        // Directory Live Search
        if (etDirectorySearch != null) {
            etDirectorySearch.addTextChangedListener(new TextWatcher() {
                @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
                @Override public void onTextChanged(CharSequence s, int start, int count, int after) {
                    loadDirectoryData();
                }
                @Override public void afterTextChanged(Editable s) {}
            });
        }

        // Tab 3: Broadcast Button
        btnAdminBroadcast.setOnClickListener(v -> sendBroadcastNotice());
    }

    private void loadAllData() {
        loadDashboardMetrics();
        loadAttendanceData();
        loadDirectoryData();
        loadFeesData();
    }

    // =========================================================================
    // API CALLS
    // =========================================================================

    private void loadDashboardMetrics() {
        ApiClient.getInstance(this).get("/api/admin/dashboard", session.getToken(), new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> Toast.makeText(AdminMainActivity.this, "Network error: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);
                        if (json.has("dashboard")) {
                            JsonObject dash = json.getAsJsonObject("dashboard");
                            int students = dash.has("total_students") ? dash.get("total_students").getAsInt() : 0;
                            int teachers = dash.has("total_teachers") ? dash.get("total_teachers").getAsInt() : 0;

                            // Attendance
                            JsonObject att = dash.getAsJsonObject("attendance");
                            JsonObject school = att.getAsJsonObject("school");
                            JsonObject tuition = att.getAsJsonObject("tuition");

                            int sPct = school.has("percentage") ? school.get("percentage").getAsInt() : 0;
                            int sPres = school.has("present") ? school.get("present").getAsInt() : 0;
                            int sAbs = school.has("absent") ? school.get("absent").getAsInt() : 0;

                            int tPct = tuition.has("percentage") ? tuition.get("percentage").getAsInt() : 0;
                            int tPres = tuition.has("present") ? tuition.get("present").getAsInt() : 0;
                            int tAbs = tuition.has("absent") ? tuition.get("absent").getAsInt() : 0;

                            // Financials
                            JsonObject fin = dash.getAsJsonObject("financials");
                            double todayCol = fin.has("today_collected") ? fin.get("today_collected").getAsDouble() : 0;
                            double totalPen = fin.has("total_pending") ? fin.get("total_pending").getAsDouble() : 0;

                            // Biometric
                            JsonObject bio = dash.getAsJsonObject("biometric");
                            boolean isOnline = bio.has("is_online") && bio.get("is_online").getAsBoolean();
                            int todayPunches = bio.has("today_punches") ? bio.get("today_punches").getAsInt() : 0;

                            JsonArray punchesArr = bio.getAsJsonArray("recent_punches");
                            List<JsonObject> parsedPunches = new ArrayList<>();
                            if (punchesArr != null) {
                                for (JsonElement el : punchesArr) {
                                    parsedPunches.add(el.getAsJsonObject());
                                }
                            }

                            runOnUiThread(() -> {
                                tvAdminTotalStudents.setText(String.valueOf(students));
                                tvAdminTotalTeachers.setText(String.valueOf(teachers));

                                tvSchoolAttPct.setText(sPct + "%");
                                tvSchoolAttCounts.setText("Present: " + sPres + " • Absent: " + sAbs);

                                tvTuitionAttPct.setText(tPct + "%");
                                tvTuitionAttCounts.setText("Present: " + tPres + " • Absent: " + tAbs);

                                tvAdminCollected.setText("₹" + (int) todayCol);
                                tvAdminPending.setText("₹" + (int) totalPen);

                                tvBiometricStatusBadge.setText(isOnline ? "ONLINE" : "STANDBY");
                                tvBiometricStatusBadge.setTextColor(getResources().getColor(isOnline ? R.color.success_green : R.color.accent_gold));
                                tvBiometricSubtext.setText("Punches Today: " + todayPunches + " • Realtime Biometric Active");

                                recentPunchesList.clear();
                                recentPunchesList.addAll(parsedPunches);
                                recentPunchesAdapter.notifyDataSetChanged();
                                tvEmptyPunches.setVisibility(recentPunchesList.isEmpty() ? View.VISIBLE : View.GONE);
                            });
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Dashboard parse error", e);
                    }
                }
            }
        });
    }

    private void loadAttendanceData() {
        String url = "/api/admin/attendance?session=" + currentAttSession;
        ApiClient.getInstance(this).get(url, session.getToken(), new Callback() {
            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {}

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);

                        List<JsonObject> classes = new ArrayList<>();
                        if (json.has("classes")) {
                            for (JsonElement el : json.getAsJsonArray("classes")) {
                                classes.add(el.getAsJsonObject());
                            }
                        }

                        List<JsonObject> abs = new ArrayList<>();
                        if (json.has("absentees")) {
                            for (JsonElement el : json.getAsJsonArray("absentees")) {
                                abs.add(el.getAsJsonObject());
                            }
                        }

                        runOnUiThread(() -> {
                            classAttendanceList.clear();
                            classAttendanceList.addAll(classes);
                            classAttendanceAdapter.notifyDataSetChanged();

                            absenteesList.clear();
                            absenteesList.addAll(abs);
                            absenteesAdapter.notifyDataSetChanged();

                            tvAbsenteesHeader.setText("Today's Absentees (" + abs.size() + ")");
                            tvEmptyAbsentees.setVisibility(abs.isEmpty() ? View.VISIBLE : View.GONE);
                        });
                    } catch (Exception e) {
                        Log.e(TAG, "Attendance parse error", e);
                    }
                }
            }
        });
    }

    private void loadDirectoryData() {
        String query = etDirectorySearch != null && etDirectorySearch.getText() != null ? etDirectorySearch.getText().toString().trim() : "";
        String url = "/api/admin/directory?type=" + currentDirType + "&query=" + Uri.encode(query);

        ApiClient.getInstance(this).get(url, session.getToken(), new Callback() {
            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {}

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);

                        List<JsonObject> results = new ArrayList<>();
                        if (json.has("results")) {
                            for (JsonElement el : json.getAsJsonArray("results")) {
                                results.add(el.getAsJsonObject());
                            }
                        }

                        runOnUiThread(() -> {
                            directoryItemList.clear();
                            directoryItemList.addAll(results);
                            directoryAdapter.setType(currentDirType);
                            directoryAdapter.notifyDataSetChanged();
                            tvEmptyDirectory.setVisibility(results.isEmpty() ? View.VISIBLE : View.GONE);
                        });
                    } catch (Exception e) {
                        Log.e(TAG, "Directory parse error", e);
                    }
                }
            }
        });
    }

    private void loadFeesData() {
        ApiClient.getInstance(this).get("/api/admin/fees", session.getToken(), new Callback() {
            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {}

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);

                        if (json.has("summary")) {
                            JsonObject sum = json.getAsJsonObject("summary");
                            double monthCol = sum.has("month_collected") ? sum.get("month_collected").getAsDouble() : 0;
                            double totPen = sum.has("total_pending") ? sum.get("total_pending").getAsDouble() : 0;

                            List<JsonObject> defs = new ArrayList<>();
                            if (json.has("defaulters")) {
                                for (JsonElement el : json.getAsJsonArray("defaulters")) {
                                    defs.add(el.getAsJsonObject());
                                }
                            }

                            runOnUiThread(() -> {
                                tvFeeMonthCollected.setText("₹" + (int) monthCol);
                                tvFeeTotalPending.setText("₹" + (int) totPen);

                                defaultersList.clear();
                                defaultersList.addAll(defs);
                                defaultersAdapter.notifyDataSetChanged();
                                tvEmptyDefaulters.setVisibility(defs.isEmpty() ? View.VISIBLE : View.GONE);
                            });
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Fees parse error", e);
                    }
                }
            }
        });
    }

    private void sendBroadcastNotice() {
        String title = etAdminNoticeTitle.getText().toString().trim();
        String msg = etAdminNoticeMsg.getText().toString().trim();

        if (title.isEmpty() || msg.isEmpty()) {
            Toast.makeText(this, "Please enter notice title and message", Toast.LENGTH_SHORT).show();
            return;
        }

        String targetRole = "all";
        if (rgNoticeTarget.getCheckedRadioButtonId() == R.id.rbTargetParents) {
            targetRole = "parent";
        } else if (rgNoticeTarget.getCheckedRadioButtonId() == R.id.rbTargetTeachers) {
            targetRole = "teacher";
        }

        btnAdminBroadcast.setEnabled(false);

        JsonObject payload = new JsonObject();
        payload.addProperty("title", title);
        payload.addProperty("message", msg);
        payload.addProperty("category", "emergency");
        payload.addProperty("target_role", targetRole);
        payload.addProperty("is_pinned", 1);

        ApiClient.getInstance(this).post("/api/admin/broadcast-notice", payload.toString(), session.getToken(), new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> {
                    btnAdminBroadcast.setEnabled(true);
                    Toast.makeText(AdminMainActivity.this, "Failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                runOnUiThread(() -> {
                    btnAdminBroadcast.setEnabled(true);
                    etAdminNoticeTitle.setText("");
                    etAdminNoticeMsg.setText("");
                    Toast.makeText(AdminMainActivity.this, "🚀 Notice broadcasted & Push notification sent!", Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private void makePhoneCall(String phone) {
        if (phone == null || phone.trim().isEmpty()) {
            Toast.makeText(this, "Phone number not registered", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL);
            intent.setData(Uri.parse("tel:" + phone.trim().replaceAll("[^0-9+]", "")));
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Could not open dialer: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void showEditBiometricDialog(JsonObject student) {
        int studentId = student.get("id").getAsInt();
        String studentName = student.get("name").getAsString();
        String currentBioId = student.has("biometric_id") && !student.get("biometric_id").isJsonNull() ? student.get("biometric_id").getAsString() : "";

        EditText input = new EditText(this);
        input.setHint("e.g. 1, 2, 101");
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setText(currentBioId);
        input.setSelection(input.getText().length());

        FrameLayout container = new FrameLayout(this);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.leftMargin = 50;
        params.rightMargin = 50;
        params.topMargin = 20;
        params.bottomMargin = 20;
        input.setLayoutParams(params);
        container.addView(input);

        new AlertDialog.Builder(this)
                .setTitle("Assign Biometric Machine ID")
                .setMessage("Enter the numeric User ID assigned on the biometric machine for " + studentName + ":")
                .setView(container)
                .setPositiveButton("Save", (dialog, which) -> {
                    String newBioId = input.getText().toString().trim();
                    updateStudentBiometricId(studentId, newBioId);
                })
                .setNegativeButton("Cancel", null)
                .setNeutralButton("Clear ID", (dialog, which) -> {
                    updateStudentBiometricId(studentId, "");
                })
                .show();
    }

    private void updateStudentBiometricId(int studentId, String bioId) {
        JsonObject payload = new JsonObject();
        payload.addProperty("student_id", studentId);
        payload.addProperty("biometric_id", bioId);

        ApiClient.getInstance(this).post("/api/admin/student/biometric-id", payload.toString(), session.getToken(), new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> Toast.makeText(AdminMainActivity.this, "Failed to update: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                String body = response.body().string();
                runOnUiThread(() -> {
                    try {
                        JsonObject res = gson.fromJson(body, JsonObject.class);
                        if (res.has("success") && res.get("success").getAsBoolean()) {
                            Toast.makeText(AdminMainActivity.this, res.get("message").getAsString(), Toast.LENGTH_SHORT).show();
                            loadDirectoryData();
                        } else {
                            String msg = res.has("message") ? res.get("message").getAsString() : "Error saving ID";
                            Toast.makeText(AdminMainActivity.this, msg, Toast.LENGTH_LONG).show();
                        }
                    } catch (Exception e) {
                        Toast.makeText(AdminMainActivity.this, "Error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                });
            }
        });
    }

    private void syncAdminDeviceToken() {
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    JsonObject fcmJson = new JsonObject();
                    fcmJson.addProperty("token", task.getResult());
                    fcmJson.addProperty("provider", "fcm");
                    fcmJson.addProperty("device_type", "android");
                    String jwtToken = session.getToken();
                    if (jwtToken != null && !jwtToken.isEmpty()) {
                        ApiClient.getInstance(this).post("/api/save-fcm-token", fcmJson.toString(), jwtToken, new Callback() {
                            @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {}
                            @Override public void onResponse(@NonNull Call call, @NonNull Response res) {
                                try { res.close(); } catch (Exception ignored) {}
                            }
                        });
                    }
                }
            });
        } catch (Exception ignored) {}
    }

    // =========================================================================
    // RECYCLERVIEW ADAPTERS
    // =========================================================================

    // 1. Recent Punches Adapter
    private static class RecentPunchesAdapter extends RecyclerView.Adapter<RecentPunchesAdapter.ViewHolder> {
        private final List<JsonObject> items;

        RecentPunchesAdapter(List<JsonObject> items) { this.items = items; }

        @NonNull @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_recent_punch, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            JsonObject item = items.get(position);
            holder.tvPunchName.setText(item.has("matched_name") ? item.get("matched_name").getAsString() : "Unknown");
            String enroll = item.has("enroll_id") ? item.get("enroll_id").getAsString() : "";
            String type = item.has("punch_type") ? item.get("punch_type").getAsString() : "Punch";
            holder.tvPunchDetails.setText("Machine ID: " + enroll + " • " + type);
            holder.tvPunchTime.setText(item.has("punch_time_formatted") ? item.get("punch_time_formatted").getAsString() : "");
        }

        @Override public int getItemCount() { return items.size(); }

        static class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvPunchName, tvPunchDetails, tvPunchTime;
            ViewHolder(View v) {
                super(v);
                tvPunchName = v.findViewById(R.id.tvPunchName);
                tvPunchDetails = v.findViewById(R.id.tvPunchDetails);
                tvPunchTime = v.findViewById(R.id.tvPunchTime);
            }
        }
    }

    // 2. Class Attendance Adapter
    private static class ClassAttendanceAdapter extends RecyclerView.Adapter<ClassAttendanceAdapter.ViewHolder> {
        private final List<JsonObject> items;

        ClassAttendanceAdapter(List<JsonObject> items) { this.items = items; }

        @NonNull @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_admin_class_att, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            JsonObject item = items.get(position);
            String cls = item.has("class_name") ? item.get("class_name").getAsString() : "";
            String sec = item.has("section_name") ? item.get("section_name").getAsString() : "";
            holder.tvClassName.setText(cls + " - Section " + sec);

            int pres = item.has("present_count") ? item.get("present_count").getAsInt() : 0;
            int abs = item.has("absent_count") ? item.get("absent_count").getAsInt() : 0;
            int tot = item.has("total_students") ? item.get("total_students").getAsInt() : 0;
            holder.tvClassCounts.setText("Present: " + pres + " • Absent: " + abs + " • Total: " + tot);

            int pct = item.has("percentage") ? item.get("percentage").getAsInt() : 0;
            holder.tvClassPct.setText(pct + "%");
        }

        @Override public int getItemCount() { return items.size(); }

        static class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvClassName, tvClassCounts, tvClassPct;
            ViewHolder(View v) {
                super(v);
                tvClassName = v.findViewById(R.id.tvClassName);
                tvClassCounts = v.findViewById(R.id.tvClassCounts);
                tvClassPct = v.findViewById(R.id.tvClassPct);
            }
        }
    }

    // 3. Absentees Adapter
    private static class AbsenteesAdapter extends RecyclerView.Adapter<AbsenteesAdapter.ViewHolder> {
        private final List<JsonObject> items;
        private final OnCallListener callListener;

        interface OnCallListener { void onCall(String phone); }

        AbsenteesAdapter(List<JsonObject> items, OnCallListener callListener) {
            this.items = items;
            this.callListener = callListener;
        }

        @NonNull @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_admin_absentee, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            JsonObject item = items.get(position);
            holder.tvAbsentStudentName.setText(item.has("name") ? item.get("name").getAsString() : "");
            String cls = item.has("class_label") ? item.get("class_label").getAsString() : "";
            String roll = item.has("roll_no") ? item.get("roll_no").getAsString() : "";
            holder.tvAbsentClassRoll.setText(cls + " | Roll: " + roll);

            String father = item.has("father_name") ? item.get("father_name").getAsString() : "Guardian";
            String phone = item.has("father_phone") && !item.get("father_phone").isJsonNull() ? item.get("father_phone").getAsString() : "";
            holder.tvAbsentFather.setText("Father: " + father + (phone.isEmpty() ? "" : " (" + phone + ")"));

            holder.btnCallAbsentee.setOnClickListener(v -> callListener.onCall(phone));
        }

        @Override public int getItemCount() { return items.size(); }

        static class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvAbsentStudentName, tvAbsentClassRoll, tvAbsentFather;
            MaterialButton btnCallAbsentee;
            ViewHolder(View v) {
                super(v);
                tvAbsentStudentName = v.findViewById(R.id.tvAbsentStudentName);
                tvAbsentClassRoll = v.findViewById(R.id.tvAbsentClassRoll);
                tvAbsentFather = v.findViewById(R.id.tvAbsentFather);
                btnCallAbsentee = v.findViewById(R.id.btnCallAbsentee);
            }
        }
    }

    // 4. Directory Adapter (Students & Teachers)
    private static class DirectoryAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {
        private final List<JsonObject> items;
        private final OnCallListener callListener;
        private final OnEditBioListener editBioListener;
        private String type = "students";

        interface OnCallListener { void onCall(String phone); }
        interface OnEditBioListener { void onEditBio(JsonObject student); }

        DirectoryAdapter(List<JsonObject> items, OnCallListener callListener, OnEditBioListener editBioListener) {
            this.items = items;
            this.callListener = callListener;
            this.editBioListener = editBioListener;
        }

        void setType(String type) { this.type = type; }

        @Override public int getItemViewType(int position) {
            return "teachers".equalsIgnoreCase(type) ? 1 : 0;
        }

        @NonNull @Override
        public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            if (viewType == 1) {
                View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_admin_directory_teacher, parent, false);
                return new TeacherViewHolder(v);
            } else {
                View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_admin_directory_student, parent, false);
                return new StudentViewHolder(v);
            }
        }

        @Override
        public void onBindViewHolder(@NonNull RecyclerView.ViewHolder rawHolder, int position) {
            JsonObject item = items.get(position);
            if (rawHolder instanceof StudentViewHolder) {
                StudentViewHolder holder = (StudentViewHolder) rawHolder;
                holder.tvDirStudentName.setText(item.has("name") ? item.get("name").getAsString() : "");
                String cls = item.has("class_label") ? item.get("class_label").getAsString() : "";
                String roll = item.has("roll_no") ? item.get("roll_no").getAsString() : "";
                holder.tvDirStudentClass.setText(cls + " | Roll: " + roll);

                String father = item.has("father_name") ? item.get("father_name").getAsString() : "Guardian";
                String phone = item.has("father_phone") && !item.get("father_phone").isJsonNull() ? item.get("father_phone").getAsString() : "";
                holder.tvDirFatherContact.setText("Father: " + father + (phone.isEmpty() ? "" : " (" + phone + ")"));

                String bioId = item.has("biometric_id") && !item.get("biometric_id").isJsonNull() ? item.get("biometric_id").getAsString() : null;
                if (bioId != null && !bioId.isEmpty()) {
                    holder.tvDirBioBadge.setText("Bio: #" + bioId);
                    holder.tvDirBioBadge.setVisibility(View.VISIBLE);
                    holder.btnDirEditBio.setText("Edit Bio (#" + bioId + ")");
                } else {
                    holder.tvDirBioBadge.setVisibility(View.GONE);
                    holder.btnDirEditBio.setText("+ Assign Bio ID");
                }

                String gender = item.has("gender") && !item.get("gender").isJsonNull() ? item.get("gender").getAsString() : "Male";
                holder.imgDirAvatar.setImageResource("Female".equalsIgnoreCase(gender) ? R.drawable.ic_student_female : R.drawable.ic_student_male);

                holder.btnDirCall.setOnClickListener(v -> callListener.onCall(phone));
                holder.btnDirEditBio.setOnClickListener(v -> editBioListener.onEditBio(item));
            } else if (rawHolder instanceof TeacherViewHolder) {
                TeacherViewHolder holder = (TeacherViewHolder) rawHolder;
                holder.tvTeacherName.setText(item.has("name") ? item.get("name").getAsString() : "");
                String desig = item.has("designation") ? item.get("designation").getAsString() : "Faculty";
                String cls = item.has("assigned_class") ? item.get("assigned_class").getAsString() : "";
                holder.tvTeacherDesignation.setText(desig + " • " + cls);

                String phone = item.has("phone") && !item.get("phone").isJsonNull() ? item.get("phone").getAsString() : "";
                String emp = item.has("employee_code") && !item.get("employee_code").isJsonNull() ? item.get("employee_code").getAsString() : "";
                holder.tvTeacherContact.setText((phone.isEmpty() ? "No Phone" : phone) + (emp.isEmpty() ? "" : " • " + emp));

                String gender = item.has("gender") && !item.get("gender").isJsonNull() ? item.get("gender").getAsString() : "Male";
                holder.imgTeacherAvatar.setImageResource("Female".equalsIgnoreCase(gender) ? R.drawable.ic_avatar_female : R.drawable.ic_avatar_male);

                holder.btnCallTeacher.setOnClickListener(v -> callListener.onCall(phone));
            }
        }

        @Override public int getItemCount() { return items.size(); }

        static class StudentViewHolder extends RecyclerView.ViewHolder {
            ImageView imgDirAvatar;
            TextView tvDirStudentName, tvDirStudentClass, tvDirFatherContact, tvDirBioBadge;
            MaterialButton btnDirEditBio, btnDirCall;
            StudentViewHolder(View v) {
                super(v);
                imgDirAvatar = v.findViewById(R.id.imgDirAvatar);
                tvDirStudentName = v.findViewById(R.id.tvDirStudentName);
                tvDirStudentClass = v.findViewById(R.id.tvDirStudentClass);
                tvDirFatherContact = v.findViewById(R.id.tvDirFatherContact);
                tvDirBioBadge = v.findViewById(R.id.tvDirBioBadge);
                btnDirEditBio = v.findViewById(R.id.btnDirEditBio);
                btnDirCall = v.findViewById(R.id.btnDirCall);
            }
        }

        static class TeacherViewHolder extends RecyclerView.ViewHolder {
            ImageView imgTeacherAvatar;
            TextView tvTeacherName, tvTeacherDesignation, tvTeacherContact;
            MaterialButton btnCallTeacher;
            TeacherViewHolder(View v) {
                super(v);
                imgTeacherAvatar = v.findViewById(R.id.imgTeacherAvatar);
                tvTeacherName = v.findViewById(R.id.tvTeacherName);
                tvTeacherDesignation = v.findViewById(R.id.tvTeacherDesignation);
                tvTeacherContact = v.findViewById(R.id.tvTeacherContact);
                btnCallTeacher = v.findViewById(R.id.btnCallTeacher);
            }
        }
    }

    // 5. Defaulters Adapter
    private static class DefaultersAdapter extends RecyclerView.Adapter<DefaultersAdapter.ViewHolder> {
        private final List<JsonObject> items;
        private final OnCallListener callListener;

        interface OnCallListener { void onCall(String phone); }

        DefaultersAdapter(List<JsonObject> items, OnCallListener callListener) {
            this.items = items;
            this.callListener = callListener;
        }

        @NonNull @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_admin_defaulter, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            JsonObject item = items.get(position);
            holder.tvDefaulterName.setText(item.has("name") ? item.get("name").getAsString() : "");
            holder.tvDefaulterClass.setText("(" + (item.has("class_label") ? item.get("class_label").getAsString() : "") + ")");

            String father = item.has("father_name") ? item.get("father_name").getAsString() : "Guardian";
            String phone = item.has("father_phone") && !item.get("father_phone").isJsonNull() ? item.get("father_phone").getAsString() : "";
            holder.tvDefaulterFather.setText("Father: " + father + (phone.isEmpty() ? "" : " (" + phone + ")"));

            holder.tvDefaulterDueDate.setText("Due Date: " + (item.has("due_date") ? item.get("due_date").getAsString() : "Immediate"));
            int amt = item.has("pending_amount") ? item.get("pending_amount").getAsInt() : 0;
            holder.tvDefaulterAmount.setText("₹" + amt);

            holder.btnCallDefaulter.setOnClickListener(v -> callListener.onCall(phone));
        }

        @Override public int getItemCount() { return items.size(); }

        static class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvDefaulterName, tvDefaulterClass, tvDefaulterFather, tvDefaulterDueDate, tvDefaulterAmount;
            MaterialButton btnCallDefaulter;
            ViewHolder(View v) {
                super(v);
                tvDefaulterName = v.findViewById(R.id.tvDefaulterName);
                tvDefaulterClass = v.findViewById(R.id.tvDefaulterClass);
                tvDefaulterFather = v.findViewById(R.id.tvDefaulterFather);
                tvDefaulterDueDate = v.findViewById(R.id.tvDefaulterDueDate);
                tvDefaulterAmount = v.findViewById(R.id.tvDefaulterAmount);
                btnCallDefaulter = v.findViewById(R.id.btnCallDefaulter);
            }
        }
    }
}
