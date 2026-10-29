-- Database Schema for School Management System
-- Database: school_db

CREATE TABLE IF NOT EXISTS `settings` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `setting_key` VARCHAR(100) NOT NULL UNIQUE,
    `setting_value` TEXT,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(150) NOT NULL,
    `username` VARCHAR(80) NOT NULL UNIQUE,
    `email` VARCHAR(120) DEFAULT NULL,
    `phone` VARCHAR(20) DEFAULT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'teacher', 'student', 'parent') NOT NULL DEFAULT 'student',
    `avatar_url` VARCHAR(255) DEFAULT '/images/default_avatar.png',
    `status` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `classes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `class_name` VARCHAR(50) NOT NULL,
    `numeric_level` INT NOT NULL DEFAULT 1,
    `stream` VARCHAR(50) DEFAULT 'General',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sections` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `class_id` INT NOT NULL,
    `section_name` VARCHAR(20) NOT NULL,
    `room_no` VARCHAR(30) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subjects` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `class_id` INT NOT NULL,
    `section_id` INT DEFAULT NULL,
    `subject_name` VARCHAR(100) NOT NULL,
    `subject_code` VARCHAR(30) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `teachers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL UNIQUE,
    `employee_code` VARCHAR(50) DEFAULT NULL UNIQUE,
    `designation` VARCHAR(100) DEFAULT 'Faculty',
    `qualification` VARCHAR(150) DEFAULT 'B.Ed, M.Sc',
    `joining_date` DATE DEFAULT NULL,
    `salary` DECIMAL(10,2) DEFAULT 0.00,
    `assigned_class_id` INT DEFAULT NULL,
    `assigned_section_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`assigned_class_id`) REFERENCES `classes`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`assigned_section_id`) REFERENCES `sections`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `teacher_subjects` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `teacher_id` INT NOT NULL,
    `class_id` INT NOT NULL,
    `section_id` INT NOT NULL,
    `subject_id` INT NOT NULL,
    FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transport_routes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `route_name` VARCHAR(150) NOT NULL,
    `vehicle_number` VARCHAR(50) NOT NULL,
    `vehicle_model` VARCHAR(100) DEFAULT 'Tata Starbus 32 Seater',
    `driver_name` VARCHAR(100) NOT NULL,
    `driver_phone` VARCHAR(25) NOT NULL,
    `monthly_charge` DECIMAL(10,2) DEFAULT 1200.00,
    `status` ENUM('active', 'inactive') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transport_stops` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `route_id` INT NOT NULL,
    `stop_name` VARCHAR(150) NOT NULL,
    `pickup_time` VARCHAR(20) DEFAULT '07:30 AM',
    `drop_time` VARCHAR(20) DEFAULT '02:30 PM',
    `stop_fare` DECIMAL(10,2) DEFAULT 1200.00,
    `stop_order` INT DEFAULT 1,
    FOREIGN KEY (`route_id`) REFERENCES `transport_routes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `students` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT DEFAULT NULL,
    `admission_no` VARCHAR(50) NOT NULL UNIQUE,
    `roll_no` VARCHAR(20) DEFAULT NULL,
    `first_name` VARCHAR(80) NOT NULL,
    `last_name` VARCHAR(80) DEFAULT '',
    `gender` ENUM('Male', 'Female', 'Other') DEFAULT 'Male',
    `dob` DATE DEFAULT NULL,
    `blood_group` VARCHAR(10) DEFAULT 'B+',
    `category` VARCHAR(50) DEFAULT 'General',
    `religion` VARCHAR(50) DEFAULT 'Hindu',
    `aadhar_no` VARCHAR(30) DEFAULT NULL,
    `class_id` INT NOT NULL,
    `section_id` INT NOT NULL,
    `session_year` VARCHAR(20) NOT NULL DEFAULT '2026-2027',
    `father_name` VARCHAR(120) NOT NULL,
    `father_phone` VARCHAR(25) NOT NULL,
    `father_occupation` VARCHAR(100) DEFAULT 'Business',
    `mother_name` VARCHAR(120) DEFAULT '',
    `mother_phone` VARCHAR(25) DEFAULT '',
    `guardian_name` VARCHAR(120) DEFAULT '',
    `guardian_phone` VARCHAR(25) DEFAULT '',
    `current_address` TEXT DEFAULT NULL,
    `permanent_address` TEXT DEFAULT NULL,
    `city` VARCHAR(80) DEFAULT 'Rohtak',
    `pincode` VARCHAR(20) DEFAULT '124001',
    `photo_url` VARCHAR(255) DEFAULT '/images/default_student.png',
    `transport_route_id` INT DEFAULT NULL,
    `transport_stop_id` INT DEFAULT NULL,
    `status` ENUM('active', 'promoted', 'transferred', 'passed_out') DEFAULT 'active',
    `admission_date` DATE DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`transport_route_id`) REFERENCES `transport_routes`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`transport_stop_id`) REFERENCES `transport_stops`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `student_documents` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `student_id` INT NOT NULL,
    `doc_type` VARCHAR(100) NOT NULL,
    `doc_title` VARCHAR(150) NOT NULL,
    `file_url` VARCHAR(255) NOT NULL,
    `file_size` VARCHAR(30) DEFAULT '1.2 MB',
    `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attendance` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `student_id` INT NOT NULL,
    `class_id` INT NOT NULL,
    `section_id` INT NOT NULL,
    `attendance_date` DATE NOT NULL,
    `status` ENUM('Present', 'Absent', 'Late', 'Half Day', 'Holiday', 'Excused') DEFAULT 'Present',
    `remarks` VARCHAR(255) DEFAULT '',
    `marked_by_user_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `unique_student_date` (`student_id`, `attendance_date`),
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `category` ENUM('attendance_alert', 'holiday', 'homework', 'fee_reminder', 'exam', 'general', 'emergency') DEFAULT 'general',
    `target_role` ENUM('all', 'teacher', 'student', 'parent') DEFAULT 'all',
    `class_id` INT DEFAULT NULL,
    `section_id` INT DEFAULT NULL,
    `student_id` INT DEFAULT NULL,
    `sender_user_id` INT DEFAULT NULL,
    `is_pinned` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `homework` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `class_id` INT NOT NULL,
    `section_id` INT NOT NULL,
    `subject_id` INT NOT NULL,
    `teacher_id` INT DEFAULT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `homework_date` DATE NOT NULL,
    `due_date` DATE NOT NULL,
    `attachment_url` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `homework_submissions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `homework_id` INT NOT NULL,
    `student_id` INT NOT NULL,
    `submission_text` TEXT DEFAULT NULL,
    `attachment_url` VARCHAR(255) DEFAULT NULL,
    `status` ENUM('pending', 'submitted', 'evaluated') DEFAULT 'submitted',
    `grade` VARCHAR(10) DEFAULT NULL,
    `teacher_feedback` VARCHAR(255) DEFAULT NULL,
    `submitted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `unique_submission` (`homework_id`, `student_id`),
    FOREIGN KEY (`homework_id`) REFERENCES `homework`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exams` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `exam_name` VARCHAR(150) NOT NULL,
    `exam_type` ENUM('single_test', 'unit_test', 'half_yearly', 'annual', 'term') DEFAULT 'unit_test',
    `session_year` VARCHAR(20) NOT NULL DEFAULT '2026-2027',
    `class_id` INT NOT NULL,
    `start_date` DATE DEFAULT NULL,
    `end_date` DATE DEFAULT NULL,
    `status` ENUM('draft', 'ongoing', 'published') DEFAULT 'published',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exam_schedules` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `exam_id` INT NOT NULL,
    `subject_id` INT NOT NULL,
    `exam_date` DATE NOT NULL,
    `start_time` VARCHAR(20) DEFAULT '09:00 AM',
    `end_time` VARCHAR(20) DEFAULT '12:00 PM',
    `max_marks` DECIMAL(6,2) NOT NULL DEFAULT 100.00,
    `pass_marks` DECIMAL(6,2) NOT NULL DEFAULT 33.00,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exam_results` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `exam_id` INT NOT NULL,
    `exam_schedule_id` INT NOT NULL,
    `student_id` INT NOT NULL,
    `marks_obtained` DECIMAL(6,2) DEFAULT 0.00,
    `is_absent` TINYINT(1) DEFAULT 0,
    `grade` VARCHAR(10) DEFAULT 'A',
    `remarks` VARCHAR(255) DEFAULT '',
    `entered_by_user_id` INT DEFAULT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `unique_student_schedule` (`exam_schedule_id`, `student_id`),
    FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`exam_schedule_id`) REFERENCES `exam_schedules`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fee_types` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `fee_name` VARCHAR(150) NOT NULL,
    `applies_to` ENUM('whole_school', 'class', 'section', 'student') DEFAULT 'whole_school',
    `class_id` INT DEFAULT NULL,
    `section_id` INT DEFAULT NULL,
    `student_id` INT DEFAULT NULL,
    `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `frequency` ENUM('one_time', 'monthly', 'quarterly', 'yearly') DEFAULT 'monthly',
    `session_year` VARCHAR(20) DEFAULT '2026-2027',
    `due_day` INT DEFAULT 10,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `student_fee_dues` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `student_id` INT NOT NULL,
    `fee_type_id` INT DEFAULT NULL,
    `fee_title` VARCHAR(150) NOT NULL,
    `month_year` VARCHAR(50) DEFAULT 'April 2026',
    `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `discount` DECIMAL(10,2) DEFAULT 0.00,
    `fine` DECIMAL(10,2) DEFAULT 0.00,
    `net_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `paid_amount` DECIMAL(10,2) DEFAULT 0.00,
    `balance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `due_date` DATE NOT NULL,
    `status` ENUM('pending', 'partially_paid', 'paid', 'waived') DEFAULT 'pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`fee_type_id`) REFERENCES `fee_types`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fee_receipts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `receipt_no` VARCHAR(60) NOT NULL UNIQUE,
    `student_id` INT NOT NULL,
    `payment_date` DATE NOT NULL,
    `amount_paid` DECIMAL(10,2) NOT NULL,
    `payment_mode` ENUM('Cash', 'UPI / QR', 'Net Banking', 'Cheque', 'Card') DEFAULT 'Cash',
    `transaction_reference` VARCHAR(100) DEFAULT NULL,
    `discount_given` DECIMAL(10,2) DEFAULT 0.00,
    `fine_included` DECIMAL(10,2) DEFAULT 0.00,
    `remarks` VARCHAR(255) DEFAULT '',
    `collected_by_user_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fee_receipt_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `receipt_id` INT NOT NULL,
    `student_fee_due_id` INT NOT NULL,
    `fee_title` VARCHAR(150) NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (`receipt_id`) REFERENCES `fee_receipts`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`student_fee_due_id`) REFERENCES `student_fee_dues`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `class_promotions_log` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `student_id` INT NOT NULL,
    `from_class_id` INT NOT NULL,
    `to_class_id` INT DEFAULT NULL,
    `from_session` VARCHAR(20) NOT NULL,
    `to_session` VARCHAR(20) NOT NULL,
    `action` ENUM('promoted', 'retained', 'graduated') DEFAULT 'promoted',
    `promoted_by_user_id` INT DEFAULT NULL,
    `promoted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`from_class_id`) REFERENCES `classes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inquiries` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `parent_name` VARCHAR(120) NOT NULL,
    `student_name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(120) DEFAULT NULL,
    `phone` VARCHAR(25) NOT NULL,
    `seeking_class` VARCHAR(50) DEFAULT NULL,
    `message` TEXT DEFAULT NULL,
    `status` ENUM('new', 'contacted', 'admitted', 'closed') DEFAULT 'new',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
