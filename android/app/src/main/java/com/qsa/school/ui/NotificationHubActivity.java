package com.qsa.school.ui;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.chip.ChipGroup;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.qsa.school.R;
import com.qsa.school.adapter.NotificationAdapter;
import com.qsa.school.model.NotificationItem;
import com.qsa.school.network.ApiClient;
import com.qsa.school.network.GsonHelper;
import com.qsa.school.network.SessionManager;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Response;

public class NotificationHubActivity extends AppCompatActivity {

    private RecyclerView rvAllNotifications;
    private SwipeRefreshLayout swipeRefreshNotifs;
    private LinearLayout llEmptyNotifs;
    private ChipGroup chipGroupCategory;
    private SessionManager session;
    private final Gson gson = GsonHelper.getGson();

    private final List<NotificationItem> allList = new ArrayList<>();
    private final List<NotificationItem> filteredList = new ArrayList<>();
    private NotificationAdapter adapter;
    private String selectedCategory = "ALL";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_notification_hub);

        session = new SessionManager(this);

        Toolbar toolbar = findViewById(R.id.toolbarNotif);
        toolbar.setNavigationOnClickListener(v -> finish());

        rvAllNotifications = findViewById(R.id.rvAllNotifications);
        swipeRefreshNotifs = findViewById(R.id.swipeRefreshNotifs);
        llEmptyNotifs = findViewById(R.id.llEmptyNotifs);
        chipGroupCategory = findViewById(R.id.chipGroupCategory);

        rvAllNotifications.setLayoutManager(new LinearLayoutManager(this));
        adapter = new NotificationAdapter(filteredList);
        rvAllNotifications.setAdapter(adapter);

        swipeRefreshNotifs.setOnRefreshListener(this::fetchNotifications);

        setupFilterChips();
        fetchNotifications();
    }

    private void setupFilterChips() {
        chipGroupCategory.setOnCheckedChangeListener((group, checkedId) -> {
            if (checkedId == R.id.chipCatHoliday) {
                selectedCategory = "holiday";
            } else if (checkedId == R.id.chipCatFees) {
                selectedCategory = "fee_reminder";
            } else if (checkedId == R.id.chipCatAttendance) {
                selectedCategory = "attendance_alert";
            } else if (checkedId == R.id.chipCatHomework) {
                selectedCategory = "homework";
            } else {
                selectedCategory = "ALL";
            }
            applyFilter();
        });
    }

    private void applyFilter() {
        filteredList.clear();
        for (NotificationItem item : allList) {
            if ("ALL".equalsIgnoreCase(selectedCategory)) {
                filteredList.add(item);
            } else if (item.category != null && item.category.equalsIgnoreCase(selectedCategory)) {
                filteredList.add(item);
            }
        }
        adapter.notifyDataSetChanged();
        llEmptyNotifs.setVisibility(filteredList.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void fetchNotifications() {
        swipeRefreshNotifs.setRefreshing(true);
        String token = session.getToken();

        ApiClient.getInstance(this).get("/api/notifications", token, new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                runOnUiThread(() -> {
                    swipeRefreshNotifs.setRefreshing(false);
                    Toast.makeText(NotificationHubActivity.this, "Failed to load notifications: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    try {
                        String body = response.body().string();
                        JsonObject json = gson.fromJson(body, JsonObject.class);
                        if (json.has("notifications")) {
                            JsonArray arr = json.getAsJsonArray("notifications");
                            allList.clear();
                            for (JsonElement el : arr) {
                                allList.add(gson.fromJson(el, NotificationItem.class));
                            }
                            runOnUiThread(() -> {
                                swipeRefreshNotifs.setRefreshing(false);
                                applyFilter();
                            });
                        } else {
                            runOnUiThread(() -> swipeRefreshNotifs.setRefreshing(false));
                        }
                    } catch (Exception e) {
                        Log.e("NotificationHub", "Error parsing notifications", e);
                        runOnUiThread(() -> swipeRefreshNotifs.setRefreshing(false));
                    }
                } else {
                    runOnUiThread(() -> swipeRefreshNotifs.setRefreshing(false));
                }
            }
        });
    }
}
