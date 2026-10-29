const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// Daily Attendance Page (Default: All Attendance Logs Descending with Pagination)
router.get('/', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);

        const isMarkMode = req.query.mode === 'mark';
        const class_id = req.query.class_id ? parseInt(req.query.class_id) : (isMarkMode && classes.length > 0 ? classes[0].id : null);
        const classSections = class_id ? sections.filter(s => s.class_id === class_id) : [];

        let section_id = req.query.section_id ? parseInt(req.query.section_id) : null;
        if (isMarkMode && (!section_id || !classSections.some(s => s.id === section_id))) {
            section_id = classSections.length > 0 ? classSections[0].id : null;
        }

        const attendance_date = req.query.date || '';

        // 1. If marking mode for a specific class & section
        let students = [];
        if (isMarkMode && class_id && section_id) {
            const markDate = attendance_date || new Date().toISOString().split('T')[0];
            const [rows] = await pool.query(
                `SELECT s.id, s.admission_no, s.roll_no, s.biometric_id, s.first_name, s.last_name, s.father_name, s.father_phone,
                        a.id as attendance_id, a.status as attendance_status, a.remarks,
                        a.morning_in, a.morning_out, a.tuition_in, a.tuition_out, a.morning_status, a.tuition_status
                 FROM students s
                 LEFT JOIN attendance a ON s.id = a.student_id AND a.attendance_date = ?
                 WHERE s.class_id = ? AND s.section_id = ? AND s.status = 'active'
                 ORDER BY s.roll_no ASC, s.first_name ASC`,
                [markDate, class_id, section_id]
            );
            students = rows;
        }

        // 2. All Attendance Logs in Descending Order with Pagination
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, parseInt(req.query.limit, 10) || 25);
        const offset = (page - 1) * limit;
        const search = req.query.search ? req.query.search.trim() : '';

        let whereClause = ' WHERE 1=1 ';
        const whereParams = [];

        if (class_id && !isMarkMode) {
            whereClause += ' AND s.class_id = ? ';
            whereParams.push(class_id);
        }
        if (section_id && !isMarkMode) {
            whereClause += ' AND s.section_id = ? ';
            whereParams.push(section_id);
        }
        if (attendance_date) {
            whereClause += ' AND a.attendance_date = ? ';
            whereParams.push(attendance_date);
        }
        if (search) {
            whereClause += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ? OR s.biometric_id LIKE ?) ';
            const term = `%${search}%`;
            whereParams.push(term, term, term, term);
        }

        // Total count
        const [[{ totalRecords }]] = await pool.query(
            `SELECT COUNT(*) as totalRecords 
             FROM attendance a 
             JOIN students s ON a.student_id = s.id 
             ${whereClause}`,
            whereParams
        );

        const totalPages = Math.ceil(totalRecords / limit) || 1;

        // Fetch logs descending
        const [allAttendanceLogs] = await pool.query(
            `SELECT a.id as attendance_id, DATE_FORMAT(a.attendance_date, '%Y-%m-%d') as attendance_date,
                    a.status as attendance_status, a.remarks,
                    a.morning_in, a.morning_out, a.tuition_in, a.tuition_out, a.morning_status, a.tuition_status,
                    s.id as student_id, s.admission_no, s.roll_no, s.biometric_id, s.first_name, s.last_name, 
                    s.father_name, s.father_phone, s.photo_url, s.gender,
                    c.class_name, sec.section_name
             FROM attendance a 
             JOIN students s ON a.student_id = s.id 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             ${whereClause} 
             ORDER BY a.attendance_date DESC, a.id DESC 
             LIMIT ? OFFSET ?`,
            [...whereParams, limit, offset]
        );

        let selectedClass = classes.find(c => c.id === class_id);
        let selectedSection = sections.find(s => s.id === section_id);

        res.render('admin/attendance/index', {
            title: 'Student Attendance Register | Quantum Science Academy',
            classes,
            sections,
            classSections,
            selectedClass,
            selectedSection,
            class_id,
            section_id,
            attendance_date,
            search,
            isMarkMode,
            students,
            allAttendanceLogs,
            page,
            totalPages,
            totalRecords,
            limit
        });
    } catch (err) {
        console.error('Attendance error:', err);
        res.status(500).send('Error loading attendance');
    }
});

