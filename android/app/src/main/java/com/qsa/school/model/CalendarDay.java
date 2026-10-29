package com.qsa.school.model;

public class CalendarDay {
    public int day; // 1-31, or 0 if empty leading/trailing cell
    public String dateStr; // e.g. "2026-10-27"
    public boolean isToday;
    public boolean isSelected;
    public boolean hasSchool;
    public boolean hasTuition;
    public boolean isAbsent;

    public CalendarDay(int day, String dateStr, boolean isToday, boolean isSelected, boolean hasSchool, boolean hasTuition, boolean isAbsent) {
        this.day = day;
        this.dateStr = dateStr;
        this.isToday = isToday;
        this.isSelected = isSelected;
        this.hasSchool = hasSchool;
        this.hasTuition = hasTuition;
        this.isAbsent = isAbsent;
    }
}
