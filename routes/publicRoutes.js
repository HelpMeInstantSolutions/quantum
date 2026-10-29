const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Homepage (SEO Optimized)
router.get('/', async (req, res) => {
    try {
        // Fetch pinned / recent notices
        const [notices] = await pool.query(
            `SELECT * FROM notifications 
             WHERE target_role IN ('all', 'student', 'parent') 
             ORDER BY is_pinned DESC, created_at DESC LIMIT 6`
        );

        // Fetch classes
        const [classes] = await pool.query(
            `SELECT c.*, COUNT(s.id) as student_count 
             FROM classes c 
             LEFT JOIN students s ON c.id = s.class_id AND s.status = 'active'
             GROUP BY c.id ORDER BY c.numeric_level ASC LIMIT 6`
        );

        // Fetch transport stats
        const [routes] = await pool.query(`SELECT COUNT(*) as total_routes FROM transport_routes`);
        
        // Fetch teachers
        const [teachers] = await pool.query(
            `SELECT t.*, u.name, u.avatar_url 
             FROM teachers t 
             JOIN users u ON t.user_id = u.id 
             LIMIT 4`
        );

        res.render('public/home', {
            title: 'Star Academy Rohtak | Premier School & Coaching Institute',
            metaDescription: 'Star Academy Rohtak is a premier educational institution in Haryana offering HBSE & CBSE board schooling with integrated NEET & JEE foundation for Classes Nursery to 12th.',
            metaKeywords: 'Star Academy Rohtak, best school in Rohtak, CBSE school Rohtak, HBSE coaching, NEET foundation, JEE coaching Rohtak',
            notices,
            classes,
            teachers,
            totalRoutes: routes[0]?.total_routes || 4
        });
    } catch (err) {
        console.error('Home page error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// About Page
router.get('/about', (req, res) => {
    res.render('public/about', {
        title: 'About Us | Star Academy Rohtak',
        metaDescription: 'Learn about Star Academy Rohtak history, visionary leadership, mission, and academic excellence in Haryana.'
    });
});

// Academics Page
router.get('/academics', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        res.render('public/academics', {
            title: 'Academic Programs & Curriculum | Star Academy Rohtak',
            metaDescription: 'Explore our academic programs from Primary to Senior Secondary Science, Commerce and Arts with Board exam excellence.',
            classes
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

// Admissions Page
router.get('/admissions', async (req, res) => {
    try {
        const [classes] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        res.render('public/admissions', {
            title: 'Admissions 2026-27 | Star Academy Rohtak',
            metaDescription: 'Admission open for session 2026-27 at Star Academy Rohtak. Register online or download admission form.',
            classes
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

// Notices & Circulars Page
router.get('/notices', async (req, res) => {
    try {
        const [notices] = await pool.query(
            `SELECT * FROM notifications 
             WHERE target_role IN ('all', 'student', 'parent') 
             ORDER BY is_pinned DESC, created_at DESC LIMIT 30`
        );
        res.render('public/notices', {
            title: 'Notices & Announcements | Star Academy Rohtak',
            metaDescription: 'Latest school circulars, holiday notices, examination schedules and announcements from Star Academy Rohtak.',
            notices
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

// Gallery Page
router.get('/gallery', (req, res) => {
    res.render('public/gallery', {
        title: 'Campus & Activity Gallery | Star Academy Rohtak',
        metaDescription: 'View campus photos, modern science laboratories, sports events and annual topper celebrations at Star Academy Rohtak.'
    });
});

// Contact Page
router.get('/contact', (req, res) => {
    res.render('public/contact', {
        title: 'Contact Star Academy Rohtak | Campus Location & Phone',
        metaDescription: 'Get in touch with Star Academy Rohtak. Campus near Model Town, Rohtak, Haryana. Call +91-9467389100.'
    });
});

// Inquiry Form Submission
router.post('/inquiry', async (req, res) => {
    try {
        const { parent_name, student_name, email, phone, seeking_class, message } = req.body;
        if (!parent_name || !phone) {
            req.session.flash_error = 'Please provide parent name and contact phone number.';
            return res.redirect('/admissions');
        }

        let cleanPhone = String(phone).trim();
        const digits = cleanPhone.replace(/[^0-9]/g, '');
        if (digits.length === 10) {
            cleanPhone = `+91-${digits}`;
        } else if (digits.length === 12 && digits.startsWith('91')) {
            cleanPhone = `+91-${digits.slice(2)}`;
        } else if (!cleanPhone.startsWith('+')) {
            cleanPhone = `+91-${cleanPhone}`;
        }

        await pool.query(
            `INSERT INTO inquiries (parent_name, student_name, email, phone, seeking_class, message) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [parent_name, student_name || '', email || '', cleanPhone, seeking_class || '', message || '']
        );

        req.session.flash_success = 'Thank you! Your admission inquiry has been received. Our admission counselor will contact you shortly.';
        res.redirect('/admissions#inquiry-success');
    } catch (err) {
        console.error('Inquiry error:', err);
        req.session.flash_error = 'Failed to submit inquiry. Please call us directly.';
        res.redirect('/contact');
    }
});

module.exports = router;
