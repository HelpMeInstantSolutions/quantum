const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// Fees Overview Dashboard
router.get('/', async (req, res) => {
    try {
        const [[{ total_collected }]] = await pool.query(
            `SELECT COALESCE(SUM(amount_paid), 0) as total_collected FROM fee_receipts`
        );
        const [[{ total_pending }]] = await pool.query(
            `SELECT COALESCE(SUM(balance_amount), 0) as total_pending FROM student_fee_dues WHERE status != 'paid'`
        );
        const [[{ total_structures }]] = await pool.query(
            `SELECT COUNT(*) as total_structures FROM fee_types`
        );

        // Recent receipts
        const [recentReceipts] = await pool.query(
            `SELECT r.*, s.first_name, s.last_name, s.admission_no, c.class_name, sec.section_name 
             FROM fee_receipts r 
             JOIN students s ON r.student_id = s.id 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             ORDER BY r.created_at DESC LIMIT 10`
        );

        res.render('admin/fees/index', {
            title: 'Fees Management & Overview | Star Academy Rohtak',
            stats: {
                totalCollected: Number(total_collected).toLocaleString('en-IN'),
                totalPending: Number(total_pending).toLocaleString('en-IN'),
                totalStructures: total_structures
            },
            recentReceipts
        });
    } catch (err) {
        console.error('Fees overview error:', err);
        res.status(500).send('Error loading fees dashboard');
    }
});

// Fee Structures (Whole school, Class, Section, or Student!)
router.get('/structures', async (req, res) => {
    try {
        const [structures] = await pool.query(
            `SELECT ft.*, c.class_name, sec.section_name, s.first_name, s.last_name, s.admission_no 
             FROM fee_types ft 
             LEFT JOIN classes c ON ft.class_id = c.id 
             LEFT JOIN sections sec ON ft.section_id = sec.id 
             LEFT JOIN students s ON ft.student_id = s.id 
             ORDER BY ft.created_at DESC`
        );

        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        const [sections] = await pool.query(`SELECT * FROM sections ORDER BY section_name ASC`);
        const [students] = await pool.query(
            `SELECT id, admission_no, first_name, last_name FROM students WHERE status = 'active' ORDER BY first_name ASC`
        );

        res.render('admin/fees/structures', {
            title: 'Fee Structures & Types | Star Academy Rohtak',
            structures,
            classes,
            sections,
            students
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/fees');
    }
});

// POST Create Fee Structure
router.post('/structures/create', async (req, res) => {
    try {
        const { fee_name, applies_to, class_id, section_id, student_id, amount, frequency, due_day } = req.body;

        if (!fee_name || !amount || isNaN(amount)) {
            req.session.flash_error = 'Please enter a valid Fee Name and Amount.';
            return res.redirect('/admin/fees/structures');
        }

        await pool.query(
            `INSERT INTO fee_types (fee_name, applies_to, class_id, section_id, student_id, amount, frequency, due_day) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                fee_name.trim(),
                applies_to || 'whole_school',
                applies_to === 'class' || applies_to === 'section' ? class_id : null,
                applies_to === 'section' ? section_id : null,
                applies_to === 'student' ? student_id : null,
                parseFloat(amount),
                frequency || 'monthly',
                due_day || 10
            ]
        );

        req.session.flash_success = `Fee type "${fee_name}" created successfully (Scope: ${applies_to.replace('_', ' ').toUpperCase()})!`;
        res.redirect('/admin/fees/structures');
    } catch (err) {
        console.error('Create structure error:', err);
        req.session.flash_error = 'Failed to create fee structure: ' + err.message;
        res.redirect('/admin/fees/structures');
    }
});

// Delete Fee Structure
router.post('/structures/:id/delete', async (req, res) => {
    try {
        await pool.query(`DELETE FROM fee_types WHERE id = ?`, [req.params.id]);
        req.session.flash_success = 'Fee structure deleted.';
        res.redirect('/admin/fees/structures');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/fees/structures');
    }
});

// POST Generate Dues for Students from a Fee Structure
router.post('/generate-dues', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { fee_type_id, month_year, due_date } = req.body;
        if (!fee_type_id || !month_year || !due_date) {
            req.session.flash_error = 'Please select fee structure, target month, and due date.';
            return res.redirect('/admin/fees/structures');
        }

        const [ftRows] = await conn.query(`SELECT * FROM fee_types WHERE id = ?`, [fee_type_id]);
        if (ftRows.length === 0) {
            req.session.flash_error = 'Fee structure not found.';
            return res.redirect('/admin/fees/structures');
        }
        const ft = ftRows[0];

        // Find matching students
        let studentQuery = `SELECT id FROM students WHERE status = 'active'`;
        const params = [];

        if (ft.applies_to === 'class') {
            studentQuery += ` AND class_id = ?`;
            params.push(ft.class_id);
        } else if (ft.applies_to === 'section') {
            studentQuery += ` AND class_id = ? AND section_id = ?`;
            params.push(ft.class_id, ft.section_id);
        } else if (ft.applies_to === 'student') {
            studentQuery += ` AND id = ?`;
            params.push(ft.student_id);
        }

        const [targetStudents] = await conn.query(studentQuery, params);
        let generatedCount = 0;

        for (const st of targetStudents) {
            // Check if already generated for this student & fee type & month
            const [ex] = await conn.query(
                `SELECT id FROM student_fee_dues WHERE student_id = ? AND fee_type_id = ? AND month_year = ?`,
                [st.id, ft.id, month_year]
            );

            if (ex.length === 0) {
                await conn.query(
                    `INSERT INTO student_fee_dues (student_id, fee_type_id, fee_title, month_year, amount, net_amount, balance_amount, due_date, status) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                    [
                        st.id,
                        ft.id,
                        `${ft.fee_name} (${month_year})`,
                        month_year,
                        ft.amount,
                        ft.amount,
                        ft.amount,
                        due_date
                    ]
                );
                generatedCount++;
            }
        }

        await conn.commit();
        req.session.flash_success = `Generated dues for ${generatedCount} students (${month_year}) successfully!`;
        res.redirect('/admin/fees/structures');
    } catch (err) {
        await conn.rollback();
        console.error('Generate dues error:', err);
        req.session.flash_error = 'Failed to generate dues: ' + err.message;
        res.redirect('/admin/fees/structures');
    } finally {
        conn.release();
    }
});

