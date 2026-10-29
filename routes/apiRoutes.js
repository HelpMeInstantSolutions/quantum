const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { requireApiAuth, requireRole } = require('../middleware/authMiddleware');
const { getAvatar } = require('../utils/avatarHelper');
const upload = require('../middleware/uploadMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'star_academy_jwt_super_key_mobile_2026';

// Helper to resolve active student for single-parent multiple-student requests
async function resolveActiveStudent(req) {
    const requestedId = req.query.student_id || req.headers['x-student-id'] || (req.body && req.body.student_id);

    // 1. From token extra data
    const students = req.user?.extra?.students || (req.user?.extra?.student ? [req.user.extra.student] : []);

    if (requestedId) {
        const match = students.find(s => String(s.id) === String(requestedId));
        if (match) return match;

        // 2. From database query
        const [dbRows] = await pool.query(
            `SELECT s.*, c.class_name, sec.section_name 
             FROM students s 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             WHERE s.id = ? AND (
                 s.user_id = ? 
                 OR s.father_phone = ? 
                 OR s.mother_phone = ? 
                 OR s.father_phone = (SELECT phone FROM users WHERE id = ?)
                 OR s.mother_phone = (SELECT phone FROM users WHERE id = ?)
                 OR s.father_phone IN (SELECT father_phone FROM students WHERE user_id = ? AND father_phone IS NOT NULL AND father_phone != '')
             )`,
            [requestedId, req.user.id, req.user.username, req.user.username, req.user.id, req.user.id, req.user.id]
        );
        if (dbRows.length > 0) {
            const st = dbRows[0];
            return {
                id: st.id,
                admission_no: st.admission_no,
                roll_no: st.roll_no,
                srn_no: st.srn_no || null,
                pen_no: st.pen_no || null,
                aadhar_no: st.aadhar_no || null,
                family_id: st.family_id || null,
                name: `${st.first_name} ${st.last_name || ''}`.trim(),
                gender: st.gender,
                class_name: st.class_name,
                section_name: st.section_name,
                class_id: st.class_id,
                section_id: st.section_id,
                photo_url: getAvatar(st.photo_url, st.gender, 'student')
            };
        }
    }

    return students[0] || req.user?.extra?.student || null;
}

// 1. Mobile App Login (Admin, Teacher, Student, Parent)
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Please provide both username and password.' });
        }

        const term = username.trim();
        const cleanPhone = term.replace(/[^0-9]/g, '');

        let [rows] = await pool.query(
            `SELECT * FROM users 
             WHERE (username = ? OR phone = ? OR email = ? OR (REPLACE(REPLACE(phone, '+91-', ''), ' ', '') = ? AND ? != '')) 
               AND status = 1 
             LIMIT 1`,
            [term, term, term, cleanPhone, cleanPhone]
        );

        let user = null;
        if (rows.length === 0) {
            // Also allow student login via Admission No (e.g. STA-2026-002)
            const [stRows] = await pool.query(
                `SELECT u.* FROM students s 
                 JOIN users u ON s.user_id = u.id 
                 WHERE (s.admission_no = ? OR s.admission_no = ?) AND u.status = 1 
                 LIMIT 1`,
                [term, term.toUpperCase()]
            );
            if (stRows.length > 0) {
                user = stRows[0];
            } else {
                return res.status(401).json({ success: false, message: 'Invalid credentials or inactive account.' });
            }
        } else {
            user = rows[0];
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
        }

        let extraData = {};
        let permissions = {
            can_mark_attendance: false,
            can_post_homework: false,
            can_enter_marks: false,
            is_class_teacher: false,
            is_admin: user.role === 'admin'
        };

        if (user.role === 'teacher') {
            const [tRows] = await pool.query(
                `SELECT t.*, c.class_name as ct_class_name, sec.section_name as ct_sec_name 
                 FROM teachers t 
                 LEFT JOIN classes c ON t.assigned_class_id = c.id 
                 LEFT JOIN sections sec ON t.assigned_section_id = sec.id 
                 WHERE t.user_id = ?`,
                [user.id]
            );

            if (tRows.length > 0) {
                const teacher = tRows[0];
                extraData.teacher_id = teacher.id;
                extraData.employee_code = teacher.employee_code;
                extraData.designation = teacher.designation;
                extraData.assigned_class_id = teacher.assigned_class_id;
                extraData.assigned_section_id = teacher.assigned_section_id;
                extraData.class_teacher_of = teacher.assigned_class_id ? `${teacher.ct_class_name}-${teacher.ct_sec_name}` : null;

                // Permissions
                permissions.is_class_teacher = !!teacher.assigned_class_id;
                permissions.can_mark_attendance = !!teacher.assigned_class_id;
                permissions.can_post_homework = true;
                permissions.can_enter_marks = true;

                // Assigned subjects
                const [subs] = await pool.query(
                    `SELECT ts.id, ts.class_id, ts.section_id, ts.subject_id, 
                            s.subject_name, s.subject_code, c.class_name, sec.section_name 
                     FROM teacher_subjects ts 
                     JOIN subjects s ON ts.subject_id = s.id 
                     JOIN classes c ON ts.class_id = c.id 
                     JOIN sections sec ON ts.section_id = sec.id 
                     WHERE ts.teacher_id = ?`,
                    [teacher.id]
                );
                extraData.assigned_subjects = subs;
            }
        } else if (user.role === 'student' || user.role === 'parent') {
            const [sRows] = await pool.query(
                `SELECT s.*, c.class_name, sec.section_name, tr.route_name, tr.vehicle_number, tr.driver_name, tr.driver_phone 
                 FROM students s 
                 JOIN classes c ON s.class_id = c.id 
                 JOIN sections sec ON s.section_id = sec.id 
                 LEFT JOIN transport_routes tr ON s.transport_route_id = tr.id 
                 WHERE s.user_id = ? 
                    OR s.father_phone = ? 
                    OR s.mother_phone = ?
                    OR (s.father_phone IS NOT NULL AND s.father_phone != '' AND s.father_phone = (SELECT phone FROM users WHERE id = ?))
                    OR (s.mother_phone IS NOT NULL AND s.mother_phone != '' AND s.mother_phone = (SELECT phone FROM users WHERE id = ?))
                    OR (s.father_phone IS NOT NULL AND s.father_phone != '' AND s.father_phone IN (SELECT father_phone FROM students WHERE user_id = ? AND father_phone IS NOT NULL AND father_phone != ''))
                    OR s.father_phone = ?
                    OR s.mother_phone = ?
                 ORDER BY s.id ASC`,
                [user.id, user.phone, user.phone, user.id, user.id, user.id, user.username, user.username]
            );

            if (sRows.length > 0) {
                const studentsList = sRows.map(st => ({
                    id: st.id,
                    admission_no: st.admission_no,
                    roll_no: st.roll_no,
                    srn_no: st.srn_no || null,
                    pen_no: st.pen_no || null,
                    aadhar_no: st.aadhar_no || null,
                    family_id: st.family_id || null,
                    name: `${st.first_name} ${st.last_name || ''}`.trim(),
                    first_name: st.first_name,
                    last_name: st.last_name || '',
                    gender: st.gender || 'Male',
                    class_name: st.class_name,
                    section_name: st.section_name,
                    class_id: st.class_id,
                    section_id: st.section_id,
                    father_name: st.father_name,
                    father_phone: st.father_phone,
                    photo_url: getAvatar(st.photo_url, st.gender, 'student'),
                    transport: st.route_name ? {
                        route: st.route_name,
                        vehicle: st.vehicle_number,
                        driver: st.driver_name,
                        phone: st.driver_phone
                    } : null
                }));

                extraData.students = studentsList;
                extraData.student = studentsList[0];
                extraData.is_multi_child = studentsList.length > 1;
                extraData.children_count = studentsList.length;
            }
        } else if (user.role === 'admin') {
            permissions.can_mark_attendance = true;
            permissions.can_post_homework = true;
            permissions.can_enter_marks = true;
            permissions.is_admin = true;
        }

        // Token payload
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
                name: user.name,
                permissions,
                extra: extraData
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            message: `Welcome back, ${user.name}!`,
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                role: user.role,
                avatar_url: getAvatar(user.avatar_url, user.gender, user.role),
                permissions,
                ...extraData
            }
        });

    } catch (err) {
        console.error('API login error:', err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// 2. Profile Details
router.get('/profile', requireApiAuth, async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT id, name, username, email, phone, role, avatar_url FROM users WHERE id = ?`, [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user: rows[0], permissions: req.user.permissions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2b. Children List for Single Parent with Multiple Students
router.get('/parent/children', requireApiAuth, async (req, res) => {
    try {
        const [sRows] = await pool.query(
            `SELECT s.*, c.class_name, sec.section_name, tr.route_name, tr.vehicle_number 
             FROM students s 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             LEFT JOIN transport_routes tr ON s.transport_route_id = tr.id 
             WHERE s.user_id = ? 
                OR s.father_phone = ? 
                OR s.mother_phone = ?
                OR (s.father_phone IS NOT NULL AND s.father_phone != '' AND s.father_phone = (SELECT phone FROM users WHERE id = ?))
                OR (s.mother_phone IS NOT NULL AND s.mother_phone != '' AND s.mother_phone = (SELECT phone FROM users WHERE id = ?))
                OR (s.father_phone IS NOT NULL AND s.father_phone != '' AND s.father_phone IN (SELECT father_phone FROM students WHERE user_id = ? AND father_phone IS NOT NULL AND father_phone != ''))
                OR s.father_phone = ?
                OR s.mother_phone = ?
             ORDER BY s.id ASC`,
            [req.user.id, req.user.phone || '', req.user.phone || '', req.user.id, req.user.id, req.user.id, req.user.username, req.user.username]
        );

        const children = sRows.map(st => ({
            id: st.id,
            admission_no: st.admission_no,
            roll_no: st.roll_no,
            srn_no: st.srn_no || null,
            pen_no: st.pen_no || null,
            aadhar_no: st.aadhar_no || null,
            family_id: st.family_id || null,
            name: `${st.first_name} ${st.last_name || ''}`.trim(),
            first_name: st.first_name,
            last_name: st.last_name || '',
            gender: st.gender || 'Male',
            class_name: st.class_name,
            section_name: st.section_name,
            class_id: st.class_id,
            section_id: st.section_id,
            photo_url: getAvatar(st.photo_url, st.gender, 'student'),
            transport: st.route_name ? `${st.route_name} (${st.vehicle_number})` : null
        }));

        res.json({
            success: true,
            children_count: children.length,
            is_multi_child: children.length > 1,
            children
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Attendance API (Student view & Class Teacher view)
router.get('/attendance', requireApiAuth, async (req, res) => {
    try {
        const role = req.user.role;

        if (role === 'student' || role === 'parent') {
            // Get active student attendance (supports multi-child switching via ?student_id= or header x-student-id)
            const activeStudent = await resolveActiveStudent(req);
            const studentId = activeStudent?.id;
            if (!studentId) return res.status(400).json({ success: false, message: 'No student linked to this profile' });

            const month = req.query.month || new Date().toISOString().slice(0, 7);

            const [records] = await pool.query(
                `SELECT DATE_FORMAT(attendance_date, '%Y-%m-%d') as attendance_date, 
                        status, remarks, 
                        morning_in, morning_out, tuition_in, tuition_out, 
                        morning_status, tuition_status 
                 FROM attendance 
                 WHERE student_id = ? AND DATE_FORMAT(attendance_date, '%Y-%m') = ? 
                 ORDER BY attendance_date DESC`,
                [studentId, month]
            );

            // Summary stats
            let present = 0, absent = 0, late = 0, schoolPresents = 0, tuitionPresents = 0;
            records.forEach(r => {
                const isSchoolPresent = (r.status === 'Present') || (r.morning_status === 'Present') || !!r.morning_in;
                const isTuitionPresent = (r.tuition_status === 'Present') || !!r.tuition_in;
                
                if (r.status === 'Absent' && !isSchoolPresent && !isTuitionPresent) {
                    absent++;
                } else if (r.status === 'Late') {
                    late++;
                } else if (isSchoolPresent || isTuitionPresent || r.status === 'Present') {
                    present++;
                }

                if (isSchoolPresent) schoolPresents++;
                if (isTuitionPresent) tuitionPresents++;
            });
            const total = records.length;
            const percentage = total > 0 ? Math.round(((present + late) / total) * 100) : 100;

            return res.json({
                success: true,
                active_student: activeStudent,
                stats: { present, absent, late, total, percentage, school_presents: schoolPresents, tuition_presents: tuitionPresents },
                month,
                records
            });
        } else if (role === 'teacher' || role === 'admin') {
            // Teacher / Admin: get class attendance list
            const class_id = req.query.class_id || req.user.extra?.assigned_class_id;
            const section_id = req.query.section_id || req.user.extra?.assigned_section_id;
            const date = req.query.date || new Date().toISOString().split('T')[0];

            if (!class_id || !section_id) {
                return res.status(400).json({ success: false, message: 'Class and section required. You may not be assigned as class teacher.' });
            }

            const [students] = await pool.query(
                `SELECT s.id, s.admission_no, s.roll_no, s.biometric_id, s.first_name, s.last_name, s.photo_url,
                        COALESCE(a.status, 'Present') as status, a.remarks,
                        a.morning_in, a.morning_out, a.tuition_in, a.tuition_out,
                        a.morning_status, a.tuition_status
                 FROM students s 
                 LEFT JOIN attendance a ON s.id = a.student_id AND a.attendance_date = ? 
                 WHERE s.class_id = ? AND s.section_id = ? AND s.status = 'active'
                 ORDER BY s.roll_no ASC`,
                [date, class_id, section_id]
            );

            return res.json({
                success: true,
                date,
                class_id,
                section_id,
                students
            });
        }

        res.status(403).json({ success: false, message: 'Invalid role for attendance' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Mark Attendance (Class Teacher / Admin in Mobile App)
router.post('/attendance/mark', requireApiAuth, async (req, res) => {
    try {
        const { class_id, section_id, attendance_date, attendance_list } = req.body;
        // attendance_list: [ { student_id, status: 'Present'|'Absent'|'Late', remarks } ]

        if (!req.user.permissions?.can_mark_attendance && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Permission Denied: Only assigned Class Teacher or Admin can mark attendance.' });
        }

        if (!Array.isArray(attendance_list) || attendance_list.length === 0) {
            return res.status(400).json({ success: false, message: 'attendance_list array is required' });
        }

        const date = attendance_date || new Date().toISOString().split('T')[0];

        for (const item of attendance_list) {
            await pool.query(
                `INSERT INTO attendance (student_id, class_id, section_id, attendance_date, status, remarks, marked_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE status = VALUES(status), remarks = VALUES(remarks), marked_by_user_id = VALUES(marked_by_user_id)`,
                [item.student_id, class_id, section_id, date, item.status || 'Present', item.remarks || '', req.user.id]
            );

            // If absent, dispatch instant alert notification
            if (item.status === 'Absent') {
                const [st] = await pool.query(`SELECT first_name, last_name, father_name FROM students WHERE id = ?`, [item.student_id]);
                if (st.length > 0) {
                    await pool.query(
                        `INSERT INTO notifications (title, message, category, target_role, student_id, sender_user_id) 
                         VALUES (?, ?, 'attendance_alert', 'parent', ?, ?)`,
                        [
                            `Absent Alert: ${st[0].first_name} is marked Absent`,
                            `Dear Parent (${st[0].father_name}), your ward ${st[0].first_name} is marked ABSENT on ${date}. Please verify with school.`,
                            item.student_id, req.user.id
                        ]
                    );
                }
            }
        }

        res.json({ success: true, message: `Attendance for ${attendance_list.length} students recorded successfully!` });
    } catch (err) {
        console.error('Mark attendance error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Homework API
router.get('/homework', requireApiAuth, async (req, res) => {
    try {
        const role = req.user.role;

        if (role === 'student' || role === 'parent') {
            const activeStudent = await resolveActiveStudent(req);
            const class_id = activeStudent?.class_id;
            const section_id = activeStudent?.section_id;

            if (!class_id) {
                return res.json({ success: true, active_student: activeStudent, homework: [] });
            }

            const [homeworkList] = await pool.query(
                `SELECT h.*, s.subject_name, u.name as teacher_name 
                 FROM homework h 
                 JOIN subjects s ON h.subject_id = s.id 
                 LEFT JOIN teachers t ON h.teacher_id = t.id 
                 LEFT JOIN users u ON t.user_id = u.id 
                 WHERE h.class_id = ? AND (h.section_id = ? OR h.section_id IS NULL) 
                 ORDER BY h.homework_date DESC LIMIT 30`,
                [class_id, section_id]
            );
            return res.json({ success: true, active_student: activeStudent, homework: homeworkList });
        } else if (role === 'teacher' || role === 'admin') {
            const teacherId = req.user.extra?.teacher_id;
            let query = `
                SELECT h.*, s.subject_name, c.class_name, sec.section_name 
                FROM homework h 
                JOIN subjects s ON h.subject_id = s.id 
                JOIN classes c ON h.class_id = c.id 
                JOIN sections sec ON h.section_id = sec.id 
            `;
            const params = [];
            if (role === 'teacher' && teacherId) {
                query += ` WHERE h.teacher_id = ? `;
                params.push(teacherId);
            }
            query += ` ORDER BY h.homework_date DESC LIMIT 30`;

            const [homeworkList] = await pool.query(query, params);
            return res.json({ success: true, homework: homeworkList });
        }

        res.json({ success: true, homework: [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Post Homework (Teacher / Admin)
router.post('/homework/create', requireApiAuth, async (req, res) => {
    try {
        if (!req.user.permissions?.can_post_homework && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to post homework' });
        }

        const { class_id, section_id, subject_id, title, description, due_date } = req.body;
        if (!class_id || !subject_id || !title || !description || !due_date) {
            return res.status(400).json({ success: false, message: 'Missing required homework fields' });
        }

        const teacherId = req.user.extra?.teacher_id || null;
        const today = new Date().toISOString().split('T')[0];

        const [r] = await pool.query(
            `INSERT INTO homework (class_id, section_id, subject_id, teacher_id, title, description, homework_date, due_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [class_id, section_id, subject_id, teacherId, title, description, today, due_date]
        );

        // Auto notice
        const [sub] = await pool.query(`SELECT subject_name FROM subjects WHERE id = ?`, [subject_id]);
        await pool.query(
            `INSERT INTO notifications (title, message, category, target_role, class_id, section_id, sender_user_id) 
             VALUES (?, ?, 'homework', 'student', ?, ?, ?)`,
            [
                `New Homework: ${sub[0]?.subject_name || ''} - ${title}`,
                `Homework due on ${due_date}. Check Homework section in app.`,
                class_id, section_id, req.user.id
            ]
        );

        res.json({ success: true, message: 'Homework posted successfully!', id: r.insertId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Results & Marksheet API
router.get('/results', requireApiAuth, async (req, res) => {
    try {
        const role = req.user.role;

        if (role === 'student' || role === 'parent') {
            const activeStudent = await resolveActiveStudent(req);
            const studentId = activeStudent?.id;
            if (!studentId) return res.status(400).json({ success: false, message: 'No student found' });

            const [results] = await pool.query(
                `SELECT er.*, es.max_marks, es.pass_marks, es.exam_date, sub.subject_name, sub.subject_code,
                        e.exam_name, e.exam_type, e.session_year
                 FROM exam_results er
                 JOIN exam_schedules es ON er.exam_schedule_id = es.id
                 JOIN subjects sub ON es.subject_id = sub.id
                 JOIN exams e ON er.exam_id = e.id
                 WHERE er.student_id = ?
                 ORDER BY e.created_at DESC, es.exam_date ASC`,
                [studentId]
            );

            const formattedResults = results.map(r => ({
                ...r,
                is_absent: Boolean(r.is_absent)
            }));
            return res.json({ success: true, active_student: activeStudent, results: formattedResults });
        } else if (role === 'teacher' || role === 'admin') {
            // Get exams list
            const [exams] = await pool.query(
                `SELECT e.*, c.class_name FROM exams e JOIN classes c ON e.class_id = c.id ORDER BY e.created_at DESC`
            );
            return res.json({ success: true, exams });
        }

        res.json({ success: true, results: [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Submit Marks for Subject (Teacher)
router.post('/results/marks', requireApiAuth, async (req, res) => {
    try {
        if (!req.user.permissions?.can_enter_marks && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Permission Denied to enter marks' });
        }

        const { exam_id, exam_schedule_id, marks_data } = req.body;
        // marks_data: [ { student_id, marks_obtained, is_absent, remarks } ]

        if (!exam_id || !exam_schedule_id || !Array.isArray(marks_data)) {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        const [[sched]] = await pool.query(`SELECT max_marks FROM exam_schedules WHERE id = ?`, [exam_schedule_id]);
        const maxMarks = sched ? sched.max_marks : 100;

        for (const item of marks_data) {
            const score = item.is_absent ? 0 : parseFloat(item.marks_obtained || 0);
            const pct = (score / maxMarks) * 100;
            let grade = 'D';
            if (pct >= 90) grade = 'A+';
            else if (pct >= 80) grade = 'A';
            else if (pct >= 70) grade = 'B+';
            else if (pct >= 60) grade = 'B';
            else if (pct >= 33) grade = 'C';

            await pool.query(
                `INSERT INTO exam_results (exam_id, exam_schedule_id, student_id, marks_obtained, is_absent, grade, remarks, entered_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
                 ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), is_absent = VALUES(is_absent), grade = VALUES(grade), remarks = VALUES(remarks)`,
                [exam_id, exam_schedule_id, item.student_id, score, item.is_absent ? 1 : 0, grade, item.remarks || '', req.user.id]
            );
        }

        res.json({ success: true, message: `Marks submitted successfully for ${marks_data.length} students!` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Fees API (Student / Parent View)
router.get('/fees', requireApiAuth, async (req, res) => {
    try {
        let activeStudent = null;
        let targetId = req.query.student_id || req.headers['x-student-id'];

        if (!targetId && (req.user.role === 'student' || req.user.role === 'parent')) {
            activeStudent = await resolveActiveStudent(req);
            targetId = activeStudent?.id;
        } else if (req.user.role === 'student' || req.user.role === 'parent') {
            activeStudent = await resolveActiveStudent(req);
        }

        if (!targetId && req.user.role !== 'admin') {
            return res.status(400).json({ success: false, message: 'Student ID not associated' });
        }

        // Pending Dues
        const [dues] = await pool.query(
            `SELECT * FROM student_fee_dues WHERE student_id = ? ORDER BY due_date ASC`,
            [targetId]
        );

        // Receipts
        const [receipts] = await pool.query(
            `SELECT * FROM fee_receipts WHERE student_id = ? ORDER BY payment_date DESC`,
            [targetId]
        );

        let totalPending = 0, totalPaid = 0;
        dues.forEach(d => {
            totalPending += Number(d.balance_amount);
            totalPaid += Number(d.paid_amount);
        });

        res.json({
            success: true,
            active_student: activeStudent,
            summary: {
                totalPending,
                totalPaid,
                hasOverdue: totalPending > 0
            },
            dues,
            receipts
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Notifications & Alerts Hub
router.get('/notifications', requireApiAuth, async (req, res) => {
    try {
        const role = req.user.role;
        let classId = null;
        let studentId = null;
        let activeStudent = null;

        if (role === 'student' || role === 'parent') {
            activeStudent = await resolveActiveStudent(req);
            classId = activeStudent?.class_id || null;
            studentId = activeStudent?.id || null;
        } else if (role === 'teacher') {
            classId = req.user.extra?.assigned_class_id || null;
        }

        let query = `
            SELECT * FROM notifications 
            WHERE (target_role = 'all' OR target_role = ? OR (student_id = ? AND student_id IS NOT NULL)) 
        `;
        const params = [role, studentId];

        if (classId) {
            query += ` AND (class_id IS NULL OR class_id = ?) `;
            params.push(classId);
        }
        if (studentId) {
            query += ` AND (student_id IS NULL OR student_id = ?) `;
            params.push(studentId);
        }

        query += ` ORDER BY is_pinned DESC, created_at DESC LIMIT 50`;

        const [notifications] = await pool.query(query, params);
        const formattedNotifications = notifications.map(n => ({
            ...n,
            is_pinned: Boolean(n.is_pinned)
        }));
        res.json({ success: true, active_student: activeStudent, notifications: formattedNotifications });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. Transport Info
router.get('/transport', requireApiAuth, async (req, res) => {
    try {
        let studentId = null;
        let activeStudent = null;

        if (req.user.role === 'student' || req.user.role === 'parent') {
            activeStudent = await resolveActiveStudent(req);
            studentId = activeStudent?.id || null;
        }

        if (!studentId) {
            const [routes] = await pool.query(`SELECT * FROM transport_routes WHERE status = 'active'`);
            return res.json({ success: true, routes });
        }

        const [rows] = await pool.query(
            `SELECT tr.*, ts.stop_name, ts.pickup_time, ts.drop_time 
             FROM students s 
             JOIN transport_routes tr ON s.transport_route_id = tr.id 
             LEFT JOIN transport_stops ts ON s.transport_stop_id = ts.id 
             WHERE s.id = ?`,
            [studentId]
        );

        if (rows.length === 0) {
            return res.json({ success: true, active_student: activeStudent, assigned: false, message: 'No school transport service opted.' });
        }

        res.json({ success: true, active_student: activeStudent, assigned: true, transport: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 9. Comprehensive Mobile Admin Hub Endpoints
router.get('/admin/summary', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const [[{ total_students }]] = await pool.query(`SELECT COUNT(*) as total_students FROM students WHERE status = 'active'`);
        const [[{ total_teachers }]] = await pool.query(`SELECT COUNT(*) as total_teachers FROM teachers`);

        const today = new Date().toISOString().split('T')[0];
        const [att] = await pool.query(`SELECT status, COUNT(*) as count FROM attendance WHERE attendance_date = ? GROUP BY status`, [today]);
        let present = 0, absent = 0, totalAtt = 0;
        att.forEach(a => {
            totalAtt += a.count;
            if (a.status === 'Present') present += a.count;
            if (a.status === 'Absent') absent += a.count;
        });

        const [[{ total_collected }]] = await pool.query(`SELECT COALESCE(SUM(amount_paid), 0) as total_collected FROM fee_receipts`);
        const [[{ total_pending }]] = await pool.query(`SELECT COALESCE(SUM(balance_amount), 0) as total_pending FROM student_fee_dues WHERE status != 'paid'`);

        res.json({
            success: true,
            summary: {
                total_students,
                total_teachers,
                today_attendance: {
                    present,
                    absent,
                    percentage: totalAtt > 0 ? Math.round((present / totalAtt) * 100) : 0
                },
                financials: {
                    total_collected,
                    total_pending
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Dashboard Pulse (Dual Attendance, Financials, Live Punches)
router.get('/admin/dashboard', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const [[{ total_students }]] = await pool.query(`SELECT COUNT(*) as total_students FROM students WHERE status = 'active'`);
        const [[{ total_teachers }]] = await pool.query(`SELECT COUNT(*) as total_teachers FROM teachers`);
        const [[{ total_classes }]] = await pool.query(`SELECT COUNT(*) as total_classes FROM classes`);

        const today = new Date().toISOString().split('T')[0];

        // Today's attendance counts
        const [todayAttRows] = await pool.query(
            `SELECT morning_status, tuition_status, status FROM attendance WHERE attendance_date = ?`,
            [today]
        );

        let schoolPresent = 0, schoolAbsent = 0;
        let tuitionPresent = 0, tuitionAbsent = 0;

        todayAttRows.forEach(row => {
            if (row.morning_status === 'Present' || row.status === 'Present') schoolPresent++;
            else if (row.morning_status === 'Absent' || row.status === 'Absent') schoolAbsent++;

            if (row.tuition_status === 'Present') tuitionPresent++;
            else if (row.tuition_status === 'Absent') tuitionAbsent++;
        });

        const schoolPct = total_students > 0 ? Math.round((schoolPresent / total_students) * 100) : 0;
        const tuitionPct = total_students > 0 ? Math.round((tuitionPresent / total_students) * 100) : 0;

        // Financials
        const [[{ today_collected }]] = await pool.query(
            `SELECT COALESCE(SUM(amount_paid), 0) as today_collected FROM fee_receipts WHERE DATE(receipt_date) = CURDATE()`
        );
        const [[{ month_collected }]] = await pool.query(
            `SELECT COALESCE(SUM(amount_paid), 0) as month_collected FROM fee_receipts WHERE MONTH(receipt_date) = MONTH(CURDATE()) AND YEAR(receipt_date) = YEAR(CURDATE())`
        );
        const [[{ total_pending }]] = await pool.query(
            `SELECT COALESCE(SUM(balance_amount), 0) as total_pending FROM student_fee_dues WHERE status != 'paid'`
        );

        // Biometric Machine Status & Feed
        const [recentPunches] = await pool.query(
            `SELECT id, enroll_id, punch_time, punch_type, matched_user_type, matched_id, matched_name, device_sn
             FROM biometric_punch_logs 
             ORDER BY punch_time DESC LIMIT 10`
        );

        const [[{ today_punches_count }]] = await pool.query(
            `SELECT COUNT(*) as today_punches_count FROM biometric_punch_logs WHERE DATE(punch_time) = CURDATE()`
        );

        const lastPunch = recentPunches[0] || null;
        let isDeviceOnline = false;
        if (lastPunch && lastPunch.punch_time) {
            const diffMinutes = (Date.now() - new Date(lastPunch.punch_time).getTime()) / (1000 * 60);
            isDeviceOnline = diffMinutes <= 60 || Boolean(today_punches_count > 0);
        }

        res.json({
            success: true,
            dashboard: {
                total_students: parseInt(total_students || 0, 10),
                total_teachers: parseInt(total_teachers || 0, 10),
                total_classes: parseInt(total_classes || 0, 10),
                attendance: {
                    school: { present: schoolPresent, absent: Math.max(0, total_students - schoolPresent), percentage: schoolPct },
                    tuition: { present: tuitionPresent, absent: Math.max(0, total_students - tuitionPresent), percentage: tuitionPct }
                },
                financials: {
                    today_collected: parseFloat(today_collected || 0),
                    month_collected: parseFloat(month_collected || 0),
                    total_pending: parseFloat(total_pending || 0)
                },
                biometric: {
                    is_online: isDeviceOnline,
                    today_punches: parseInt(today_punches_count || 0, 10),
                    last_punch_time: lastPunch ? lastPunch.punch_time : null,
                    recent_punches: recentPunches.map(p => ({
                        id: p.id,
                        enroll_id: p.enroll_id,
                        matched_name: p.matched_name || `ID #${p.enroll_id}`,
                        user_type: p.matched_user_type || 'student',
                        punch_type: p.punch_type || 'IN',
                        punch_time_formatted: p.punch_time ? new Date(p.punch_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''
                    }))
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Attendance Detailed Breakdown & Absentees
router.get('/admin/attendance', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const sessionType = req.query.session || 'school'; // 'school' or 'tuition'
        const date = req.query.date || new Date().toISOString().split('T')[0];

        // Class breakdown
        const [classes] = await pool.query(
            `SELECT c.id as class_id, c.class_name, sec.id as section_id, sec.section_name,
                    COUNT(s.id) as total_students,
                    SUM(CASE 
                        WHEN ? = 'tuition' THEN (CASE WHEN a.tuition_status = 'Present' THEN 1 ELSE 0 END)
                        ELSE (CASE WHEN a.morning_status = 'Present' OR a.status = 'Present' THEN 1 ELSE 0 END)
                    END) as present_count
             FROM classes c
             JOIN sections sec ON sec.class_id = c.id
             LEFT JOIN students s ON s.class_id = c.id AND s.section_id = sec.id AND s.status = 'active'
             LEFT JOIN attendance a ON s.id = a.student_id AND a.attendance_date = ?
             GROUP BY c.id, sec.id
             ORDER BY c.numeric_level ASC, sec.section_name ASC`,
            [sessionType, date]
        );

        const classList = classes.map(c => {
            const tot = parseInt(c.total_students || 0, 10);
            const pres = parseInt(c.present_count || 0, 10);
            return {
                class_id: c.class_id,
                class_name: c.class_name,
                section_name: c.section_name,
                total_students: tot,
                present_count: pres,
                absent_count: Math.max(0, tot - pres),
                percentage: tot > 0 ? Math.round((pres / tot) * 100) : 0
            };
        });

        // Absentees List
        const [absentees] = await pool.query(
            `SELECT s.id, s.first_name, s.last_name, s.roll_no, s.admission_no, s.biometric_id,
                    s.father_name, s.father_phone, s.mother_name, s.mother_phone,
                    c.class_name, sec.section_name, s.gender, s.photo_url
             FROM students s
             JOIN classes c ON s.class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             LEFT JOIN attendance a ON s.id = a.student_id AND a.attendance_date = ?
             WHERE s.status = 'active'
               AND (
                   a.id IS NULL 
                   OR ( ? = 'tuition' AND (a.tuition_status IS NULL OR a.tuition_status != 'Present') )
                   OR ( ? = 'school' AND ( (a.morning_status IS NULL OR a.morning_status != 'Present') AND (a.status IS NULL OR a.status != 'Present') ) )
               )
             ORDER BY c.numeric_level ASC, sec.section_name ASC, s.roll_no ASC`,
            [date, sessionType, sessionType]
        );

        res.json({
            success: true,
            session_type: sessionType,
            date,
            classes: classList,
            absentees: absentees.map(s => ({
                id: s.id,
                name: `${s.first_name} ${s.last_name || ''}`.trim(),
                roll_no: s.roll_no || 'N/A',
                admission_no: s.admission_no || 'N/A',
                biometric_id: s.biometric_id || null,
                class_label: `${s.class_name} - Sec ${s.section_name}`,
                father_name: s.father_name || 'Guardian',
                father_phone: s.father_phone || '',
                mother_phone: s.mother_phone || '',
                gender: s.gender || 'Male'
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Directory (Students & Teachers Search)
router.get('/admin/directory', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const query = (req.query.query || '').trim();
        const type = req.query.type || 'students'; // 'students' or 'teachers'
        const classId = req.query.class_id || null;

        if (type === 'teachers') {
            let sql = `
                SELECT t.id, t.employee_code, t.designation, t.qualification,
                       u.id as user_id, u.name, u.phone, u.email, u.gender, u.avatar_url,
                       c.class_name, sec.section_name
                FROM teachers t
                JOIN users u ON t.user_id = u.id
                LEFT JOIN classes c ON t.assigned_class_id = c.id
                LEFT JOIN sections sec ON t.assigned_section_id = sec.id
            `;
            const params = [];
            if (query) {
                sql += ` WHERE (u.name LIKE ? OR u.phone LIKE ? OR t.employee_code LIKE ?)`;
                const qLike = `%${query}%`;
                params.push(qLike, qLike, qLike);
            }
            sql += ` ORDER BY u.name ASC LIMIT 100`;

            const [teachers] = await pool.query(sql, params);
            return res.json({
                success: true,
                type: 'teachers',
                results: teachers.map(t => ({
                    id: t.id,
                    name: t.name,
                    phone: t.phone || '',
                    email: t.email || '',
                    employee_code: t.employee_code || 'N/A',
                    designation: t.designation || 'Teacher',
                    assigned_class: t.class_name ? `${t.class_name} - ${t.section_name}` : 'Not Assigned',
                    gender: t.gender || 'Male'
                }))
            });
        }

        // Students Directory
        let sql = `
            SELECT s.id, s.first_name, s.last_name, s.roll_no, s.admission_no, s.biometric_id,
                   s.father_name, s.father_phone, s.father_occupation, s.mother_name, s.mother_phone,
                   s.current_address, s.gender, s.photo_url, s.status,
                   c.id as class_id, c.class_name, sec.id as section_id, sec.section_name
            FROM students s
            JOIN classes c ON s.class_id = c.id
            JOIN sections sec ON s.section_id = sec.id
            WHERE s.status = 'active'
        `;
        const params = [];

        if (query) {
            sql += ` AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.roll_no LIKE ? OR s.admission_no LIKE ? OR s.biometric_id LIKE ? OR s.father_phone LIKE ?)`;
            const qLike = `%${query}%`;
            params.push(qLike, qLike, qLike, qLike, qLike, qLike);
        }

        if (classId) {
            sql += ` AND s.class_id = ?`;
            params.push(classId);
        }

        sql += ` ORDER BY c.numeric_level ASC, sec.section_name ASC, s.roll_no ASC LIMIT 150`;

        const [students] = await pool.query(sql, params);
        res.json({
            success: true,
            type: 'students',
            results: students.map(s => ({
                id: s.id,
                first_name: s.first_name,
                last_name: s.last_name || '',
                name: `${s.first_name} ${s.last_name || ''}`.trim(),
                roll_no: s.roll_no || '',
                admission_no: s.admission_no || '',
                biometric_id: s.biometric_id || null,
                class_id: s.class_id,
                class_name: s.class_name,
                section_id: s.section_id,
                section_name: s.section_name,
                class_label: `${s.class_name} - ${s.section_name}`,
                father_name: s.father_name || '',
                father_phone: s.father_phone || '',
                mother_name: s.mother_name || '',
                mother_phone: s.mother_phone || '',
                current_address: s.current_address || '',
                gender: s.gender || 'Male'
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin List Classes for Dropdowns & Filter
router.get('/admin/classes', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const [classes] = await pool.query(`
            SELECT c.id, c.class_name, c.numeric_level,
                   (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'active') as student_count
            FROM classes c
            ORDER BY c.numeric_level ASC, c.class_name ASC
        `);
        res.json({ success: true, classes });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Create / Add Student from Mobile App
router.post('/admin/student/create', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            class_id,
            roll_no,
            admission_no,
            father_name,
            father_phone,
            gender,
            biometric_id
        } = req.body;

        if (!first_name || !class_id) {
            return res.status(400).json({ success: false, message: 'First name and Class are required.' });
        }

        // Get default section for class
        const [secRows] = await pool.query(`SELECT id FROM sections WHERE class_id = ? ORDER BY id ASC LIMIT 1`, [class_id]);
        const section_id = secRows.length > 0 ? secRows[0].id : null;

        // Auto generate admission number if not provided
        let admNo = (admission_no && String(admission_no).trim()) || `QSA-${Date.now().toString().slice(-5)}`;
        const [admCheck] = await pool.query(`SELECT id FROM students WHERE admission_no = ?`, [admNo]);
        if (admCheck.length > 0) {
            admNo = `QSA-${Date.now().toString().slice(-6)}`;
        }

        const bioId = (biometric_id && String(biometric_id).trim()) || null;
        if (bioId) {
            const [bioCheck] = await pool.query(`SELECT id, first_name FROM students WHERE biometric_id = ? AND status = 'active'`, [bioId]);
            if (bioCheck.length > 0) {
                return res.status(400).json({ success: false, message: `Biometric ID #${bioId} is already assigned to ${bioCheck[0].first_name}` });
            }
        }

        const [insertRes] = await pool.query(
            `INSERT INTO students (admission_no, first_name, last_name, class_id, section_id, roll_no, father_name, father_phone, gender, biometric_id, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
            [
                admNo,
                first_name.trim(),
                (last_name || '').trim(),
                class_id,
                section_id,
                (roll_no || '').trim(),
                (father_name || '').trim(),
                (father_phone || '').trim(),
                gender || 'Male',
                bioId
            ]
        );

        res.json({
            success: true,
            message: 'Student added successfully!',
            student_id: insertRes.insertId,
            admission_no: admNo
        });
    } catch (err) {
        console.error('API create student error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Edit Student from Mobile App
router.post('/admin/student/:id/edit', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const studentId = req.params.id;
        const {
            first_name,
            last_name,
            class_id,
            roll_no,
            father_name,
            father_phone,
            gender,
            biometric_id,
            status
        } = req.body;

        if (!first_name) {
            return res.status(400).json({ success: false, message: 'First name is required.' });
        }

        const bioId = (biometric_id && String(biometric_id).trim()) || null;
        if (bioId) {
            const [bioCheck] = await pool.query(
                `SELECT id, first_name FROM students WHERE biometric_id = ? AND id != ? AND status = 'active'`,
                [bioId, studentId]
            );
            if (bioCheck.length > 0) {
                return res.status(400).json({ success: false, message: `Biometric ID #${bioId} is already assigned to ${bioCheck[0].first_name}` });
            }
        }

        await pool.query(
            `UPDATE students SET
                first_name = ?,
                last_name = ?,
                class_id = COALESCE(?, class_id),
                roll_no = ?,
                father_name = ?,
                father_phone = ?,
                gender = ?,
                biometric_id = ?,
                status = COALESCE(?, status),
                updated_at = NOW()
             WHERE id = ?`,
            [
                first_name.trim(),
                (last_name || '').trim(),
                class_id || null,
                (roll_no || '').trim(),
                (father_name || '').trim(),
                (father_phone || '').trim(),
                gender || 'Male',
                bioId,
                status || null,
                studentId
            ]
        );

        res.json({ success: true, message: 'Student updated successfully!' });
    } catch (err) {
        console.error('API edit student error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Get Student Documents
router.get('/admin/student/:id/documents', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const studentId = req.params.id;
        const [docs] = await pool.query(
            `SELECT id, student_id, doc_type, doc_title, file_url, file_size, uploaded_at 
             FROM student_documents 
             WHERE student_id = ? 
             ORDER BY uploaded_at DESC`,
            [studentId]
        );
        res.json({ success: true, documents: docs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Upload Student Document (Supports multipart or base64 JSON)
router.post('/admin/student/:id/documents', requireApiAuth, requireRole('admin'), upload.single('document_file'), async (req, res) => {
    try {
        const studentId = req.params.id;
        let { doc_type, doc_title, base64_data, file_name } = req.body;
        doc_type = doc_type || 'other';
        doc_title = (doc_title && String(doc_title).trim()) || doc_type.toUpperCase();

        let file_url = '';
        let file_size = '0 KB';

        if (req.file) {
            file_url = `/uploads/documents/${req.file.filename}`;
            file_size = `${(req.file.size / 1024).toFixed(1)} KB`;
        } else if (base64_data) {
            const ext = file_name ? path.extname(file_name) : '.jpg';
            const uniqueFilename = `doc-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
            const targetDir = path.join(__dirname, '../public/uploads/documents');
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            const filePath = path.join(targetDir, uniqueFilename);
            
            // Clean base64 header if present
            const cleanBase64 = base64_data.replace(/^data:([A-Za-z-+/]+);base64,/, '');
            const buffer = Buffer.from(cleanBase64, 'base64');
            fs.writeFileSync(filePath, buffer);

            file_url = `/uploads/documents/${uniqueFilename}`;
            file_size = `${(buffer.length / 1024).toFixed(1)} KB`;
        } else {
            return res.status(400).json({ success: false, message: 'No file or document data uploaded.' });
        }

        const [insertRes] = await pool.query(
            `INSERT INTO student_documents (student_id, doc_type, doc_title, file_url, file_size, uploaded_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [studentId, doc_type, doc_title, file_url, file_size]
        );

        res.json({
            success: true,
            message: 'Document uploaded successfully!',
            document: {
                id: insertRes.insertId,
                student_id: studentId,
                doc_type,
                doc_title,
                file_url,
                file_size,
                uploaded_at: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('API upload document error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Delete Student Document
router.post('/admin/student/:id/documents/:docId/delete', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const { id, docId } = req.params;
        await pool.query(`DELETE FROM student_documents WHERE id = ? AND student_id = ?`, [docId, id]);
        res.json({ success: true, message: 'Document deleted successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Assign / Update Student Biometric Machine ID from Mobile App
router.post('/admin/student/biometric-id', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const { student_id, biometric_id } = req.body;
        if (!student_id) {
            return res.status(400).json({ success: false, message: 'Student ID is required' });
        }

        const bioId = biometric_id && String(biometric_id).trim() ? String(biometric_id).trim() : null;

        // Check if biometric_id already assigned to another active student
        if (bioId) {
            const [existing] = await pool.query(
                `SELECT id, first_name, last_name FROM students WHERE biometric_id = ? AND id != ? AND status = 'active' LIMIT 1`,
                [bioId, student_id]
            );
            if (existing.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Biometric ID #${bioId} is already assigned to "${existing[0].first_name} ${existing[0].last_name}". Each student must have a unique ID.`
                });
            }
        }

        await pool.query(`UPDATE students SET biometric_id = ? WHERE id = ?`, [bioId, student_id]);
        res.json({
            success: true,
            message: bioId ? `Biometric ID #${bioId} assigned successfully!` : 'Biometric ID removed.'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Broadcast Notice (All, Parents, Teachers, or Specific Class)
router.post('/admin/broadcast-notice', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const { title, message, category, target_role, class_id, is_pinned } = req.body;
        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message required' });
        }

        const role = target_role || 'all'; // 'all', 'parent', 'teacher'
        const cId = class_id ? parseInt(class_id, 10) : null;

        const [r] = await pool.query(
            `INSERT INTO notifications (title, message, category, target_role, class_id, sender_user_id, is_pinned) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [title.trim(), message.trim(), category || 'emergency', role, cId, req.user.id, is_pinned ? 1 : 0]
        );

        // Instant FCM Push Notification Dispatch
        try {
            const { getFirebaseCredentials, sendFCMv1 } = require('../utils/pushNotificationService');
            const creds = getFirebaseCredentials();
            if (creds) {
                let tokenSql = `
                    SELECT DISTINCT udt.device_token 
                    FROM user_device_tokens udt
                    JOIN users u ON udt.user_id = u.id
                `;
                const tokenParams = [];

                if (role === 'teacher') {
                    tokenSql += ` WHERE u.role = 'teacher'`;
                } else if (role === 'parent' || role === 'student') {
                    tokenSql += ` WHERE u.role IN ('parent', 'student')`;
                }

                if (cId) {
                    tokenSql += (tokenSql.includes('WHERE') ? ' AND' : ' WHERE') + `
                        udt.student_id IN (SELECT id FROM students WHERE class_id = ?)
                    `;
                    tokenParams.push(cId);
                }

                const [tokens] = await pool.query(tokenSql, tokenParams);
                for (const row of tokens) {
                    sendFCMv1({
                        creds,
                        token: row.device_token,
                        title: title.trim(),
                        message: message.trim()
                    }).catch(() => {});
                }
            }
        } catch (fcmErr) {
            console.warn('Broadcast push notice error:', fcmErr.message);
        }

        res.json({ success: true, message: 'Notice broadcasted to all mobile apps successfully!', id: r.insertId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Fees & Defaulters
router.get('/admin/fees', requireApiAuth, requireRole('admin'), async (req, res) => {
    try {
        const [[{ today_collected }]] = await pool.query(
            `SELECT COALESCE(SUM(amount_paid), 0) as today_collected FROM fee_receipts WHERE DATE(receipt_date) = CURDATE()`
        );
        const [[{ month_collected }]] = await pool.query(
            `SELECT COALESCE(SUM(amount_paid), 0) as month_collected FROM fee_receipts WHERE MONTH(receipt_date) = MONTH(CURDATE()) AND YEAR(receipt_date) = YEAR(CURDATE())`
        );
        const [[{ total_pending }]] = await pool.query(
            `SELECT COALESCE(SUM(balance_amount), 0) as total_pending FROM student_fee_dues WHERE status != 'paid'`
        );

        // Top Defaulters
        const [defaulters] = await pool.query(
            `SELECT s.id as student_id, s.first_name, s.last_name, s.admission_no, s.roll_no,
                    c.class_name, sec.section_name, s.father_name, s.father_phone, s.gender,
                    SUM(d.balance_amount) as pending_amount,
                    MAX(d.due_date) as last_due_date
             FROM student_fee_dues d
             JOIN students s ON d.student_id = s.id
             JOIN classes c ON s.class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             WHERE d.status != 'paid' AND d.balance_amount > 0 AND s.status = 'active'
             GROUP BY s.id
             ORDER BY pending_amount DESC
             LIMIT 35`
        );

        res.json({
            success: true,
            summary: {
                today_collected: parseFloat(today_collected || 0),
                month_collected: parseFloat(month_collected || 0),
                total_pending: parseFloat(total_pending || 0)
            },
            defaulters: defaulters.map(d => ({
                student_id: d.student_id,
                name: `${d.first_name} ${d.last_name || ''}`.trim(),
                admission_no: d.admission_no || 'N/A',
                class_label: `${d.class_name} - ${d.section_name}`,
                father_name: d.father_name || 'Guardian',
                father_phone: d.father_phone || '',
                pending_amount: parseFloat(d.pending_amount || 0),
                due_date: d.last_due_date ? new Date(d.last_due_date).toLocaleDateString('en-IN') : 'Immediate'
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Register Device Push Token (FCM / OneSignal)
router.post('/save-fcm-token', requireApiAuth, async (req, res) => {
    try {
        const { token, provider, device_type } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Device token required' });

        const activeStudent = await resolveActiveStudent(req).catch(() => null);
        const studentId = req.body.student_id || activeStudent?.id || null;

        await pool.query(
            `INSERT INTO user_device_tokens (user_id, student_id, device_token, provider, device_type) 
             VALUES (?, ?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE student_id = VALUES(student_id), user_id = VALUES(user_id), updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, studentId, token, provider || 'fcm', device_type || 'android']
        );
        console.log(`📱 [PUSH TOKEN SAVED] User #${req.user.id}, Student #${studentId}: ${token.substring(0, 20)}...`);

        res.json({ success: true, message: 'Push notification device token registered successfully' });
    } catch (err) {
        console.error('Error saving push token:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Diagnostic endpoint: Check FCM push configuration & registered tokens
router.get('/debug-push-status', async (req, res) => {
    try {
        const { diagnoseFirebaseSetup, getFirebaseCredentials, getGoogleAccessToken } = require('../utils/pushNotificationService');
        const setup = diagnoseFirebaseSetup();

        // Query all device tokens in DB
        const [tokens] = await pool.query(
            `SELECT udt.id, udt.user_id, udt.student_id, udt.provider, udt.device_type, 
                    LEFT(udt.device_token, 25) as token_prefix, 
                    RIGHT(udt.device_token, 10) as token_suffix, 
                    udt.updated_at,
                    u.name as user_name, u.role as user_role,
                    s.first_name, s.last_name, s.biometric_id
             FROM user_device_tokens udt
             LEFT JOIN users u ON udt.user_id = u.id
             LEFT JOIN students s ON udt.student_id = s.id
             ORDER BY udt.updated_at DESC LIMIT 50`
        );

        // Test OAuth token generation if credentials exist
        let oauthTest = null;
        const creds = getFirebaseCredentials();
        if (creds) {
            try {
                const accessToken = await getGoogleAccessToken(creds);
                oauthTest = { success: true, token_preview: `${accessToken.substring(0, 15)}...` };
            } catch (oe) {
                oauthTest = { success: false, error: oe.message };
            }
        }

        res.json({
            success: true,
            server_time: new Date().toISOString(),
            firebase_setup: setup,
            oauth_test: oauthTest,
            total_device_tokens_in_db: tokens.length,
            device_tokens: tokens
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Test Push Notification Dispatch (For verifying FCM setup)
router.post('/test-push', requireApiAuth, async (req, res) => {
    try {
        const { student_id } = req.body;
        const activeStudent = await resolveActiveStudent(req).catch(() => null);
        const targetStudentId = student_id || activeStudent?.id;
        if (!targetStudentId) {
            return res.status(400).json({ success: false, message: 'Student ID required for test notification' });
        }
        const { sendAttendancePushNotification, diagnoseFirebaseSetup } = require('../utils/pushNotificationService');
        const result = await sendAttendancePushNotification({
            studentId: targetStudentId,
            studentName: req.body.student_name || 'Test Student',
            punchType: req.body.punch_type || 'IN',
            sessionType: req.body.session_type || 'tuition',
            punchTime: new Date()
        });
        const setup = diagnoseFirebaseSetup();
        res.json({ success: true, result, firebase_setup: setup });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