// Save Daily Attendance Batch
router.post('/save', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { class_id, section_id, attendance_date, attendance } = req.body;
        // attendance object: { [student_id]: 'Present' | 'Absent' | 'Late' | 'Half Day' }
        const remarksObj = req.body.remarks || {};

        if (!attendance || typeof attendance !== 'object') {
            req.session.flash_error = 'No student attendance records received.';
            return res.redirect(`/admin/attendance?class_id=${class_id}&section_id=${section_id}&date=${attendance_date}`);
        }

        let absentCount = 0;
        let absentStudentIds = [];

        for (const [studentId, status] of Object.entries(attendance)) {
            const remark = remarksObj[studentId] || '';
            await conn.query(
                `INSERT INTO attendance (student_id, class_id, section_id, attendance_date, status, remarks, marked_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE status = VALUES(status), remarks = VALUES(remarks), marked_by_user_id = VALUES(marked_by_user_id)`,
                [studentId, class_id, section_id, attendance_date, status, remark, req.session.user.id]
            );

            if (status === 'Absent') {
                absentCount++;
                absentStudentIds.push(studentId);
            }
        }

        await conn.commit();
        req.session.flash_success = `Attendance saved successfully for ${Object.keys(attendance).length} students! (${absentCount} Absent)`;
        res.redirect(`/admin/attendance?class_id=${class_id}&section_id=${section_id}&date=${attendance_date}`);
    } catch (err) {
        await conn.rollback();
        console.error('Save attendance error:', err);
        req.session.flash_error = 'Failed to save attendance: ' + err.message;
        res.redirect('/admin/attendance');
    } finally {
        conn.release();
    }
});

// 1-Click Trigger Absent Alert Notification
router.post('/send-absent-alert', async (req, res) => {
    try {
        const { class_id, section_id, attendance_date } = req.body;

        // Fetch absent students for this date
        const [absentStudents] = await pool.query(
            `SELECT s.id, s.first_name, s.last_name, s.father_name, s.father_phone, c.class_name, sec.section_name 
             FROM attendance a 
             JOIN students s ON a.student_id = s.id 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             WHERE a.attendance_date = ? AND a.status = 'Absent' AND a.class_id = ? AND a.section_id = ?`,
            [attendance_date, class_id, section_id]
        );

        if (absentStudents.length === 0) {
            req.session.flash_error = 'No absent students found on this date to send alerts.';
            return res.redirect(`/admin/attendance?class_id=${class_id}&section_id=${section_id}&date=${attendance_date}`);
        }

        for (const st of absentStudents) {
            const title = `Daily Attendance Alert: ${st.first_name} is Absent`;
            const message = `Dear Parent (${st.father_name}), your ward ${st.first_name} ${st.last_name} (${st.class_name}-${st.section_name}) is marked ABSENT on ${attendance_date}. Please contact the school office if this was unplanned.`;

            await pool.query(
                `INSERT INTO notifications (title, message, category, target_role, class_id, section_id, student_id, sender_user_id) 
                 VALUES (?, ?, 'attendance_alert', 'parent', ?, ?, ?, ?)`,
                [title, message, class_id, section_id, st.id, req.session.user.id]
            );
        }

        req.session.flash_success = `Instant Absent Alerts generated and dispatched to ${absentStudents.length} parents via the mobile app notification hub!`;
        res.redirect(`/admin/attendance?class_id=${class_id}&section_id=${section_id}&date=${attendance_date}`);
    } catch (err) {
        console.error('Absent alert error:', err);
        req.session.flash_error = 'Failed to send alerts: ' + err.message;
        res.redirect('/admin/attendance');
    }
});

