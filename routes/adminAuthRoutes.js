const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// GET Admin Login Page
router.get('/login', (req, res) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', {
        title: 'Admin Portal Login | Quantum Science Academy',
        error: req.session.login_error || null
    });
    delete req.session.login_error;
});

// POST Admin Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            req.session.login_error = 'Please enter both username and password.';
            return res.redirect('/admin/login');
        }

        const [rows] = await pool.query(
            `SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1`,
            [username.trim(), username.trim()]
        );

        if (rows.length === 0) {
            req.session.login_error = 'Invalid credentials. User not found.';
            return res.redirect('/admin/login');
        }

        const user = rows[0];

        // Check if role is admin
        if (user.role !== 'admin') {
            req.session.login_error = `Access Denied: Web panel is strictly for School Administrators. ${user.role.toUpperCase()} accounts must log in using the Quantum Science Academy Android App.`;
            return res.redirect('/admin/login');
        }

        if (!user.status) {
            req.session.login_error = 'Your admin account has been deactivated. Please contact support.';
            return res.redirect('/admin/login');
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            req.session.login_error = 'Incorrect password. Please try again.';
            return res.redirect('/admin/login');
        }

        // Set session
        req.session.user = {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar_url: user.avatar_url
        };

        const returnTo = req.session.returnTo || '/admin/dashboard';
        delete req.session.returnTo;
        return res.redirect(returnTo);

    } catch (err) {
        console.error('Admin login error:', err);
        req.session.login_error = 'An internal error occurred during authentication.';
        res.redirect('/admin/login');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
});

module.exports = router;
