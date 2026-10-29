const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// List Teachers
router.get('/', async (req, res) => {
    try {
        const [teachers] = await pool.query(
            `SELECT t.*, u.name, u.username, u.email, u.phone, u.avatar_url,
                    c.class_name as class_teacher_of, sec.section_name as class_teacher_sec,
                    COUNT(DISTINCT ts.id) as subjects_count
             FROM teachers t
             JOIN users u ON t.user_id = u.id
             LEFT JOIN classes c ON t.assigned_class_id = c.id
             LEFT JOIN sections sec ON t.assigned_section_id = sec.id
             LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
             GROUP BY t.id ORDER BY t.id ASC`
        );

        // Fetch subjects allocated for each teacher
        for (const t of teachers) {
            const [subs] = await pool.query(
                `SELECT s.subject_name, c.class_name, sec.section_name 
                 FROM teacher_subjects ts 
                 JOIN subjects s ON ts.subject_id = s.id 
                 JOIN classes c ON ts.class_id = c.id 
                 JOIN sections sec ON ts.section_id = sec.id 
                 WHERE ts.teacher_id = ?`,
                [t.id]
            );
            t.allocated_subjects = subs;
        }

        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);
        const [subjects] = await pool.query(`SELECT s.*, c.class_name FROM subjects s JOIN classes c ON s.class_id = c.id ORDER BY c.numeric_level ASC`);

        res.render('admin/teachers/index', {
            title: 'Teachers & Academic Faculty | ' + (res.locals.school.school_name || 'Quantum Science Academy'),
            teachers,
            classes,
            sections,
            subjects
        });
    } catch (err) {
        console.error('Teachers list error:', err);
        res.status(500).send('Error loading teachers: ' + err.message);
    }
});

