const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// List Notifications
router.get('/', async (req, res) => {
    try {
        const { category, target_role } = req.query;
        let query = `
            SELECT n.*, c.class_name, sec.section_name, u.name as sender_name 
            FROM notifications n 
            LEFT JOIN classes c ON n.class_id = c.id 
            LEFT JOIN sections sec ON n.section_id = sec.id 
            LEFT JOIN users u ON n.sender_user_id = u.id 
            WHERE 1=1 
        `;
        const params = [];
        if (category) {
            query += ` AND n.category = ? `;
            params.push(category);
        }
        if (target_role) {
            query += ` AND n.target_role = ? `;
            params.push(target_role);
        }
        query += ` ORDER BY n.is_pinned DESC, n.created_at DESC`;

        const [notifications] = await pool.query(query, params);
        res.render('admin/notifications/index', {
            title: 'School Notifications & Circulars | Quantum Science Academy',
            notifications,
            category,
            target_role
        });
    } catch (err) {
        console.error('Notifications list error:', err);
        res.status(500).send('Error loading notifications');
    }
});

// GET Create Notification Form
router.get('/create', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        res.render('admin/notifications/create', {
            title: 'Publish New Notification | Quantum Science Academy',
            classes
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/notifications');
    }
});

// POST Create Notification
router.post('/create', async (req, res) => {
    try {
        const { title, message, category, target_role, class_id, is_pinned } = req.body;

        if (!title || !message) {
            req.session.flash_error = 'Please provide both title and announcement message.';
            return res.redirect('/admin/notifications/create');
        }

        await pool.query(
            `INSERT INTO notifications (title, message, category, target_role, class_id, sender_user_id, is_pinned) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                title.trim(),
                message.trim(),
                category || 'general',
                target_role || 'all',
                class_id ? class_id : null,
                req.session.user.id,
                is_pinned ? 1 : 0
            ]
        );

        req.session.flash_success = 'Announcement broadcasted successfully to the mobile app & web feed!';
        res.redirect('/admin/notifications');
    } catch (err) {
        console.error('Create notification error:', err);
        req.session.flash_error = 'Failed to publish notification: ' + err.message;
        res.redirect('/admin/notifications/create');
    }
});

// Delete Notification
router.post('/:id/delete', async (req, res) => {
    try {
        await pool.query(`DELETE FROM notifications WHERE id = ?`, [req.params.id]);
        req.session.flash_success = 'Notification removed.';
        res.redirect('/admin/notifications');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/notifications');
    }
});

module.exports = router;