// Monthly Attendance Report (Detailed School In/Out + Tuition In/Out)
router.get('/report', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);

        const class_id = req.query.class_id ? parseInt(req.query.class_id) : (classes.length > 0 ? classes[0].id : null);
        const classSections = sections.filter(s => s.class_id === class_id);

        let section_id = req.query.section_id ? parseInt(req.query.section_id) : null;
        if (!section_id || !classSections.some(s => s.id === section_id)) {
            section_id = classSections.length > 0 ? classSections[0].id : null;
        }

        const month = req.query.month || new Date().toISOString().slice(0, 7); // 'YYYY-MM'
        const viewMode = req.query.view || 'detailed'; // 'detailed' | 'summary'

        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const mon = parseInt(monthStr, 10);
        const daysInMonth = new Date(year, mon, 0).getDate();

        let reportData = [];
        if (class_id && section_id) {
            const [students] = await pool.query(
                `SELECT s.id, s.admission_no, s.roll_no, s.biometric_id, s.first_name, s.last_name 
                 FROM students s 
                 WHERE s.class_id = ? AND s.section_id = ? AND s.status = 'active'
                 ORDER BY s.roll_no ASC`,
                [class_id, section_id]
            );

            for (const st of students) {
                const [records] = await pool.query(
                    `SELECT DATE_FORMAT(attendance_date, '%Y-%m-%d') as att_date, 
                            DAY(attendance_date) as day_num,
                            status, morning_in, morning_out, tuition_in, tuition_out, 
                            morning_status, tuition_status, remarks 
                     FROM attendance 
                     WHERE student_id = ? AND DATE_FORMAT(attendance_date, '%Y-%m') = ? 
                     ORDER BY attendance_date ASC`,
                    [st.id, month]
                );

                const dailyMap = {};
                let schoolPresent = 0;
                let tuitionPresent = 0;
                let absent = 0;
                let late = 0;
                let half_day = 0;

                records.forEach(r => {
                    dailyMap[r.day_num] = r;
                    if (r.morning_in || r.status === 'Present' || r.morning_status === 'Present') {
                        schoolPresent++;
                    }
                    if (r.tuition_in || r.tuition_status === 'Present') {
                        tuitionPresent++;
                    }
                    if (r.status === 'Absent') absent++;
                    if (r.status === 'Late') late++;
                    if (r.status === 'Half Day') half_day++;
                });

                const totalMarked = records.length;
                const percentage = totalMarked > 0 ? Math.round((schoolPresent / totalMarked) * 100) : 0;

                reportData.push({
                    ...st,
                    schoolPresent,
                    tuitionPresent,
                    absent,
                    late,
                    half_day,
                    totalMarked,
                    percentage,
                    records,
                    dailyMap
                });
            }
        }

        res.render('admin/attendance/report', {
            title: 'Monthly Dual-Session Attendance Register | Quantum Science Academy',
            classes,
            sections,
            classSections,
            class_id,
            section_id,
            month,
            daysInMonth,
            viewMode,
            reportData
        });
    } catch (err) {
        console.error('Report error:', err);
        res.status(500).send('Error loading report');
    }
});

// Export Attendance CSV
router.get('/export-csv', async (req, res) => {
    try {
        const { class_id, section_id, month } = req.query;
        if (!class_id || !section_id) {
            return res.status(400).send('Class and Section required');
        }

        const selMonth = month || new Date().toISOString().slice(0, 7);

        const [rows] = await pool.query(
            `SELECT s.admission_no, s.roll_no, s.biometric_id, 
                    CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) as student_name,
                    c.class_name, sec.section_name,
                    DATE_FORMAT(a.attendance_date, '%Y-%m-%d') as att_date,
                    COALESCE(TIME_FORMAT(a.morning_in, '%h:%i %p'), '-') as school_in,
                    COALESCE(TIME_FORMAT(a.morning_out, '%h:%i %p'), '-') as school_out,
                    COALESCE(TIME_FORMAT(a.tuition_in, '%h:%i %p'), '-') as tuition_in,
                    COALESCE(TIME_FORMAT(a.tuition_out, '%h:%i %p'), '-') as tuition_out,
                    COALESCE(a.status, 'Unmarked') as overall_status,
                    COALESCE(a.remarks, '') as remarks
             FROM students s
             JOIN classes c ON s.class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             LEFT JOIN attendance a ON s.id = a.student_id AND DATE_FORMAT(a.attendance_date, '%Y-%m') = ?
             WHERE s.class_id = ? AND s.section_id = ? AND s.status = 'active'
             ORDER BY s.roll_no ASC, a.attendance_date ASC`,
            [selMonth, class_id, section_id]
        );

        let csv = 'Roll No,Admission No,Biometric ID,Student Name,Class,Section,Date,School IN,School OUT,Tuition IN,Tuition OUT,Status,Remarks\n';
        rows.forEach(r => {
            csv += `"${r.roll_no || ''}","${r.admission_no}","${r.biometric_id || ''}","${r.student_name}","${r.class_name}","${r.section_name}","${r.att_date || ''}","${r.school_in}","${r.school_out}","${r.tuition_in}","${r.tuition_out}","${r.overall_status}","${r.remarks.replace(/"/g, '""')}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="attendance_${selMonth}_class_${class_id}.csv"`);
        res.status(200).send(csv);
    } catch (err) {
        console.error('Export CSV error:', err);
        res.status(500).send('Error generating CSV');
    }
});

module.exports = router;
