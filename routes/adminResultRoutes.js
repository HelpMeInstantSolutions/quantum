const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// Exams List
router.get('/', async (req, res) => {
    try {
        const { class_id, exam_type } = req.query;
        let query = `
            SELECT e.*, c.class_name, 
                   COUNT(DISTINCT es.id) as subjects_count,
                   COUNT(DISTINCT er.id) as marks_entered_count
            FROM exams e
            JOIN classes c ON e.class_id = c.id
            LEFT JOIN exam_schedules es ON e.id = es.exam_id
            LEFT JOIN exam_results er ON e.id = er.exam_id
            WHERE 1=1
        `;
        const params = [];
        if (class_id) {
            query += ` AND e.class_id = ? `;
            params.push(class_id);
        }
        if (exam_type) {
            query += ` AND e.exam_type = ? `;
            params.push(exam_type);
        }
        query += ` GROUP BY e.id ORDER BY e.created_at DESC`;

        const [exams] = await pool.query(query, params);
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);

        res.render('admin/results/index', {
            title: 'Exams & Results Management | Quantum Science Academy',
            exams,
            classes,
            filters: { class_id, exam_type }
        });
    } catch (err) {
        console.error('Results overview error:', err);
        res.status(500).send('Error loading exams');
    }
});

// GET Create Exam Form
router.get('/exams/create', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        res.render('admin/results/create_exam', {
            title: 'Create New Exam or Test | Quantum Science Academy',
            classes
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/results');
    }
});

// Helper API: Get subjects for a class
router.get('/api/class-subjects/:classId', async (req, res) => {
    try {
        const [subjects] = await pool.query(`SELECT * FROM subjects WHERE class_id = ? ORDER BY subject_name ASC`, [req.params.classId]);
        res.json({ success: true, subjects });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST Create Exam
router.post('/exams/create', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { exam_name, exam_type, session_year, class_id, start_date, end_date, subjects } = req.body;
        // subjects is array of { subject_id, exam_date, max_marks, pass_marks }

        if (!exam_name || !class_id) {
            req.session.flash_error = 'Please provide Exam Name and select Class.';
            return res.redirect('/admin/results/exams/create');
        }

        const [insExam] = await conn.query(
            `INSERT INTO exams (exam_name, exam_type, session_year, class_id, start_date, end_date, status) 
             VALUES (?, ?, ?, ?, ?, ?, 'published')`,
            [
                exam_name.trim(),
                exam_type || 'unit_test',
                session_year || '2026-2027',
                class_id,
                start_date || null,
                end_date || null
            ]
        );
        const examId = insExam.insertId;

        // Schedule subjects
        if (Array.isArray(subjects) && subjects.length > 0) {
            for (const sub of subjects) {
                if (sub.subject_id) {
                    await conn.query(
                        `INSERT INTO exam_schedules (exam_id, subject_id, exam_date, max_marks, pass_marks) 
                         VALUES (?, ?, ?, ?, ?)`,
                        [
                            examId,
                            sub.subject_id,
                            sub.exam_date || start_date || new Date().toISOString().split('T')[0],
                            sub.max_marks || 50,
                            sub.pass_marks || 17
                        ]
                    );
                }
            }
        } else {
            // Automatically schedule all subjects of this class with default 50 marks
            const [classSubs] = await conn.query(`SELECT id FROM subjects WHERE class_id = ?`, [class_id]);
            for (const cs of classSubs) {
                await conn.query(
                    `INSERT INTO exam_schedules (exam_id, subject_id, exam_date, max_marks, pass_marks) 
                     VALUES (?, ?, ?, 50.00, 17.00)`,
                    [examId, cs.id, start_date || new Date().toISOString().split('T')[0]]
                );
            }
        }

        await conn.commit();
        req.session.flash_success = `Exam "${exam_name}" created successfully! You can now enter marks using the Bulk Matrix.`;
        res.redirect(`/admin/results/marks-matrix?exam_id=${examId}`);
    } catch (err) {
        await conn.rollback();
        console.error('Create exam error:', err);
        req.session.flash_error = 'Failed to create exam: ' + err.message;
        res.redirect('/admin/results/exams/create');
    } finally {
        conn.release();
    }
});

// 🌟 Ultra-Fast Bulk Marks Entry Matrix
router.get('/marks-matrix', async (req, res) => {
    try {
        const [exams] = await pool.query(
            `SELECT e.*, c.class_name FROM exams e JOIN classes c ON e.class_id = c.id ORDER BY e.created_at DESC`
        );

        const exam_id = req.query.exam_id || (exams.length > 0 ? exams[0].id : null);

        let selectedExam = null;
        let schedules = [];
        let schedule_id = req.query.schedule_id;
        let selectedSchedule = null;
        let studentsWithMarks = [];

        if (exam_id) {
            selectedExam = exams.find(e => e.id == exam_id);
            // Fetch schedules (subjects) for this exam
            const [schedRows] = await pool.query(
                `SELECT es.*, s.subject_name, s.subject_code 
                 FROM exam_schedules es 
                 JOIN subjects s ON es.subject_id = s.id 
                 WHERE es.exam_id = ? 
                 ORDER BY es.exam_date ASC, s.subject_name ASC`,
                [exam_id]
            );
            schedules = schedRows;

            if (!schedule_id && schedules.length > 0) {
                schedule_id = schedules[0].id;
            }

            if (schedule_id) {
                selectedSchedule = schedules.find(s => s.id == schedule_id);

                // Fetch all students of this class with their existing marks for this schedule
                const [stuRows] = await pool.query(
                    `SELECT st.id as student_id, st.admission_no, st.roll_no, st.first_name, st.last_name, sec.section_name,
                            er.id as result_id, er.marks_obtained, er.is_absent, er.grade, er.remarks
                     FROM students st 
                     JOIN sections sec ON st.section_id = sec.id 
                     LEFT JOIN exam_results er ON st.id = er.student_id AND er.exam_schedule_id = ?
                     WHERE st.class_id = ? AND st.status = 'active'
                     ORDER BY sec.section_name ASC, st.roll_no ASC, st.first_name ASC`,
                    [schedule_id, selectedExam.class_id]
                );
                studentsWithMarks = stuRows;
            }
        }

        res.render('admin/results/marks_matrix', {
            title: 'Effortless Bulk Marks Entry Matrix | Quantum Science Academy',
            exams,
            selectedExam,
            exam_id,
            schedules,
            schedule_id,
            selectedSchedule,
            studentsWithMarks
        });
    } catch (err) {
        console.error('Marks matrix error:', err);
        res.status(500).send('Error loading marks matrix');
    }
});

// Helper for Grade calculation
function calculateGrade(marks, maxMarks) {
    if (!marks || isNaN(marks) || maxMarks <= 0) return 'E';
    const pct = (Number(marks) / Number(maxMarks)) * 100;
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B+';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C+';
    if (pct >= 33) return 'C';
    return 'D (Needs Improvement)';
}

// POST Save Bulk Marks Matrix
router.post('/marks-matrix/save', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { exam_id, exam_schedule_id, marks, is_absent, remarks } = req.body;
        // marks: { [student_id]: number }
        // is_absent: { [student_id]: '1' }
        // remarks: { [student_id]: string }

        if (!exam_id || !exam_schedule_id || !marks) {
            req.session.flash_error = 'Invalid submission data for marks entry.';
            return res.redirect('/admin/results/marks-matrix');
        }

        // Fetch max marks for auto-grade
        const [[sched]] = await conn.query(`SELECT max_marks FROM exam_schedules WHERE id = ?`, [exam_schedule_id]);
        const maxMarks = sched ? sched.max_marks : 100;

        let savedCount = 0;
        for (const [studentId, rawMark] of Object.entries(marks)) {
            const absent = is_absent && is_absent[studentId] ? 1 : 0;
            const score = absent ? 0.00 : (rawMark !== '' && !isNaN(rawMark) ? parseFloat(rawMark) : 0.00);
            const grade = absent ? 'AB' : calculateGrade(score, maxMarks);
            const rem = remarks && remarks[studentId] ? remarks[studentId].trim() : '';

            await conn.query(
                `INSERT INTO exam_results (exam_id, exam_schedule_id, student_id, marks_obtained, is_absent, grade, remarks, entered_by_user_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE marks_obtained = VALUES(marks_obtained), is_absent = VALUES(is_absent), 
                 grade = VALUES(grade), remarks = VALUES(remarks), entered_by_user_id = VALUES(entered_by_user_id)`,
                [exam_id, exam_schedule_id, studentId, score, absent, grade, rem, req.session.user.id]
            );
            savedCount++;
        }

        await conn.commit();
        req.session.flash_success = `Successfully saved marks for ${savedCount} students in 1-click!`;
        res.redirect(`/admin/results/marks-matrix?exam_id=${exam_id}&schedule_id=${exam_schedule_id}`);
    } catch (err) {
        await conn.rollback();
        console.error('Save marks error:', err);
        req.session.flash_error = 'Failed to save marks: ' + err.message;
        res.redirect(`/admin/results/marks-matrix?exam_id=${req.body.exam_id}&schedule_id=${req.body.exam_schedule_id}`);
    } finally {
        conn.release();
    }
});

