package com.qsa.school.adapter;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.qsa.school.R;
import com.qsa.school.model.NotificationItem;

import java.util.List;

public class NotificationAdapter extends RecyclerView.Adapter<NotificationAdapter.ViewHolder> {

    private final List<NotificationItem> list;

    public NotificationAdapter(List<NotificationItem> list) {
        this.list = list;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_notification, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        NotificationItem item = list.get(position);
        holder.tvTitle.setText(item.title);
        holder.tvMessage.setText(item.message);
        holder.tvCategory.setText(item.category != null ? item.category.replace("_", " ").toUpperCase() : "ALERT");
        holder.tvDate.setText(item.created_at != null && item.created_at.length() >= 10 ? item.created_at.substring(0, 10) : "");

        // Modern Category Pill Styling with soft pastel background + vibrant text
        GradientDrawable badge = new GradientDrawable();
        badge.setCornerRadius(18f);

        if ("holiday".equalsIgnoreCase(item.category)) {
            badge.setColor(Color.parseColor("#FEF2F2"));
            holder.tvCategory.setTextColor(Color.parseColor("#EF4444"));
            holder.tvCategory.setText("🏖️ HOLIDAY");
        } else if ("attendance_alert".equalsIgnoreCase(item.category)) {
            badge.setColor(Color.parseColor("#FFFBEB"));
            holder.tvCategory.setTextColor(Color.parseColor("#D97706"));
            holder.tvCategory.setText("📅 ATTENDANCE");
        } else if ("fee_reminder".equalsIgnoreCase(item.category)) {
            badge.setColor(Color.parseColor("#FEF2F2"));
            holder.tvCategory.setTextColor(Color.parseColor("#DC2626"));
            holder.tvCategory.setText("💳 FEE NOTICE");
        } else if ("homework".equalsIgnoreCase(item.category)) {
            badge.setColor(Color.parseColor("#EFF6FF"));
            holder.tvCategory.setTextColor(Color.parseColor("#2563EB"));
            holder.tvCategory.setText("📚 HOMEWORK");
        } else {
            badge.setColor(Color.parseColor("#F1F5F9"));
            holder.tvCategory.setTextColor(Color.parseColor("#0F172A"));
            holder.tvCategory.setText("📢 CIRCULAR");
        }
        holder.tvCategory.setBackground(badge);
    }

    @Override
    public int getItemCount() {
        return list.size();
    }

    public static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvTitle, tvMessage, tvCategory, tvDate;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvTitle = itemView.findViewById(R.id.tvNotifTitle);
            tvMessage = itemView.findViewById(R.id.tvNotifMessage);
            tvCategory = itemView.findViewById(R.id.tvNotifCategory);
            tvDate = itemView.findViewById(R.id.tvNotifDate);
        }
    }
}
