package com.qsa.school.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.qsa.school.R;
import com.qsa.school.model.HomeworkItem;

import java.util.List;

public class HomeworkAdapter extends RecyclerView.Adapter<HomeworkAdapter.ViewHolder> {

    private final List<HomeworkItem> list;

    public HomeworkAdapter(List<HomeworkItem> list) {
        this.list = list;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_homework, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        HomeworkItem item = list.get(position);
        holder.tvSubject.setText(item.subject_name);
        holder.tvTitle.setText(item.title);
        holder.tvDesc.setText(item.description);
        holder.tvDue.setText("Due: " + (item.due_date != null ? item.due_date : ""));
        holder.tvTeacher.setText("By: " + (item.teacher_name != null ? item.teacher_name : "Teacher"));
    }

    @Override
    public int getItemCount() {
        return list.size();
    }

    public static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvSubject, tvTitle, tvDesc, tvDue, tvTeacher;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvSubject = itemView.findViewById(R.id.tvHwSubject);
            tvTitle = itemView.findViewById(R.id.tvHwTitle);
            tvDesc = itemView.findViewById(R.id.tvHwDesc);
            tvDue = itemView.findViewById(R.id.tvHwDue);
            tvTeacher = itemView.findViewById(R.id.tvHwTeacher);
        }
    }
}
