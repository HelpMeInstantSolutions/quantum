const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// Helper function: Convert number to Indian currency words
function numberToWords(num) {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    num = Math.floor(num);
    if ((num = num.toString()).length > 9) return 'overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.trim() + ' Rupees Only';
}

// Receipts List
router.get('/', async (req, res) => {
    try {
        const { search, from_date, to_date } = req.query;

        let query = `
            SELECT r.*, s.first_name, s.last_name, s.admission_no, s.roll_no, c.class_name, sec.section_name, u.name as cashier_name
            FROM fee_receipts r
            JOIN students s ON r.student_id = s.id
            JOIN classes c ON s.class_id = c.id
            JOIN sections sec ON s.section_id = sec.id
            LEFT JOIN users u ON r.collected_by_user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (r.receipt_no LIKE ? OR s.first_name LIKE ? OR s.admission_no LIKE ?) `;
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }
        if (from_date) {
            query += ` AND r.payment_date >= ? `;
            params.push(from_date);
        }
        if (to_date) {
            query += ` AND r.payment_date <= ? `;
            params.push(to_date);
        }

        query += ` ORDER BY r.payment_date DESC, r.id DESC LIMIT 100`;

        const [receipts] = await pool.query(query, params);

        res.render('admin/receipts/index', {
            title: 'Fee Receipts Register | Star Academy Rohtak',
            receipts,
            search,
            from_date,
            to_date
        });
    } catch (err) {
        console.error('Receipts list error:', err);
        res.status(500).send('Error loading receipts');
    }
});

// Printable Fee Receipt (Slip format)
router.get('/:id/print', async (req, res) => {
    try {
        const receiptId = req.params.id;

        const [receiptRows] = await pool.query(
            `SELECT r.*, s.first_name, s.last_name, s.admission_no, s.roll_no, s.father_name, s.father_phone,
                    c.class_name, sec.section_name, u.name as cashier_name
             FROM fee_receipts r
             JOIN students s ON r.student_id = s.id
             JOIN classes c ON s.class_id = c.id
             JOIN sections sec ON s.section_id = sec.id
             LEFT JOIN users u ON r.collected_by_user_id = u.id
             WHERE r.id = ?`,
            [receiptId]
        );

        if (receiptRows.length === 0) {
            req.session.flash_error = 'Receipt not found.';
            return res.redirect('/admin/receipts');
        }
        const receipt = receiptRows[0];

        // Receipt item breakdown
        const [items] = await pool.query(
            `SELECT * FROM fee_receipt_items WHERE receipt_id = ?`,
            [receiptId]
        );

        // Remaining balance of student
        const [[{ current_balance }]] = await pool.query(
            `SELECT COALESCE(SUM(balance_amount), 0) as current_balance 
             FROM student_fee_dues 
             WHERE student_id = ? AND status != 'paid'`,
            [receipt.student_id]
        );

        const amountInWords = numberToWords(receipt.amount_paid);

        res.render('admin/receipts/print', {
            title: `Fee Slip - ${receipt.receipt_no} | Star Academy Rohtak`,
            receipt,
            items,
            current_balance: Number(current_balance).toLocaleString('en-IN'),
            amountInWords
        });
    } catch (err) {
        console.error('Print receipt error:', err);
        res.status(500).send('Error rendering receipt slip');
    }
});

module.exports = router;
