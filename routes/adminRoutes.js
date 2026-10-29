const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// Admin Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        // 1. Total Students
        const [[{ total_students }]] = await pool.query(
            `SELECT COUNT(*) as total_students FROM students WHERE status = 'active'`
        );

        // 2. Total Teachers
        const [[{ total_teachers }]] = await pool.query(
            `SELECT COUNT(*) as total_teachers FROM teachers`
        );

        // 3. Today's Attendance Stats
        const todayStr = new Date().toISOString().split('T')[0];
        const [todayAttRows] = await pool.query(
            `SELECT status, COUNT(*) as count FROM attendance WHERE attendance_date = ? GROUP BY status`,
            [todayStr]
        );
        let presentToday = 0, absentToday = 0, totalMarkedToday = 0;
        todayAttRows.forEach(r => {
            totalMarkedToday += r.count;
            if (r.status === 'Present') presentToday += r.count;
            if (r.status === 'Absent') absentToday += r.count;
        });
        const attPercentage = totalMarkedToday > 0 ? Math.round((presentToday / totalMarkedToday) * 100) : 0;

        // 4. Financials (Total collected & Pending)
        const [[{ total_collected }]] = await pool.query(
            `SELECT COALESCE(SUM(amount_paid), 0) as total_collected FROM fee_receipts`
        );
        const [[{ total_pending }]] = await pool.query(
            `SELECT COALESCE(SUM(balance_amount), 0) as total_pending FROM student_fee_dues WHERE status != 'paid'`
        );

        // 5. Recent Receipts
        const [recentReceipts] = await pool.query(
            `SELECT r.*, s.first_name, s.last_name, s.admission_no, c.class_name, sec.section_name 
             FROM fee_receipts r 
             JOIN students s ON r.student_id = s.id 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             ORDER BY r.created_at DESC LIMIT 5`
        );

        // 6. Recent Notices
        const [recentNotices] = await pool.query(
            `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5`
        );

        // 7. Class-wise distribution
        const [classDistribution] = await pool.query(
            `SELECT c.class_name, COUNT(s.id) as student_count 
             FROM classes c 
             LEFT JOIN students s ON c.id = s.class_id AND s.status = 'active'
             GROUP BY c.id ORDER BY c.numeric_level ASC`
        );

        res.render('admin/dashboard', {
            title: 'Admin Dashboard | Star Academy Rohtak',
            stats: {
                totalStudents: total_students,
                totalTeachers: total_teachers,
                presentToday,
                absentToday,
                attPercentage,
                totalMarkedToday,
                totalCollected: Number(total_collected).toLocaleString('en-IN'),
                totalPending: Number(total_pending).toLocaleString('en-IN')
            },
            recentReceipts,
            recentNotices,
            classDistribution
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).send('Dashboard Error: ' + err.message);
    }
});

module.exports = router;
