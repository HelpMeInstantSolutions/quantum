package com.qsa.school.network;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

public class SessionManager {

    private static final String PREF_NAME = "school_session_pref";
    private static final String KEY_TOKEN = "jwt_token";
    private static final String KEY_USER_JSON = "user_json";
    private static final String KEY_ROLE = "user_role";
    private static final String KEY_IS_LOGGED_IN = "is_logged_in";
    private static final String KEY_ACTIVE_STUDENT_ID = "active_student_id";
    private static final String KEY_ACTIVE_STUDENT_JSON = "active_student_json";

    private final SharedPreferences prefs;
    private final SharedPreferences.Editor editor;
    private final Gson gson;

    public SessionManager(Context context) {
        this.prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        this.editor = prefs.edit();
        this.gson = GsonHelper.getGson();
    }

    public void saveLoginSession(String token, JsonObject userObject) {
        editor.putString(KEY_TOKEN, token);
        editor.putString(KEY_USER_JSON, userObject.toString());
        if (userObject.has("role")) {
            editor.putString(KEY_ROLE, userObject.get("role").getAsString());
        }

        // Setup active student if parent or student
        if (userObject.has("students") && userObject.get("students").isJsonArray()) {
            JsonArray arr = userObject.getAsJsonArray("students");
            if (arr.size() > 0) {
                JsonObject firstChild = arr.get(0).getAsJsonObject();
                if (firstChild.has("id")) {
                    editor.putInt(KEY_ACTIVE_STUDENT_ID, firstChild.get("id").getAsInt());
                }
                editor.putString(KEY_ACTIVE_STUDENT_JSON, firstChild.toString());
            }
        } else if (userObject.has("student") && !userObject.get("student").isJsonNull()) {
            JsonObject st = userObject.getAsJsonObject("student");
            if (st.has("id")) {
                editor.putInt(KEY_ACTIVE_STUDENT_ID, st.get("id").getAsInt());
            }
            editor.putString(KEY_ACTIVE_STUDENT_JSON, st.toString());
        }

        editor.putBoolean(KEY_IS_LOGGED_IN, true);
        editor.apply();
    }

    public boolean isLoggedIn() {
        return prefs.getBoolean(KEY_IS_LOGGED_IN, false);
    }

    public String getToken() {
        return prefs.getString(KEY_TOKEN, null);
    }

    public String getRole() {
        return prefs.getString(KEY_ROLE, "student");
    }

    public JsonObject getUser() {
        String json = prefs.getString(KEY_USER_JSON, null);
        if (json == null) return null;
        try {
            return gson.fromJson(json, JsonObject.class);
        } catch (Exception e) {
            return null;
        }
    }

    public int getActiveStudentId() {
        return prefs.getInt(KEY_ACTIVE_STUDENT_ID, 0);
    }

    public JsonObject getActiveStudent() {
        String json = prefs.getString(KEY_ACTIVE_STUDENT_JSON, null);
        if (json != null) {
            try {
                return gson.fromJson(json, JsonObject.class);
            } catch (Exception ignored) {}
        }
        JsonObject user = getUser();
        if (user != null && user.has("student") && !user.get("student").isJsonNull()) {
            return user.getAsJsonObject("student");
        }
        return null;
    }

    public void setActiveStudent(JsonObject student) {
        if (student == null) return;
        if (student.has("id")) {
            editor.putInt(KEY_ACTIVE_STUDENT_ID, student.get("id").getAsInt());
        }
        editor.putString(KEY_ACTIVE_STUDENT_JSON, student.toString());
        editor.apply();
    }

    public JsonArray getChildren() {
        JsonObject user = getUser();
        if (user != null && user.has("students") && user.get("students").isJsonArray()) {
            return user.getAsJsonArray("students");
        }
        return new JsonArray();
    }

    public boolean isMultiChild() {
        JsonArray children = getChildren();
        if (children.size() > 1) return true;
        JsonObject user = getUser();
        if (user != null && user.has("is_multi_child") && !user.get("is_multi_child").isJsonNull()) {
            return user.get("is_multi_child").getAsBoolean();
        }
        return false;
    }

    public boolean isClassTeacher() {
        JsonObject user = getUser();
        if (user != null && user.has("permissions")) {
            JsonObject perms = user.getAsJsonObject("permissions");
            if (perms.has("is_class_teacher")) {
                return perms.get("is_class_teacher").getAsBoolean();
            }
        }
        return false;
    }

    public void logout() {
        editor.clear();
        editor.apply();
    }
}
