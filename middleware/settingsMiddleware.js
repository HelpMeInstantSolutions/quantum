const pool = require('../config/db');
const { getAvatar } = require('../utils/avatarHelper');

let cachedSettings = null;
let lastFetch = 0;

function clearSettingsCache() {
    cachedSettings = null;
    lastFetch = 0;
}

async function settingsMiddleware(req, res, next) {
    try {
        const now = Date.now();
        if (!cachedSettings || (now - lastFetch > 60000)) { // Cache for 1 min or until cleared
            const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
            cachedSettings = {};
            rows.forEach(r => {
                cachedSettings[r.setting_key] = r.setting_value;
            });
            lastFetch = now;
        }

        res.locals.school = cachedSettings || {};
        res.locals.currentUrl = req.originalUrl;
        res.locals.getAvatar = getAvatar;
        res.locals.title = null;
        res.locals.metaDescription = null;
        res.locals.metaKeywords = null;
        res.locals.adminUser = req.session && req.session.user && req.session.user.role === 'admin' ? req.session.user : null;
        res.locals.flash = {
            success: req.session.flash_success || null,
            error: req.session.flash_error || null
        };
        delete req.session.flash_success;
        delete req.session.flash_error;

        next();
    } catch (err) {
        console.error('Settings middleware error:', err.message);
        res.locals.school = {};
        next();
    }
}

module.exports = settingsMiddleware;
module.exports.clearSettingsCache = clearSettingsCache;
