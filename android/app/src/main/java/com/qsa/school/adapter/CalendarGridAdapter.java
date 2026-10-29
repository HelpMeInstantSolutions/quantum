package com.qsa.school.adapter;

import android.content.Context;
import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;

import com.qsa.school.R;
import com.qsa.school.model.CalendarDay;

import java.util.List;

public class CalendarGridAdapter extends RecyclerView.Adapter<CalendarGridAdapter.DayViewHolder> {

    public interface OnDayClickListener {
        void onDayClick(CalendarDay day);
    }

    private final List<CalendarDay> days;
    private final OnDayClickListener listener;

    public CalendarGridAdapter(List<CalendarDay> days, OnDayClickListener listener) {
        this.days = days;
        this.listener = listener;
    }

    @NonNull
    @Override
    public DayViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_calendar_day, parent, false);
        return new DayViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull DayViewHolder holder, int position) {
        CalendarDay day = days.get(position);
        Context context = holder.itemView.getContext();

        if (day.day == 0) {
            holder.tvDayNumber.setText("");
            holder.dayCircle.setBackground(null);
            holder.dotSchool.setVisibility(View.GONE);
            holder.dotTuition.setVisibility(View.GONE);
            holder.dotAbsent.setVisibility(View.GONE);
            holder.itemView.setOnClickListener(null);
            holder.itemView.setClickable(false);
            return;
        }

        holder.itemView.setClickable(true);
        holder.tvDayNumber.setText(String.valueOf(day.day));

        if (day.isSelected) {
            holder.dayCircle.setBackgroundResource(R.drawable.bg_calendar_day_selected);
            holder.tvDayNumber.setTextColor(Color.WHITE);
        } else if (day.isToday) {
            holder.dayCircle.setBackgroundResource(R.drawable.bg_calendar_day_today);
            holder.tvDayNumber.setTextColor(ContextCompat.getColor(context, R.color.primary_blue));
        } else {
            holder.dayCircle.setBackground(null);
            holder.tvDayNumber.setTextColor(ContextCompat.getColor(context, R.color.text_primary));
        }

        // Indicators
        holder.dotSchool.setVisibility(day.hasSchool ? View.VISIBLE : View.GONE);
        holder.dotTuition.setVisibility(day.hasTuition ? View.VISIBLE : View.GONE);
        holder.dotAbsent.setVisibility(day.isAbsent ? View.VISIBLE : View.GONE);

        holder.itemView.setOnClickListener(v -> {
            if (listener != null) {
                listener.onDayClick(day);
            }
        });
    }

    @Override
    public int getItemCount() {
        return days != null ? days.size() : 0;
    }

    static class DayViewHolder extends RecyclerView.ViewHolder {
        FrameLayout dayCircle;
        TextView tvDayNumber;
        View dotSchool;
        View dotTuition;
        View dotAbsent;

        public DayViewHolder(@NonNull View itemView) {
            super(itemView);
            dayCircle = itemView.findViewById(R.id.dayCircle);
            tvDayNumber = itemView.findViewById(R.id.tvDayNumber);
            dotSchool = itemView.findViewById(R.id.dotSchool);
            dotTuition = itemView.findViewById(R.id.dotTuition);
            dotAbsent = itemView.findViewById(R.id.dotAbsent);
        }
    }
}
