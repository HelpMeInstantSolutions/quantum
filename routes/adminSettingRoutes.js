const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { clearSettingsCache } = require('../middleware/settingsMiddleware');

router.use(requireAdminWeb);

// School Settings Page
router.get('/', async (req, res) => {
    try {
        const [settingsRows] = await pool.query(`SELECT setting_key, setting_value FROM settings`);
        const settings = {};
        settingsRows.forEach(r => {
            settings[r.setting_key] = r.setting_value;
        });

        res.render('admin/settings/index', {
            title: 'Site Configuration & Branding | ' + (settings.school_name || 'Quantum Science Academy'),
            settings
        });
    } catch (err) {
        console.error('Error loading settings:', err);
        res.status(500).send('Error loading settings');
    }
});

// Update Settings
router.post('/update', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 },
    { name: 'director_photo', maxCount: 1 }
]), async (req, res) => {
    try {
        const updates = { ...req.body };

        // Handle uploaded files
        if (req.files) {
            if (req.files.logo && req.files.logo.length > 0) {
                updates.logo_url = `/uploads/branding/${req.files.logo[0].filename}`;
            }
            if (req.files.favicon && req.files.favicon.length > 0) {
                updates.favicon_url = `/uploads/branding/${req.files.favicon[0].filename}`;
            }
            if (req.files.director_photo && req.files.director_photo.length > 0) {
                updates.director_photo_url = `/uploads/branding/${req.files.director_photo[0].filename}`;
            }
        }

        // Save each key-value pair
        for (const [key, val] of Object.entries(updates)) {
            // Trim string values
            const cleanVal = typeof val === 'string' ? val.trim() : val;
            await pool.query(
                `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) 
                 ON DUPLICATE KEY UPDATE setting_value = ?`,
                [key, cleanVal, cleanVal]
            );
        }

        // Invalidate settings cache so changes apply immediately
        clearSettingsCache();

        req.session.flash_success = 'Institution settings and branding updated successfully!';
        res.redirect('/admin/settings');
    } catch (err) {
        console.error('Settings save error:', err);
        req.session.flash_error = 'Failed to save settings: ' + err.message;
        res.redirect('/admin/settings');
    }
});

module.exports = router;