// View Printable Student Report Card
router.get('/report-card/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const examId = req.query.exam_id;

        const [students] = await pool.query(
            `SELECT s.*, c.class_name, sec.section_name 
             FROM students s 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             WHERE s.id = ?`,
            [studentId]
        );
        if (students.length === 0) return res.redirect('/admin/results');
        const student = students[0];

        let query = `
            SELECT er.*, es.max_marks, es.pass_marks, es.exam_date, sub.subject_name, sub.subject_code, e.exam_name, e.exam_type, e.session_year
            FROM exam_results er
            JOIN exam_schedules es ON er.exam_schedule_id = es.id
            JOIN subjects sub ON es.subject_id = sub.id
            JOIN exams e ON er.exam_id = e.id
            WHERE er.student_id = ?
        `;
        const params = [studentId];
        if (examId) {
            query += ` AND er.exam_id = ?`;
            params.push(examId);
        }
        query += ` ORDER BY e.created_at DESC, sub.subject_name ASC`;

        const [marksList] = await pool.query(query, params);

        let totalMax = 0, totalObtained = 0;
        marksList.forEach(m => {
            totalMax += Number(m.max_marks);
            totalObtained += Number(m.marks_obtained);
        });
        const overallPercentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : 0;
        const overallGrade = calculateGrade(totalObtained, totalMax);

        res.render('admin/results/report_card', {
            title: `Report Card - ${student.first_name} ${student.last_name} | Quantum Science Academy`,
            student,
            marksList,
            totalMax,
            totalObtained,
            overallPercentage,
            overallGrade,
            examName: marksList[0]?.exam_name || 'Academic Assessment'
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/results');
    }
});

module.exports = router;
