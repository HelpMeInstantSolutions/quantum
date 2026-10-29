const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Homepage (SEO Optimized)
router.get('/', async (req, res) => {
    let notices = [];
    let classes = [];
    let teachers = [];
    let totalRoutes = 4;

    try {
        // Fetch pinned / recent notices
        const [noticeRows] = await pool.query(
            `SELECT * FROM notifications 
             WHERE target_role IN ('all', 'student', 'parent') 
             ORDER BY is_pinned DESC, created_at DESC LIMIT 6`
        );
        notices = noticeRows || [];

        // Fetch classes
        const [classRows] = await pool.query(
            `SELECT c.*, COUNT(s.id) as student_count 
             FROM classes c 
             LEFT JOIN students s ON c.id = s.class_id AND s.status = 'active'
             GROUP BY c.id ORDER BY c.numeric_level ASC LIMIT 6`
        );
        classes = classRows || [];

        // Fetch transport stats
        const [routeRows] = await pool.query(`SELECT COUNT(*) as total_routes FROM transport_routes`);
        totalRoutes = routeRows[0]?.total_routes || 4;
        
        // Fetch teachers
        const [teacherRows] = await pool.query(
            `SELECT t.*, u.name, u.avatar_url 
             FROM teachers t 
             JOIN users u ON t.user_id = u.id 
             LIMIT 4`
        );
        teachers = teacherRows || [];
    } catch (err) {
        console.warn('Home page DB fetch warning (using defaults):', err.message);
    }

    res.render('public/home', {
        title: 'Quantum Science Academy | Premier Science & Board Institute',
        metaDescription: 'Quantum Science Academy Bhiwani is a premier educational institution in Haryana offering schooling with integrated NEET & JEE foundation for Classes Nursery to 12th.',
        metaKeywords: 'Quantum Science Academy, best school in Bhiwani, CBSE school Bhiwani, HBSE coaching, NEET foundation, JEE coaching Bhiwani',
        notices,
        classes,
        teachers,
        totalRoutes
    });
});

// About Page
router.get('/about', (req, res) => {
    res.render('public/about', {
        title: 'About Us | Quantum Science Academy',
        metaDescription: 'Learn about Quantum Science Academy history, visionary leadership, mission, and academic excellence in Haryana.'
    });
});

// Academics Page
router.get('/academics', async (req, res) => {
    let classes = [];
    try {
        const [rows] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        classes = rows || [];
    } catch (err) {
        console.warn('Academics DB fetch warning:', err.message);
    }
    res.render('public/academics', {
        title: 'Academic Programs & Curriculum | Quantum Science Academy',
        metaDescription: 'Explore our academic programs from Primary to Senior Secondary Science, Commerce and Arts with Board exam excellence.',
        classes
    });
});

// Admissions Page
router.get('/admissions', async (req, res) => {
    let classes = [];
    try {
        const [rows] = await pool.query(`SELECT * FROM classes ORDER BY numeric_level ASC`);
        classes = rows || [];
    } catch (err) {
        console.warn('Admissions DB fetch warning:', err.message);
    }
    res.render('public/admissions', {
        title: 'Admissions 2026-27 | Quantum Science Academy',
        metaDescription: 'Admission open for session 2026-27 at Quantum Science Academy Bhiwani. Register online or download admission form.',
        classes
    });
});

// Notices & Circulars Page
router.get('/notices', async (req, res) => {
    let notices = [];
    try {
        const [rows] = await pool.query(
            `SELECT * FROM notifications 
             WHERE target_role IN ('all', 'student', 'parent') 
             ORDER BY is_pinned DESC, created_at DESC LIMIT 30`
        );
        notices = rows || [];
    } catch (err) {
        console.warn('Notices DB fetch warning:', err.message);
    }
    res.render('public/notices', {
        title: 'Notices & Announcements | Quantum Science Academy',
        metaDescription: 'Latest school circulars, holiday notices, examination schedules and announcements from Quantum Science Academy.',
        notices
    });
});

// Gallery Page
router.get('/gallery', (req, res) => {
    res.render('public/gallery', {
        title: 'Campus & Activity Gallery | Quantum Science Academy',
        metaDescription: 'View campus photos, modern science laboratories, sports events and annual topper celebrations at Quantum Science Academy.'
    });
});

// Contact Page
router.get('/contact', (req, res) => {
    res.render('public/contact', {
        title: 'Contact Quantum Science Academy | Campus Location & Phone',
        metaDescription: 'Get in touch with Quantum Science Academy. Campus near Kaunt Road, Opposite Hanuman Mandir, Bhiwani, Haryana. Call +91-9466255941.'
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
