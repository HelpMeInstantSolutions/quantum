const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(requireAdminWeb);

// List Homework
router.get('/', async (req, res) => {
    try {
        const { class_id, section_id } = req.query;
        let query = `
            SELECT h.*, c.class_name, sec.section_name, sub.subject_name, u.name as teacher_name 
            FROM homework h 
            JOIN classes c ON h.class_id = c.id 
            JOIN sections sec ON h.section_id = sec.id 
            JOIN subjects sub ON h.subject_id = sub.id 
            LEFT JOIN teachers t ON h.teacher_id = t.id 
            LEFT JOIN users u ON t.user_id = u.id 
            WHERE 1=1 
        `;
        const params = [];
        if (class_id) {
            query += ` AND h.class_id = ? `;
            params.push(class_id);
        }
        if (section_id) {
            query += ` AND h.section_id = ? `;
            params.push(section_id);
        }
        query += ` ORDER BY h.homework_date DESC, h.id DESC`;

        const [homeworkList] = await pool.query(query, params);
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);

        res.render('admin/homework/index', {
            title: 'Homework Management | Quantum Science Academy',
            homeworkList,
            classes,
            sections,
            filters: { class_id, section_id }
        });
    } catch (err) {
        console.error('Homework list error:', err);
        res.status(500).send('Error loading homework');
    }
});

// GET Create Homework Form
router.get('/create', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);
        const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY subject_name ASC`);
        const [teachers] = await pool.query(`SELECT t.id, u.name FROM teachers t JOIN users u ON t.user_id = u.id`);

        res.render('admin/homework/create', {
            title: 'Assign Daily Homework | Quantum Science Academy',
            classes,
            sections,
            subjects,
            teachers
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/homework');
    }
});

// POST Create Homework
router.post('/create', upload.single('homework_file'), async (req, res) => {
    try {
        const { class_id, section_id, subject_id, teacher_id, title, description, homework_date, due_date } = req.body;

        if (!class_id || !subject_id || !title || !description || !due_date) {
            req.session.flash_error = 'Please fill all required homework fields.';
            return res.redirect('/admin/homework/create');
        }

        const attachment_url = req.file ? `/uploads/homework/${req.file.filename}` : null;

        await pool.query(
            `INSERT INTO homework (class_id, section_id, subject_id, teacher_id, title, description, homework_date, due_date, attachment_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                class_id, section_id, subject_id, teacher_id ? teacher_id : null,
                title.trim(), description.trim(),
                homework_date || new Date().toISOString().split('T')[0],
                due_date,
                attachment_url
            ]
        );

        // Also post an automatic notification for students in that class
        const [subRow] = await pool.query(`SELECT subject_name FROM subjects WHERE id = ?`, [subject_id]);
        const subjectName = subRow[0]?.subject_name || 'Subject';
        await pool.query(
            `INSERT INTO notifications (title, message, category, target_role, class_id, section_id, sender_user_id) 
             VALUES (?, ?, 'homework', 'student', ?, ?, ?)`,
            [
                `New Homework: ${subjectName} - ${title}`,
                `Homework assigned for ${subjectName}. Due date: ${due_date}. Please complete and submit on time.`,
                class_id, section_id, req.session.user.id
            ]
        );

        req.session.flash_success = 'Homework assigned and notification published to students!';
        res.redirect('/admin/homework');
    } catch (err) {
        console.error('Homework create error:', err);
        req.session.flash_error = 'Failed to assign homework: ' + err.message;
        res.redirect('/admin/homework/create');
    }
});

// View Homework Submissions
router.get('/:id', async (req, res) => {
    try {
        const homeworkId = req.params.id;
        const [hwRows] = await pool.query(
            `SELECT h.*, c.class_name, sec.section_name, sub.subject_name, u.name as teacher_name 
             FROM homework h 
             JOIN classes c ON h.class_id = c.id 
             JOIN sections sec ON h.section_id = sec.id 
             JOIN subjects sub ON h.subject_id = sub.id 
             LEFT JOIN teachers t ON h.teacher_id = t.id 
             LEFT JOIN users u ON t.user_id = u.id 
             WHERE h.id = ?`,
            [homeworkId]
        );

        if (hwRows.length === 0) return res.redirect('/admin/homework');
        const hw = hwRows[0];

        // Fetch all students of this class and their submission if any
        const [submissions] = await pool.query(
            `SELECT s.id as student_id, s.admission_no, s.roll_no, s.first_name, s.last_name,
                    subm.id as submission_id, subm.status as submission_status, subm.submitted_at,
                    subm.grade, subm.teacher_feedback, subm.attachment_url as student_attachment
             FROM students s 
             LEFT JOIN homework_submissions subm ON s.id = subm.student_id AND subm.homework_id = ?
             WHERE s.class_id = ? AND s.section_id = ? AND s.status = 'active'
             ORDER BY s.roll_no ASC`,
            [homeworkId, hw.class_id, hw.section_id]
        );

        res.render('admin/homework/view', {
            title: `Homework: ${hw.title} | Quantum Science Academy`,
            hw,
            submissions
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/homework');
    }
});

// Delete Homework
router.post('/:id/delete', async (req, res) => {
    try {
        await pool.query(`DELETE FROM homework WHERE id = ?`, [req.params.id]);
        req.session.flash_success = 'Homework deleted.';
        res.redirect('/admin/homework');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/homework');
    }
});

module.exports = router;
