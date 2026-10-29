package com.qsa.school.model;

public class NotificationItem {
    public int id;
    public String title;
    public String message;
    public String category; // 'attendance_alert', 'holiday', 'homework', 'fee_reminder', 'exam', 'general'
    public String created_at;
    public boolean is_pinned;
}
