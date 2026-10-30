const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

function formatPhone(phone) {
    if (!phone) return '';
    const trimmed = String(phone).trim();
    const digits = trimmed.replace(/[^0-9]/g, '');
    if (digits.length === 10) {
        return `+91-${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
        return `+91-${digits.slice(2)}`;
    }
    if (trimmed.startsWith('+')) return trimmed;
    return `+91-${digits}`;
}

async function getOccupationsList() {
    try {
        const [occRows] = await pool.query(
            `SELECT DISTINCT father_occupation FROM students WHERE father_occupation IS NOT NULL AND father_occupation != '' ORDER BY father_occupation ASC`
        );
        const existing = occRows.map(r => r.father_occupation.trim()).filter(Boolean);
        const standard = [
            'Government Service',
            'Govt. Officer',
            'Businessman / Trader',
            'Private Service / Corporate',
            'Teacher / Professor',
            'Advocate / Legal',
            'Doctor / Healthcare',
            'Farmer / Agriculture',
            'Police / Armed Forces',
            'Engineer / IT Professional',
            'Transport Contractor',
            'Shopkeeper / Self-Employed'
        ];
        return Array.from(new Set([...existing, ...standard])).sort();
    } catch (e) {
        return [
            'Government Service',
            'Govt. Officer',
            'Businessman / Trader',
            'Private Service / Corporate',
            'Teacher / Professor',
            'Advocate / Legal',
            'Doctor / Healthcare',
            'Farmer / Agriculture'
        ];
    }
}

router.use(requireAdminWeb);

// List Students with Search & Class Filter
router.get('/', async (req, res) => {
    try {
        const { class_id, section_id, search, status } = req.query;

        let query = `
            SELECT s.*, c.class_name, sec.section_name, tr.route_name 
            FROM students s 
            JOIN classes c ON s.class_id = c.id 
            JOIN sections sec ON s.section_id = sec.id 
            LEFT JOIN transport_routes tr ON s.transport_route_id = tr.id 
            WHERE 1=1 
        `;
        const params = [];

        if (class_id) {
            query += ` AND s.class_id = ? `;
            params.push(class_id);
        }
        if (section_id) {
            query += ` AND s.section_id = ? `;
            params.push(section_id);
        }
        if (status) {
            query += ` AND s.status = ? `;
            params.push(status);
        } else {
            query += ` AND s.status = 'active' `;
        }
        if (search) {
            query += ` AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ? OR s.biometric_id LIKE ? OR s.father_phone LIKE ? OR s.srn_no LIKE ? OR s.pen_no LIKE ?) `;
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term, term, term, term);
        }

        query += ` ORDER BY c.numeric_level ASC, sec.section_name ASC, s.roll_no ASC`;

        const [students] = await pool.query(query, params);
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);

        res.render('admin/students/index', {
            title: 'Students Directory | Quantum Science Academy',
            students,
            classes,
            sections,
            filters: { class_id, section_id, search, status: status || 'active' }
        });
    } catch (err) {
        console.error('Students list error:', err);
        res.status(500).send('Error loading students');
    }
});

// GET Add Student Form
router.get('/add', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);
        const [routes] = await pool.query(`SELECT * FROM transport_routes WHERE status = 'active'`);

        // Generate next admission number
        const [[{ max_id }]] = await pool.query(`SELECT COALESCE(MAX(id), 0) + 1 as max_id FROM students`);
        const autoAdmissionNo = `STA-2026-${String(max_id).padStart(3, '0')}`;
        const occupations = await getOccupationsList();

        res.render('admin/students/add', {
            title: 'New Student Admission | Quantum Science Academy',
            classes,
            sections,
            routes,
            autoAdmissionNo,
            occupations
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/students');
    }
});

// POST Add Student
router.post('/add', upload.single('photo'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const {
            admission_no, roll_no, biometric_id, first_name, last_name, gender, dob, blood_group,
            class_id, section_id, father_name, father_phone, father_occupation,
            mother_name, mother_phone, current_address, transport_route_id,
            create_app_account, app_password,
            srn_no, pen_no, aadhar_no, family_id, apaar_id
        } = req.body;

        const cleanFatherPhone = formatPhone(father_phone);
        const cleanMotherPhone = formatPhone(mother_phone);

        const defaultStudentAvatar = (gender === 'Female') ? '/images/default_student_female.svg' : '/images/default_student_male.svg';
        const photo_url = req.file ? `/uploads/students/${req.file.filename}` : defaultStudentAvatar;

        let user_id = null;
        // Optionally create app user account for student/parent
        if (create_app_account === 'yes' || create_app_account === 'on') {
            const username = admission_no.toLowerCase().replace(/[^a-z0-9]/g, '');
            const rawPassword = app_password || 'student123';
            const passHash = await bcrypt.hash(rawPassword, 10);

            const [userRes] = await conn.query(
                `INSERT INTO users (name, username, phone, gender, avatar_url, password_hash, role) 
                 VALUES (?, ?, ?, ?, ?, ?, 'student')`,
                [`${first_name} ${last_name || ''}`.trim(), username, cleanFatherPhone, gender || 'Male', photo_url, passHash]
            );
            user_id = userRes.insertId;
        }

        const [insStudent] = await conn.query(
            `INSERT INTO students (
                user_id, admission_no, roll_no, biometric_id, first_name, last_name, gender, dob, blood_group,
                class_id, section_id, father_name, father_phone, father_occupation, mother_name,
                mother_phone, current_address, permanent_address, photo_url, transport_route_id,
                admission_date, status, srn_no, pen_no, aadhar_no, family_id, apaar_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'active', ?, ?, ?, ?, ?)`,
            [
                user_id, admission_no, roll_no || null, biometric_id ? biometric_id.trim() : null, first_name, last_name || '', gender || 'Male',
                dob || null, blood_group || 'B+', class_id, section_id, father_name, cleanFatherPhone,
                father_occupation || '', mother_name || '', cleanMotherPhone, current_address || '',
                current_address || '', photo_url, transport_route_id ? transport_route_id : null,
                srn_no ? srn_no.trim() : null, pen_no ? pen_no.trim() : null,
                aadhar_no ? aadhar_no.trim() : null, family_id ? family_id.trim() : null,
                apaar_id ? apaar_id.trim() : null
            ]
        );

        await conn.commit();
        req.session.flash_success = `Student ${first_name} admitted successfully with Admission No. ${admission_no}!`;
        res.redirect(`/admin/students/${insStudent.insertId}`);
    } catch (err) {
        await conn.rollback();
        console.error('Error adding student:', err);
        req.session.flash_error = 'Failed to register student: ' + err.message;
        res.redirect('/admin/students/add');
    } finally {
        conn.release();
    }
});

// View Student 360° Profile & Documents
router.get('/:id', async (req, res) => {
    try {
        const studentId = req.params.id;
        const [students] = await pool.query(
            `SELECT s.*, c.class_name, sec.section_name, tr.route_name, tr.vehicle_number, u.username as app_username 
             FROM students s 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             LEFT JOIN transport_routes tr ON s.transport_route_id = tr.id 
             LEFT JOIN users u ON s.user_id = u.id 
             WHERE s.id = ?`,
            [studentId]
        );

        if (students.length === 0) {
            req.session.flash_error = 'Student not found.';
            return res.redirect('/admin/students');
        }
        const student = students[0];

        // Documents
        const [documents] = await pool.query(
            `SELECT * FROM student_documents WHERE student_id = ? ORDER BY uploaded_at DESC`,
            [studentId]
        );

        // Attendance stats
        const [attStats] = await pool.query(
            `SELECT status, COUNT(*) as count FROM attendance WHERE student_id = ? GROUP BY status`,
            [studentId]
        );
        let totalDays = 0, presentDays = 0, absentDays = 0;
        attStats.forEach(a => {
            totalDays += a.count;
            if (a.status === 'Present') presentDays += a.count;
            if (a.status === 'Absent') absentDays += a.count;
        });
        const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

        // Recent 10 attendance records
        const [recentAttendance] = await pool.query(
            `SELECT * FROM attendance WHERE student_id = ? ORDER BY attendance_date DESC LIMIT 10`,
            [studentId]
        );

        // Fee Dues & Receipts
        const [feeDues] = await pool.query(
            `SELECT * FROM student_fee_dues WHERE student_id = ? ORDER BY due_date DESC`,
            [studentId]
        );
        const [receipts] = await pool.query(
            `SELECT * FROM fee_receipts WHERE student_id = ? ORDER BY payment_date DESC`,
            [studentId]
        );

        // Exam Results
        const [results] = await pool.query(
            `SELECT er.*, e.exam_name, sub.subject_name, es.max_marks 
             FROM exam_results er 
             JOIN exams e ON er.exam_id = e.id 
             JOIN exam_schedules es ON er.exam_schedule_id = es.id 
             JOIN subjects sub ON es.subject_id = sub.id 
             WHERE er.student_id = ? 
             ORDER BY e.created_at DESC`,
            [studentId]
        );

        res.render('admin/students/profile', {
            title: `${student.first_name} ${student.last_name} | Student Profile`,
            student,
            documents,
            attendance: { totalDays, presentDays, absentDays, rate: attendanceRate, recent: recentAttendance },
            feeDues,
            receipts,
            results
        });
    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).send('Error loading student profile');
    }
});

// Upload Document for Student
router.post('/:id/documents', upload.single('document_file'), async (req, res) => {
    try {
        const studentId = req.params.id;
        const { doc_type, doc_title } = req.body;
        const redirectTarget = (req.body.redirect_to === 'edit' || req.query.from === 'edit')
            ? `/admin/students/${studentId}/edit#documents`
            : `/admin/students/${studentId}#documents`;

        if (!req.file) {
            req.session.flash_error = 'Please select a valid document file to upload.';
            return res.redirect(redirectTarget);
        }

        const file_url = `/uploads/documents/${req.file.filename}`;
        const file_size = `${(req.file.size / 1024).toFixed(1)} KB`;

        await pool.query(
            `INSERT INTO student_documents (student_id, doc_type, doc_title, file_url, file_size) 
             VALUES (?, ?, ?, ?, ?)`,
            [studentId, doc_type, doc_title || doc_type, file_url, file_size]
        );

        req.session.flash_success = 'Document uploaded successfully!';
        res.redirect(redirectTarget);
    } catch (err) {
        console.error('Doc upload error:', err);
        const redirectTarget = (req.body.redirect_to === 'edit' || req.query.from === 'edit')
            ? `/admin/students/${req.params.id}/edit#documents`
            : `/admin/students/${req.params.id}#documents`;
        req.session.flash_error = 'Upload failed: ' + err.message;
        res.redirect(redirectTarget);
    }
});

