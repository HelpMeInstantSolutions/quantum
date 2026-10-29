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
import com.qsa.school.model.ExamResultItem;

import java.util.List;

public class ExamResultAdapter extends RecyclerView.Adapter<ExamResultAdapter.ViewHolder> {

    private final List<ExamResultItem> list;

    public ExamResultAdapter(List<ExamResultItem> list) {
        this.list = list;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_result, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        ExamResultItem item = list.get(position);
        holder.tvExamName.setText(item.exam_name != null ? item.exam_name : "Term Examination");
        holder.tvSubject.setText(item.subject_name != null ? item.subject_name : "Subject");

        GradientDrawable gradeBadge = new GradientDrawable();
        gradeBadge.setCornerRadius(18f);

        if (item.is_absent) {
            holder.tvMarks.setText("ABSENT");
            holder.tvMarks.setTextColor(Color.parseColor("#EF4444"));
            holder.tvGrade.setText("AB");
            holder.tvGrade.setTextColor(Color.parseColor("#DC2626"));
            gradeBadge.setColor(Color.parseColor("#FEF2F2"));
        } else {
            String marks = String.valueOf(item.marks_obtained);
            if (marks.endsWith(".0") || marks.endsWith(".00")) {
                marks = String.valueOf((int) item.marks_obtained);
            }
            String max = String.valueOf(item.max_marks);
            if (max.endsWith(".0") || max.endsWith(".00")) {
                max = String.valueOf((int) item.max_marks);
            }
            holder.tvMarks.setText(marks + " / " + max);
            holder.tvMarks.setTextColor(Color.parseColor("#2563EB"));

            String grade = item.grade != null ? item.grade : "P";
            holder.tvGrade.setText("Grade: " + grade);
            if (grade.startsWith("A")) {
                gradeBadge.setColor(Color.parseColor("#ECFDF5"));
                holder.tvGrade.setTextColor(Color.parseColor("#15803D"));
            } else if (grade.startsWith("B")) {
                gradeBadge.setColor(Color.parseColor("#EFF6FF"));
                holder.tvGrade.setTextColor(Color.parseColor("#1D4ED8"));
            } else {
                gradeBadge.setColor(Color.parseColor("#FFFBEB"));
                holder.tvGrade.setTextColor(Color.parseColor("#B45309"));
            }
        }
        holder.tvGrade.setBackground(gradeBadge);
    }

    @Override
    public int getItemCount() {
        return list.size();
    }

    public static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvExamName, tvSubject, tvMarks, tvGrade;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvExamName = itemView.findViewById(R.id.tvResExamName);
            tvSubject = itemView.findViewById(R.id.tvResSubject);
            tvMarks = itemView.findViewById(R.id.tvResMarks);
            tvGrade = itemView.findViewById(R.id.tvResGrade);
        }
    }
}
