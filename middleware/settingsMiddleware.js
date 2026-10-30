const pool = require('../config/db');
const { getAvatar } = require('../utils/avatarHelper');

let cachedSettings = null;
let lastFetch = 0;

function clearSettingsCache() {
    cachedSettings = null;
    lastFetch = 0;
}

const DEFAULT_SCHOOL_SETTINGS = {
    school_name: 'Quantum Science Academy',
    tagline: 'Inspiring Innovation, Igniting Scientific Minds & Excellence.',
    institution_type: 'Academy',
    address: 'Kaunt Road, Opposite Hanuman Mandir, Bhiwani, Haryana 127021',
    phone: '+91-9466255941',
    email: 'info@quantumscience.in',
    primary_color: '#142b3c',
    secondary_color: '#1a56db',
    accent_color: '#f59e0b',
    logo_url: '/images/logo.png',
    admission_status: 'open',
    current_session: '2026-27',
    office_hours: 'Mon - Sat: 8:00 AM - 4:00 PM',
    seo_meta_title: 'Quantum Science Academy | Premier Science & Board Institute',
    seo_meta_description: 'Quantum Science Academy provides top-tier education in Science, CBSE/HBSE Boards, and NEET/JEE preparation.',
    seo_meta_keywords: 'Quantum Science Academy, Science Academy Bhiwani, CBSE school, NEET, JEE preparation'
};

async function settingsMiddleware(req, res, next) {
    // 1. ALWAYS initialize locals first with rock-solid defaults so templates never throw ReferenceError
    res.locals.currentUrl = req.originalUrl || req.url || '/';
    res.locals.getAvatar = getAvatar;
    res.locals.title = null;
    res.locals.metaDescription = null;
    res.locals.metaKeywords = null;
    res.locals.school = Object.assign({}, DEFAULT_SCHOOL_SETTINGS, cachedSettings || {});
    res.locals.adminUser = (req.session && req.session.user && req.session.user.role === 'admin') ? req.session.user : null;
    res.locals.flash = {
        success: (req.session && req.session.flash_success) || null,
        error: (req.session && req.session.flash_error) || null,
        warning: (req.session && req.session.flash_warning) || null,
        info: (req.session && req.session.flash_info) || null
    };
    if (req.session) {
        delete req.session.flash_success;
        delete req.session.flash_error;
        delete req.session.flash_warning;
        delete req.session.flash_info;
    }

    // 2. Fetch fresh settings from DB if cache expired
    try {
        const now = Date.now();
        if (!cachedSettings || (now - lastFetch > 60000)) {
            const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
            cachedSettings = {};
            rows.forEach(r => {
                cachedSettings[r.setting_key] = r.setting_value;
            });
            lastFetch = now;
            res.locals.school = Object.assign({}, DEFAULT_SCHOOL_SETTINGS, cachedSettings);
        }
    } catch (err) {
        console.warn('Settings middleware DB fetch warning (using defaults):', err.message);
    }

    next();
}

module.exports = settingsMiddleware;
module.exports.clearSettingsCache = clearSettingsCache;