// Delete Document
router.post('/:id/documents/:docId/delete', async (req, res) => {
    try {
        const { id, docId } = req.params;
        const redirectTarget = (req.body.from === 'edit' || req.query.from === 'edit')
            ? `/admin/students/${id}/edit#documents`
            : `/admin/students/${id}#documents`;
        await pool.query(`DELETE FROM student_documents WHERE id = ? AND student_id = ?`, [docId, id]);
        req.session.flash_success = 'Document deleted.';
        res.redirect(redirectTarget);
    } catch (err) {
        console.error(err);
        const redirectTarget = (req.body.from === 'edit' || req.query.from === 'edit')
            ? `/admin/students/${req.params.id}/edit#documents`
            : `/admin/students/${req.params.id}#documents`;
        res.redirect(redirectTarget);
    }
});

// GET Edit Student Form
router.get('/:id/edit', async (req, res) => {
    try {
        const [students] = await pool.query(`SELECT * FROM students WHERE id = ?`, [req.params.id]);
        if (students.length === 0) return res.redirect('/admin/students');

        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);
        const [routes] = await pool.query(`SELECT * FROM transport_routes WHERE status = 'active'`);
        const occupations = await getOccupationsList();
        const [documents] = await pool.query(
            `SELECT * FROM student_documents WHERE student_id = ? ORDER BY uploaded_at DESC`,
            [req.params.id]
        );

        res.render('admin/students/edit', {
            title: `Edit ${students[0].first_name} | Quantum Science Academy`,
            student: students[0],
            classes,
            sections,
            routes,
            occupations,
            documents
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/students');
    }
});

// POST Edit Student
router.post('/:id/edit', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'document_file', maxCount: 1 }]), async (req, res) => {
    try {
        const studentId = req.params.id;
        const {
            roll_no, biometric_id, first_name, last_name, gender, dob, blood_group,
            class_id, section_id, father_name, father_phone, father_occupation,
            mother_name, mother_phone, current_address, transport_route_id, status,
            srn_no, pen_no, aadhar_no, family_id, apaar_id,
            doc_type, doc_title
        } = req.body;

        const cleanFatherPhone = formatPhone(father_phone);
        const cleanMotherPhone = formatPhone(mother_phone);

        const photoFile = req.files && req.files['photo'] ? req.files['photo'][0] : null;
        const docFile = req.files && req.files['document_file'] ? req.files['document_file'][0] : null;

        let photoSql = '';
        const params = [
            roll_no || null, biometric_id ? biometric_id.trim() : null, first_name, last_name || '', gender, dob || null, blood_group,
            class_id, section_id, father_name, cleanFatherPhone, father_occupation || '',
            mother_name || '', cleanMotherPhone, current_address || '',
            transport_route_id ? transport_route_id : null, status || 'active',
            srn_no ? srn_no.trim() : null, pen_no ? pen_no.trim() : null,
            aadhar_no ? aadhar_no.trim() : null, family_id ? family_id.trim() : null,
            apaar_id ? apaar_id.trim() : null
        ];

        if (photoFile) {
            photoSql = ', photo_url = ?';
            params.push(`/uploads/students/${photoFile.filename}`);
        }
        params.push(studentId);

        await pool.query(
            `UPDATE students SET 
                roll_no = ?, biometric_id = ?, first_name = ?, last_name = ?, gender = ?, dob = ?, blood_group = ?,
                class_id = ?, section_id = ?, father_name = ?, father_phone = ?, father_occupation = ?,
                mother_name = ?, mother_phone = ?, current_address = ?, transport_route_id = ?, status = ?,
                srn_no = ?, pen_no = ?, aadhar_no = ?, family_id = ?, apaar_id = ?
                ${photoSql}
             WHERE id = ?`,
            params
        );

        // If a new document file was also uploaded
        if (docFile) {
            const file_url = `/uploads/documents/${docFile.filename}`;
            const file_size = `${(docFile.size / 1024).toFixed(1)} KB`;
            const finalType = doc_type || 'Other';
            const finalTitle = doc_title || finalType;

            await pool.query(
                `INSERT INTO student_documents (student_id, doc_type, doc_title, file_url, file_size) 
                 VALUES (?, ?, ?, ?, ?)`,
                [studentId, finalType, finalTitle, file_url, file_size]
            );
        }

        req.session.flash_success = 'Student profile updated successfully!';
        res.redirect(`/admin/students/${studentId}/edit`);
    } catch (err) {
        console.error('Update error:', err);
        req.session.flash_error = 'Failed to update student: ' + err.message;
        res.redirect(`/admin/students/${req.params.id}/edit`);
    }
});