// POST Create Teacher
router.post('/create', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const {
            name, username, email, phone, password, employee_code, gender,
            designation, qualification, salary, assigned_class_id, assigned_section_id,
            subject_allocations
        } = req.body;

        // Employee code is now optional! Name, username, password are required
        if (!name || !username || !password) {
            req.session.flash_error = 'Please fill required fields (Full Name, App Username, Password).';
            return res.redirect('/admin/teachers');
        }

        // If employee_code is provided, trim it; if empty, auto-generate a clean unique code
        const empCode = (employee_code && employee_code.trim()) 
            ? employee_code.trim() 
            : ('EMP-' + Math.floor(1000 + Math.random() * 9000));

        const teacherGender = (gender === 'Female') ? 'Female' : 'Male';
        const defaultAvatar = (teacherGender === 'Female') ? '/images/default_teacher_female.svg' : '/images/default_teacher_male.svg';
        const passHash = await bcrypt.hash(password.trim(), 10);

        // Create User
        const [userRes] = await conn.query(
            `INSERT INTO users (name, username, email, phone, gender, avatar_url, password_hash, role) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'teacher')`,
            [name.trim(), username.trim().toLowerCase(), email ? email.trim() : null, phone ? phone.trim() : null, teacherGender, defaultAvatar, passHash]
        );
        const userId = userRes.insertId;

        // Create Teacher record
        const [tRes] = await conn.query(
            `INSERT INTO teachers (user_id, employee_code, gender, designation, qualification, salary, assigned_class_id, assigned_section_id, joining_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
            [
                userId, empCode, teacherGender, designation ? designation.trim() : 'Faculty', qualification ? qualification.trim() : '',
                salary ? parseFloat(salary) : 0.00,
                assigned_class_id ? assigned_class_id : null,
                assigned_section_id ? assigned_section_id : null
            ]
        );
        const teacherId = tRes.insertId;

        // Subject allocations (if any submitted)
        if (subject_allocations && Array.isArray(subject_allocations)) {
            for (const alloc of subject_allocations) {
                if (alloc.subject_id && alloc.class_id && alloc.section_id) {
                    await conn.query(
                        `INSERT INTO teacher_subjects (teacher_id, class_id, section_id, subject_id) 
                         VALUES (?, ?, ?, ?)`,
                        [teacherId, alloc.class_id, alloc.section_id, alloc.subject_id]
                    );
                }
            }
        }

        await conn.commit();
        req.session.flash_success = `Teacher ${name} registered successfully! (Emp Code: ${empCode}, Username: ${username.trim().toLowerCase()})`;
        res.redirect('/admin/teachers');
    } catch (err) {
        await conn.rollback();
        console.error('Teacher create error:', err);
        req.session.flash_error = 'Failed to create teacher: ' + err.message;
        res.redirect('/admin/teachers');
    } finally {
        conn.release();
    }
});

// POST Change Teacher Password (for Admin)
router.post('/:id/change-password', async (req, res) => {
    try {
        const { new_password } = req.body;
        if (!new_password || new_password.trim().length < 4) {
            req.session.flash_error = 'Password must be at least 4 characters long.';
            return res.redirect('/admin/teachers');
        }

        const [tRow] = await pool.query(
            `SELECT t.*, u.name, u.username FROM teachers t JOIN users u ON t.user_id = u.id WHERE t.id = ?`,
            [req.params.id]
        );

        if (tRow.length === 0) {
            req.session.flash_error = 'Teacher record not found.';
            return res.redirect('/admin/teachers');
        }

        const passHash = await bcrypt.hash(new_password.trim(), 10);
        await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [passHash, tRow[0].user_id]);

        req.session.flash_success = `Password for faculty "${tRow[0].name}" (Username: ${tRow[0].username}) updated successfully!`;
        res.redirect('/admin/teachers');
    } catch (err) {
        console.error('Password change error:', err);
        req.session.flash_error = 'Failed to change password: ' + err.message;
        res.redirect('/admin/teachers');
    }
});

// POST Edit Teacher Details
router.post('/:id/edit', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const teacherId = req.params.id;
        const {
            name, username, email, phone, employee_code, gender,
            designation, qualification, salary, assigned_class_id, assigned_section_id
        } = req.body;

        if (!name || !username) {
            req.session.flash_error = 'Teacher Name and App Login Username are required.';
            return res.redirect('/admin/teachers');
        }

        const [tRow] = await conn.query(`SELECT * FROM teachers WHERE id = ?`, [teacherId]);
        if (tRow.length === 0) {
            req.session.flash_error = 'Teacher record not found.';
            return res.redirect('/admin/teachers');
        }
        const teacher = tRow[0];
        const userId = teacher.user_id;

        // Check if username changed and is already taken by another user
        const [existingUser] = await conn.query(
            `SELECT id FROM users WHERE username = ? AND id != ?`,
            [username.trim().toLowerCase(), userId]
        );
        if (existingUser.length > 0) {
            req.session.flash_error = `Username "${username.trim().toLowerCase()}" is already in use by another account.`;
            return res.redirect('/admin/teachers');
        }

        const teacherGender = (gender === 'Female') ? 'Female' : 'Male';

        // Update default avatar if avatar_url is currently one of the default SVGs
        const [currUser] = await conn.query(`SELECT avatar_url FROM users WHERE id = ?`, [userId]);
        let avatarUrl = currUser[0]?.avatar_url;
        if (!avatarUrl || avatarUrl.includes('default_teacher_')) {
            avatarUrl = (teacherGender === 'Female') ? '/images/default_teacher_female.svg' : '/images/default_teacher_male.svg';
        }

        // 1. Update Users Table
        await conn.query(
            `UPDATE users SET name = ?, username = ?, email = ?, phone = ?, gender = ?, avatar_url = ? WHERE id = ?`,
            [
                name.trim(),
                username.trim().toLowerCase(),
                email ? email.trim() : null,
                phone ? phone.trim() : null,
                teacherGender,
                avatarUrl,
                userId
            ]
        );

        // 2. Update Teachers Table
        const empCode = (employee_code && employee_code.trim()) ? employee_code.trim() : (teacher.employee_code || ('EMP-' + Math.floor(1000 + Math.random() * 9000)));

        await conn.query(
            `UPDATE teachers SET 
                employee_code = ?, gender = ?, designation = ?, qualification = ?, salary = ?,
                assigned_class_id = ?, assigned_section_id = ?
             WHERE id = ?`,
            [
                empCode,
                teacherGender,
                designation ? designation.trim() : 'Faculty',
                qualification ? qualification.trim() : '',
                salary ? parseFloat(salary) : 0.00,
                assigned_class_id ? assigned_class_id : null,
                assigned_section_id ? assigned_section_id : null,
                teacherId
            ]
        );

        await conn.commit();
        req.session.flash_success = `Faculty member "${name}" updated successfully!`;
        res.redirect('/admin/teachers');
    } catch (err) {
        await conn.rollback();
        console.error('Error updating teacher:', err);
        req.session.flash_error = 'Failed to update teacher: ' + err.message;
        res.redirect('/admin/teachers');
    } finally {
        conn.release();
    }
});

// Delete / Deactivate Teacher
router.post('/:id/delete', async (req, res) => {
    try {
        const [tRow] = await pool.query(`SELECT user_id FROM teachers WHERE id = ?`, [req.params.id]);
        if (tRow.length > 0) {
            await pool.query(`DELETE FROM users WHERE id = ?`, [tRow[0].user_id]);
        }
        req.session.flash_success = 'Teacher account removed.';
        res.redirect('/admin/teachers');
    } catch (err) {
        console.error(err);
        req.session.flash_error = 'Failed to remove teacher: ' + err.message;
        res.redirect('/admin/teachers');
    }
});

module.exports = router;