// GET Collect Fee Interface
router.get('/collect', async (req, res) => {
    try {
        const student_id = req.query.student_id;
        let student = null;
        let pendingDues = [];

        if (student_id) {
            const [sRows] = await pool.query(
                `SELECT s.*, c.class_name, sec.section_name 
                 FROM students s 
                 JOIN classes c ON s.class_id = c.id 
                 JOIN sections sec ON s.section_id = sec.id 
                 WHERE s.id = ?`,
                [student_id]
            );
            if (sRows.length > 0) {
                student = sRows[0];
                const [dRows] = await pool.query(
                    `SELECT * FROM student_fee_dues 
                     WHERE student_id = ? AND status != 'paid' 
                     ORDER BY due_date ASC`,
                    [student_id]
                );
                pendingDues = dRows;
            }
        }

        const [studentsList] = await pool.query(
            `SELECT s.id, s.admission_no, s.roll_no, s.first_name, s.last_name, c.class_name, sec.section_name 
             FROM students s 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             WHERE s.status = 'active' 
             ORDER BY c.numeric_level ASC, s.first_name ASC`
        );

        res.render('admin/fees/collect', {
            title: 'Collect Student Fees | Star Academy Rohtak',
            studentsList,
            student,
            student_id,
            pendingDues
        });
    } catch (err) {
        console.error('Collect fee error:', err);
        res.status(500).send('Error loading fee collection');
    }
});

// POST Process Fee Collection & Issue Receipt
router.post('/collect', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const {
            student_id, selected_dues, amount_paid, payment_mode,
            transaction_reference, discount_given, fine_included, remarks
        } = req.body;

        if (!student_id || !amount_paid || parseFloat(amount_paid) <= 0) {
            req.session.flash_error = 'Please enter a valid payment amount.';
            return res.redirect(`/admin/fees/collect?student_id=${student_id}`);
        }

        // Generate receipt number
        const [[{ max_receipt }]] = await conn.query(`SELECT COALESCE(MAX(id), 0) + 1 as max_receipt FROM fee_receipts`);
        const receiptNo = `STAR/2026/${String(max_receipt).padStart(4, '0')}`;

        const paid = parseFloat(amount_paid);
        const discount = discount_given ? parseFloat(discount_given) : 0.00;
        const fine = fine_included ? parseFloat(fine_included) : 0.00;

        // Insert receipt
        const [rcRes] = await conn.query(
            `INSERT INTO fee_receipts (receipt_no, student_id, payment_date, amount_paid, payment_mode, transaction_reference, discount_given, fine_included, remarks, collected_by_user_id) 
             VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?)`,
            [
                receiptNo, student_id, paid, payment_mode || 'Cash',
                transaction_reference || null, discount, fine,
                remarks || '', req.session.user.id
            ]
        );
        const receiptId = rcRes.insertId;

        // Allocate payment to dues
        let duesToPay = [];
        if (selected_dues) {
            const dueIds = Array.isArray(selected_dues) ? selected_dues : [selected_dues];
            const [rows] = await conn.query(
                `SELECT * FROM student_fee_dues WHERE id IN (?) AND student_id = ?`,
                [dueIds, student_id]
            );
            duesToPay = rows;
        } else {
            const [rows] = await conn.query(
                `SELECT * FROM student_fee_dues WHERE student_id = ? AND status != 'paid' ORDER BY due_date ASC`,
                [student_id]
            );
            duesToPay = rows;
        }

        let remainingPaid = paid;
        for (const due of duesToPay) {
            if (remainingPaid <= 0) break;

            const allocation = Math.min(Number(due.balance_amount), remainingPaid);
            const newPaid = Number(due.paid_amount) + allocation;
            const newBalance = Number(due.balance_amount) - allocation;
            const newStatus = newBalance <= 0.01 ? 'paid' : 'partially_paid';

            await conn.query(
                `UPDATE student_fee_dues SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?`,
                [newPaid, Math.max(0, newBalance), newStatus, due.id]
            );

            await conn.query(
                `INSERT INTO fee_receipt_items (receipt_id, student_fee_due_id, fee_title, amount) VALUES (?, ?, ?, ?)`,
                [receiptId, due.id, due.fee_title, allocation]
            );

            remainingPaid -= allocation;
        }

        await conn.commit();
        req.session.flash_success = `Payment of ₹${paid.toLocaleString('en-IN')} recorded! Receipt ${receiptNo} issued.`;
        res.redirect(`/admin/receipts/${receiptId}/print`);
    } catch (err) {
        await conn.rollback();
        console.error('Payment collection error:', err);
        req.session.flash_error = 'Payment collection failed: ' + err.message;
        res.redirect(`/admin/fees/collect?student_id=${req.body.student_id}`);
    } finally {
        conn.release();
    }
});

module.exports = router;