// Delete Student
router.post('/:id/delete', async (req, res) => {
    try {
        const studentId = req.params.id;
        const [studentRows] = await pool.query(
            `SELECT id, first_name, last_name, admission_no, user_id FROM students WHERE id = ?`,
            [studentId]
        );

        if (studentRows.length === 0) {
            req.session.flash_error = 'Student record not found.';
            return res.redirect('/admin/students');
        }

        const student = studentRows[0];
        const studentName = `${student.first_name} ${student.last_name || ''}`.trim();

        try {
            // First attempt clean hard delete (removes documents & linked user)
            await pool.query(`DELETE FROM student_documents WHERE student_id = ?`, [studentId]);
            await pool.query(`DELETE FROM students WHERE id = ?`, [studentId]);
            if (student.user_id) {
                await pool.query(`DELETE FROM users WHERE id = ?`, [student.user_id]);
            }
        } catch (fkErr) {
            // If historical foreign keys exist (e.g. attendance, fee transactions), soft delete safely
            await pool.query(
                `UPDATE students SET status = 'deleted', biometric_id = NULL, updated_at = NOW() WHERE id = ?`,
                [studentId]
            );
            if (student.user_id) {
                await pool.query(`UPDATE users SET status = 'inactive' WHERE id = ?`, [student.user_id]);
            }
        }

        req.session.flash_success = `Student "${studentName}" (Admission: ${student.admission_no}) deleted successfully.`;
        res.redirect('/admin/students');
    } catch (err) {
        console.error('Delete student error:', err);
        req.session.flash_error = 'Failed to delete student: ' + err.message;
        res.redirect('/admin/students');
    }
});

