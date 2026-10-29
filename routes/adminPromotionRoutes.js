const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// Class Promotion Interface
router.get('/', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);

        const from_class_id = req.query.from_class_id || (classes.length > 0 ? classes[0].id : null);
        const to_class_id = req.query.to_class_id || null;
        const from_session = req.query.from_session || '2025-2026';
        const to_session = req.query.to_session || '2026-2027';

        let students = [];
        if (from_class_id) {
            const [rows] = await pool.query(
                `SELECT s.*, sec.section_name 
                 FROM students s 
                 JOIN sections sec ON s.section_id = sec.id 
                 WHERE s.class_id = ? AND s.status = 'active' 
                 ORDER BY sec.section_name ASC, s.roll_no ASC`,
                [from_class_id]
            );
            students = rows;
        }

        // Recent promotion logs
        const [promotionLogs] = await pool.query(
            `SELECT pl.*, s.first_name, s.last_name, s.admission_no, 
                    c1.class_name as from_class_name, c2.class_name as to_class_name, u.name as admin_name
             FROM class_promotions_log pl
             JOIN students s ON pl.student_id = s.id
             JOIN classes c1 ON pl.from_class_id = c1.id
             LEFT JOIN classes c2 ON pl.to_class_id = c2.id
             LEFT JOIN users u ON pl.promoted_by_user_id = u.id
             ORDER BY pl.promoted_at DESC LIMIT 15`
        );

        res.render('admin/promotion/index', {
            title: 'Class Promotion to Next Academic Session | Quantum Science Academy',
            classes,
            from_class_id,
            to_class_id,
            from_session,
            to_session,
            students,
            promotionLogs
        });
    } catch (err) {
        console.error('Promotion page error:', err);
        res.status(500).send('Error loading promotion tool');
    }
});

// Execute Bulk Class Promotion
router.post('/execute', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { from_class_id, to_class_id, from_session, to_session, student_action, selected_students } = req.body;
        // student_action is an object: { [student_id]: 'promote' | 'retain' | 'graduate' }

        if (!from_class_id || !student_action) {
            req.session.flash_error = 'Please select class and students to promote.';
            return res.redirect('/admin/promotion');
        }

        const selectedIds = selected_students 
            ? (Array.isArray(selected_students) ? selected_students : [selected_students]) 
            : Object.keys(student_action);

        let promotedCount = 0;
        let retainedCount = 0;
        let graduatedCount = 0;

        for (const studentId of selectedIds) {
            const action = student_action[studentId] || 'promote';

            if (action === 'promote' && to_class_id) {
                // Update student to new class & session
                await conn.query(
                    `UPDATE students SET class_id = ?, session_year = ?, status = 'active' WHERE id = ?`,
                    [to_class_id, to_session, studentId]
                );
                await conn.query(
                    `INSERT INTO class_promotions_log (student_id, from_class_id, to_class_id, from_session, to_session, action, promoted_by_user_id) 
                     VALUES (?, ?, ?, ?, ?, 'promoted', ?)`,
                    [studentId, from_class_id, to_class_id, from_session, to_session, req.session.user.id]
                );
                promotedCount++;
            } else if (action === 'retain') {
                // Keep in same class, update session
                await conn.query(
                    `UPDATE students SET session_year = ?, status = 'active' WHERE id = ?`,
                    [to_session, studentId]
                );
                await conn.query(
                    `INSERT INTO class_promotions_log (student_id, from_class_id, to_class_id, from_session, to_session, action, promoted_by_user_id) 
                     VALUES (?, ?, ?, ?, ?, 'retained', ?)`,
                    [studentId, from_class_id, from_class_id, from_session, to_session, req.session.user.id]
                );
                retainedCount++;
            } else if (action === 'graduate') {
                // Mark passed out
                await conn.query(
                    `UPDATE students SET status = 'passed_out' WHERE id = ?`,
                    [studentId]
                );
                await conn.query(
                    `INSERT INTO class_promotions_log (student_id, from_class_id, to_class_id, from_session, to_session, action, promoted_by_user_id) 
                     VALUES (?, ?, NULL, ?, ?, 'graduated', ?)`,
                    [studentId, from_class_id, from_session, to_session, req.session.user.id]
                );
                graduatedCount++;
            }
        }

        await conn.commit();
        req.session.flash_success = `Class Promotion executed! ${promotedCount} Promoted, ${retainedCount} Retained, ${graduatedCount} Graduated.`;
        res.redirect('/admin/promotion');
    } catch (err) {
        await conn.rollback();
        console.error('Promotion error:', err);
        req.session.flash_error = 'Promotion failed: ' + err.message;
        res.redirect('/admin/promotion');
    } finally {
        conn.release();
    }
});

module.exports = router;
