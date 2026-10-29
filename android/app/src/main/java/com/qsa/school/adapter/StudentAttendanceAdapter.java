package com.qsa.school.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;
import com.qsa.school.R;
import com.qsa.school.model.AttendanceRecord;
import java.util.List;

public class StudentAttendanceAdapter extends RecyclerView.Adapter<StudentAttendanceAdapter.ViewHolder> {

    private final List<AttendanceRecord> items;

    public StudentAttendanceAdapter(List<AttendanceRecord> items) {
        this.items = items;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_student_attendance, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        AttendanceRecord item = items.get(position);
        holder.tvDate.setText(item.attendance_date != null ? item.attendance_date : "-");

        String status = item.status != null ? item.status : "Present";
        holder.tvStatusBadge.setText(status);

        if ("Present".equalsIgnoreCase(status)) {
            holder.tvStatusBadge.setTextColor(ContextCompat.getColor(holder.itemView.getContext(), R.color.accent_green));
            holder.tvStatusBadge.setBackgroundColor(ContextCompat.getColor(holder.itemView.getContext(), R.color.accent_green_soft));
        } else if ("Absent".equalsIgnoreCase(status)) {
            holder.tvStatusBadge.setTextColor(ContextCompat.getColor(holder.itemView.getContext(), R.color.accent_red));
            holder.tvStatusBadge.setBackgroundColor(ContextCompat.getColor(holder.itemView.getContext(), R.color.accent_red_soft));
        } else {
            holder.tvStatusBadge.setTextColor(ContextCompat.getColor(holder.itemView.getContext(), R.color.accent_gold_dark));
            holder.tvStatusBadge.setBackgroundColor(ContextCompat.getColor(holder.itemView.getContext(), R.color.accent_gold_soft));
        }

        // School Session
        String morningIn = item.morning_in != null ? item.morning_in.substring(0, Math.min(5, item.morning_in.length())) : null;
        String morningOut = item.morning_out != null ? item.morning_out.substring(0, Math.min(5, item.morning_out.length())) : null;
        if (morningIn != null) {
            holder.tvSchoolTimes.setText("IN: " + morningIn + " | OUT: " + (morningOut != null ? morningOut : "--:--"));
        } else {
            holder.tvSchoolTimes.setText("-- : --");
        }

        // Tuition Session
        String tuitionIn = item.tuition_in != null ? item.tuition_in.substring(0, Math.min(5, item.tuition_in.length())) : null;
        String tuitionOut = item.tuition_out != null ? item.tuition_out.substring(0, Math.min(5, item.tuition_out.length())) : null;
        if (tuitionIn != null) {
            holder.tvTuitionTimes.setText("IN: " + tuitionIn + " | OUT: " + (tuitionOut != null ? tuitionOut : "--:--"));
        } else {
            holder.tvTuitionTimes.setText("-- : --");
        }

        holder.tvRemarks.setText(item.remarks != null && !item.remarks.isEmpty() ? item.remarks : "Biometric Punch Log");
    }

    @Override
    public int getItemCount() {
        return items != null ? items.size() : 0;
    }

    static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvDate, tvStatusBadge, tvSchoolTimes, tvTuitionTimes, tvRemarks;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvDate = itemView.findViewById(R.id.tvDate);
            tvStatusBadge = itemView.findViewById(R.id.tvStatusBadge);
            tvSchoolTimes = itemView.findViewById(R.id.tvSchoolTimes);
            tvTuitionTimes = itemView.findViewById(R.id.tvTuitionTimes);
            tvRemarks = itemView.findViewById(R.id.tvRemarks);
        }
    }
}