// Change Student / Parent App Password
router.post('/:id/change-password', async (req, res) => {
    try {
        const studentId = req.params.id;
        const { new_password } = req.body;

        if (!new_password || new_password.trim().length < 4) {
            req.session.flash_error = 'Password must be at least 4 characters long.';
            return res.redirect(req.headers.referer || `/admin/students/${studentId}`);
        }

        const [sRows] = await pool.query(
            `SELECT s.*, u.username as current_username 
             FROM students s 
             LEFT JOIN users u ON s.user_id = u.id 
             WHERE s.id = ?`,
            [studentId]
        );

        if (sRows.length === 0) {
            req.session.flash_error = 'Student record not found.';
            return res.redirect('/admin/students');
        }

        const student = sRows[0];
        const passHash = await bcrypt.hash(new_password.trim(), 10);

        if (student.user_id) {
            // Update existing user password
            await pool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [passHash, student.user_id]);
        } else {
            // If student had no user account yet, create one now!
            const appUsername = (student.admission_no || `stu${student.id}`).toLowerCase().replace(/[^a-z0-9]/g, '');
            const [newUser] = await pool.query(
                `INSERT INTO users (name, username, phone, password_hash, role) 
                 VALUES (?, ?, ?, ?, 'student')`,
                [`${student.first_name} ${student.last_name || ''}`.trim(), appUsername, student.father_phone, passHash]
            );
            await pool.query(`UPDATE students SET user_id = ? WHERE id = ?`, [newUser.insertId, student.id]);
        }

        req.session.flash_success = `Parent / Student App password for "${student.first_name} ${student.last_name}" (Adm No: ${student.admission_no}) updated successfully!`;
        res.redirect(req.headers.referer || `/admin/students/${studentId}`);
    } catch (err) {
        console.error('Password change error:', err);
        req.session.flash_error = 'Failed to update parent/student password: ' + err.message;
        res.redirect('/admin/students');
    }
});

module.exports = router;
