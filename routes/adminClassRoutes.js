const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// List Classes, Sections, Subjects & Teacher Assignments
router.get('/', async (req, res) => {
    try {
        // 1. Classes with counts
        const [classes] = await pool.query(
            `SELECT c.*, 
                   COUNT(DISTINCT s.id) as student_count,
                   COUNT(DISTINCT sec.id) as section_count,
                   COUNT(DISTINCT sub.id) as subject_count
             FROM classes c 
             LEFT JOIN students s ON c.id = s.class_id AND s.status = 'active'
             LEFT JOIN sections sec ON c.id = sec.class_id
             LEFT JOIN subjects sub ON c.id = sub.class_id
             GROUP BY c.id ORDER BY c.numeric_level ASC, c.class_name ASC`
        );

        // 2. Sections with student count
        const [sections] = await pool.query(
            `SELECT sec.*, c.class_name, c.stream,
                    COUNT(s.id) as student_count
             FROM sections sec 
             JOIN classes c ON sec.class_id = c.id 
             LEFT JOIN students s ON sec.id = s.section_id AND s.status = 'active'
             GROUP BY sec.id
             ORDER BY c.numeric_level ASC, sec.section_name ASC`
        );

        // 3. Subjects with Class & Section
        const [subjects] = await pool.query(
            `SELECT sub.*, c.class_name, c.numeric_level, sec.section_name 
             FROM subjects sub 
             JOIN classes c ON sub.class_id = c.id 
             LEFT JOIN sections sec ON sub.section_id = sec.id 
             ORDER BY c.numeric_level ASC, sub.subject_name ASC`
        );

        // 4. Teachers list for dropdown
        const [teachers] = await pool.query(
            `SELECT t.id, t.employee_code, t.designation, u.name, u.phone 
             FROM teachers t 
             JOIN users u ON t.user_id = u.id 
             ORDER BY u.name ASC`
        );

        // 5. Teacher Subject Assignments (Class + Section + Subject -> Teacher)
        const [assignments] = await pool.query(
            `SELECT ts.id, ts.teacher_id, ts.class_id, ts.section_id, ts.subject_id,
                    u.name as teacher_name, t.employee_code, u.phone as teacher_phone,
                    c.class_name, sec.section_name, s.subject_name, s.subject_code
             FROM teacher_subjects ts 
             JOIN teachers t ON ts.teacher_id = t.id 
             JOIN users u ON t.user_id = u.id 
             JOIN classes c ON ts.class_id = c.id 
             JOIN sections sec ON ts.section_id = sec.id 
             JOIN subjects s ON ts.subject_id = s.id 
             ORDER BY c.numeric_level ASC, sec.section_name ASC, s.subject_name ASC`
        );

        res.render('admin/classes/index', {
            title: 'Classes, Sections, Subjects & Faculty Allocations | ' + (res.locals.school.school_name || 'Quantum Science Academy'),
            classes,
            sections,
            subjects,
            teachers,
            assignments
        });
    } catch (err) {
        console.error('Classes list error:', err);
        res.status(500).send('Error loading academic classes: ' + err.message);
    }
});

// Add Class
router.post('/create', async (req, res) => {
    try {
        const { class_name, numeric_level, stream, initial_section } = req.body;
        if (!class_name) {
            req.session.flash_error = 'Class name is required.';
            return res.redirect('/admin/classes');
        }

        const [clsRes] = await pool.query(
            `INSERT INTO classes (class_name, numeric_level, stream) VALUES (?, ?, ?)`,
            [class_name.trim(), numeric_level || 1, stream || 'General']
        );

        const newClassId = clsRes.insertId;
        const sectionName = (initial_section && initial_section.trim()) ? initial_section.trim() : 'A';

        // Auto create initial section
        await pool.query(
            `INSERT INTO sections (class_id, section_name, room_no) VALUES (?, ?, 'Room 101')`,
            [newClassId, sectionName]
        );

        req.session.flash_success = `Class "${class_name}" created successfully with Section ${sectionName}!`;
        res.redirect('/admin/classes');
    } catch (err) {
        console.error('Error creating class:', err);
        req.session.flash_error = 'Failed to create class: ' + err.message;
        res.redirect('/admin/classes');
    }
});

// Add Section to Class
router.post('/sections/create', async (req, res) => {
    try {
        const { class_id, section_name, room_no } = req.body;
        if (!class_id || !section_name) {
            req.session.flash_error = 'Please select a class and enter section name.';
            return res.redirect('/admin/classes');
        }

        // Check if section already exists in this class
        const [existing] = await pool.query(
            `SELECT id FROM sections WHERE class_id = ? AND section_name = ?`,
            [class_id, section_name.trim()]
        );

        if (existing.length > 0) {
            req.session.flash_error = `Section "${section_name}" already exists for this class.`;
            return res.redirect('/admin/classes');
        }

        await pool.query(
            `INSERT INTO sections (class_id, section_name, room_no) VALUES (?, ?, ?)`,
            [class_id, section_name.trim().toUpperCase(), room_no ? room_no.trim() : '']
        );

        req.session.flash_success = `Section "${section_name.trim().toUpperCase()}" added successfully!`;
        res.redirect('/admin/classes');
    } catch (err) {
        console.error('Error adding section:', err);
        req.session.flash_error = 'Failed to add section: ' + err.message;
        res.redirect('/admin/classes');
    }
});

