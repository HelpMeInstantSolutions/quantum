const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// Pending Fees Report & Management
router.get('/', async (req, res) => {
    try {
        const { class_id, min_amount, search } = req.query;

        let query = `
            SELECT s.id as student_id, s.admission_no, s.roll_no, s.first_name, s.last_name,
                   s.father_name, s.father_phone, c.class_name, sec.section_name,
                   COUNT(d.id) as pending_dues_count,
                   COALESCE(SUM(d.balance_amount), 0) as total_due_amount,
                   GROUP_CONCAT(d.fee_title SEPARATOR ', ') as pending_fee_titles,
                   MIN(d.due_date) as oldest_due_date
            FROM student_fee_dues d
            JOIN students s ON d.student_id = s.id
            JOIN classes c ON s.class_id = c.id
            JOIN sections sec ON s.section_id = sec.id
            WHERE d.status != 'paid' AND s.status = 'active'
        `;
        const params = [];

        if (class_id) {
            query += ` AND s.class_id = ? `;
            params.push(class_id);
        }
        if (search) {
            query += ` AND (s.first_name LIKE ? OR s.admission_no LIKE ? OR s.father_phone LIKE ?) `;
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        query += ` GROUP BY s.id `;

        if (min_amount && !isNaN(min_amount)) {
            query += ` HAVING total_due_amount >= ? `;
            params.push(parseFloat(min_amount));
        }

        query += ` ORDER BY total_due_amount DESC`;

        const [defaulters] = await pool.query(query, params);
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);

        // Total pending calculation
        const totalPendingSum = defaulters.reduce((acc, curr) => acc + Number(curr.total_due_amount), 0);

        res.render('admin/fees/pending_fees', {
            title: 'Outstanding & Pending Fees Analysis | Quantum Science Academy',
            defaulters,
            classes,
            filters: { class_id, min_amount, search },
            totalPendingSum: Number(totalPendingSum).toLocaleString('en-IN')
        });
    } catch (err) {
        console.error('Pending fees error:', err);
        res.status(500).send('Error loading pending fees report');
    }
});

// 1-Click Broadcast Pending Fee Reminder Notifications
router.post('/send-reminder-all', async (req, res) => {
    try {
        const { class_id, reminder_note } = req.body;

        let query = `
            SELECT s.id as student_id, s.first_name, s.last_name, s.father_name, s.father_phone,
                   c.class_name, sec.section_name,
                   COALESCE(SUM(d.balance_amount), 0) as total_due
            FROM student_fee_dues d
            JOIN students s ON d.student_id = s.id
            JOIN classes c ON s.class_id = c.id
            JOIN sections sec ON s.section_id = sec.id
            WHERE d.status != 'paid' AND s.status = 'active'
        `;
        const params = [];
        if (class_id) {
            query += ` AND s.class_id = ? `;
            params.push(class_id);
        }
        query += ` GROUP BY s.id HAVING total_due > 0`;

        const [overdueStudents] = await pool.query(query, params);

        if (overdueStudents.length === 0) {
            req.session.flash_error = 'No overdue students found matching your criteria.';
            return res.redirect('/admin/pending-fees');
        }

        let sentCount = 0;
        for (const st of overdueStudents) {
            const title = `Fee Reminder: Pending Balance ₹${Number(st.total_due).toLocaleString('en-IN')}`;
            const message = `Dear Parent (${st.father_name}), a pending balance of ₹${Number(st.total_due).toLocaleString('en-IN')} is overdue for your ward ${st.first_name} (${st.class_name}-${st.section_name}). ${reminder_note || 'Kindly clear the dues at school accounts counter or via online mode at the earliest.'}`;

            await pool.query(
                `INSERT INTO notifications (title, message, category, target_role, student_id, sender_user_id) 
                 VALUES (?, ?, 'fee_reminder', 'parent', ?, ?)`,
                [title, message, st.student_id, req.session.user.id]
            );
            sentCount++;
        }

        req.session.flash_success = `Fee reminder notifications dispatched to ${sentCount} parents via app notification feed!`;
        res.redirect('/admin/pending-fees');
    } catch (err) {
        console.error('Pending fee reminder error:', err);
        req.session.flash_error = 'Failed to dispatch reminders: ' + err.message;
        res.redirect('/admin/pending-fees');
    }
});

// Send Single Reminder
router.post('/send-reminder-single', async (req, res) => {
    try {
        const { student_id, amount, note } = req.body;
        const [sRows] = await pool.query(`SELECT s.*, c.class_name FROM students s JOIN classes c ON s.class_id = c.id WHERE s.id = ?`, [student_id]);
        if (sRows.length > 0) {
            const st = sRows[0];
            const title = `Urgent Fee Reminder: ₹${amount}`;
            const message = `Dear ${st.father_name}, please note the pending school fee balance of ₹${amount} for ${st.first_name}. ${note || 'Kindly deposit by due date.'}`;

            await pool.query(
                `INSERT INTO notifications (title, message, category, target_role, student_id, sender_user_id) 
                 VALUES (?, ?, 'fee_reminder', 'parent', ?, ?)`,
                [title, message, student_id, req.session.user.id]
            );
        }
        req.session.flash_success = 'Fee reminder alert sent to parent!';
        res.redirect('/admin/pending-fees');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/pending-fees');
    }
});

module.exports = router;