// Add Subject to Class & Optional Section
router.post('/subjects/create', async (req, res) => {
    try {
        const { class_id, section_id, subject_name, subject_code, assign_teacher_id } = req.body;
        if (!class_id || !subject_name) {
            req.session.flash_error = 'Please select a class and enter subject name.';
            return res.redirect('/admin/classes');
        }

        const secId = (section_id && section_id !== '') ? parseInt(section_id) : null;

        const [subRes] = await pool.query(
            `INSERT INTO subjects (class_id, section_id, subject_name, subject_code) VALUES (?, ?, ?, ?)`,
            [class_id, secId, subject_name.trim(), subject_code ? subject_code.trim().toUpperCase() : null]
        );
        const subjectId = subRes.insertId;

        // If teacher is selected right during subject creation, allocate teacher!
        if (assign_teacher_id && assign_teacher_id !== '') {
            // If section was chosen, allocate to that section
            if (secId) {
                await pool.query(
                    `INSERT INTO teacher_subjects (teacher_id, class_id, section_id, subject_id) VALUES (?, ?, ?, ?)`,
                    [assign_teacher_id, class_id, secId, subjectId]
                );
            } else {
                // If "all sections" chosen, allocate to all sections of this class
                const [allSecs] = await pool.query(`SELECT id FROM sections WHERE class_id = ?`, [class_id]);
                for (const s of allSecs) {
                    await pool.query(
                        `INSERT INTO teacher_subjects (teacher_id, class_id, section_id, subject_id) VALUES (?, ?, ?, ?)`,
                        [assign_teacher_id, class_id, s.id, subjectId]
                    );
                }
            }
        }

        req.session.flash_success = `Subject "${subject_name.trim()}" added to class successfully!`;
        res.redirect('/admin/classes');
    } catch (err) {
        console.error('Error creating subject:', err);
        req.session.flash_error = 'Failed to add subject: ' + err.message;
        res.redirect('/admin/classes');
    }
});

// Assign Teacher to Subject of a Class and Section
router.post('/assign-teacher', async (req, res) => {
    try {
        const { teacher_id, class_id, section_id, subject_id } = req.body;

        if (!teacher_id || !class_id || !section_id || !subject_id) {
            req.session.flash_error = 'Please select Teacher, Class, Section, and Subject.';
            return res.redirect('/admin/classes');
        }

        // Check if assignment already exists for this class, section and subject
        const [existing] = await pool.query(
            `SELECT id FROM teacher_subjects WHERE class_id = ? AND section_id = ? AND subject_id = ?`,
            [class_id, section_id, subject_id]
        );

        if (existing.length > 0) {
            // Update to new teacher
            await pool.query(
                `UPDATE teacher_subjects SET teacher_id = ? WHERE id = ?`,
                [teacher_id, existing[0].id]
            );
            req.session.flash_success = 'Subject teacher assignment updated successfully!';
        } else {
            // Insert new assignment
            await pool.query(
                `INSERT INTO teacher_subjects (teacher_id, class_id, section_id, subject_id) VALUES (?, ?, ?, ?)`,
                [teacher_id, class_id, section_id, subject_id]
            );
            req.session.flash_success = 'Teacher assigned to subject & section successfully!';
        }

        res.redirect('/admin/classes');
    } catch (err) {
        console.error('Error assigning teacher:', err);
        req.session.flash_error = 'Failed to assign teacher: ' + err.message;
        res.redirect('/admin/classes');
    }
});

// Remove Teacher Assignment
router.post('/assignments/:id/delete', async (req, res) => {
    try {
        await pool.query(`DELETE FROM teacher_subjects WHERE id = ?`, [req.params.id]);
        req.session.flash_success = 'Subject teacher assignment removed.';
        res.redirect('/admin/classes');
    } catch (err) {
        console.error('Error deleting assignment:', err);
        req.session.flash_error = 'Failed to remove assignment: ' + err.message;
        res.redirect('/admin/classes');
    }
});

// Delete Subject
router.post('/subjects/:id/delete', async (req, res) => {
    try {
        await pool.query(`DELETE FROM subjects WHERE id = ?`, [req.params.id]);
        req.session.flash_success = 'Subject removed.';
        res.redirect('/admin/classes');
    } catch (err) {
        console.error('Error deleting subject:', err);
        req.session.flash_error = 'Failed to delete subject: ' + err.message;
        res.redirect('/admin/classes');
    }
});

// Delete Section
router.post('/sections/:id/delete', async (req, res) => {
    try {
        const [students] = await pool.query(`SELECT COUNT(*) as cnt FROM students WHERE section_id = ?`, [req.params.id]);
        if (students[0].cnt > 0) {
            req.session.flash_error = `Cannot delete section. There are ${students[0].cnt} students enrolled in it.`;
            return res.redirect('/admin/classes');
        }
        await pool.query(`DELETE FROM sections WHERE id = ?`, [req.params.id]);
        req.session.flash_success = 'Section removed.';
        res.redirect('/admin/classes');
    } catch (err) {
        console.error('Error deleting section:', err);
        req.session.flash_error = 'Failed to delete section: ' + err.message;
        res.redirect('/admin/classes');
    }
});

module.exports = router;
