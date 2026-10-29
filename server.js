const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const pool = require('./config/db');
const settingsMiddleware = require('./middleware/settingsMiddleware');

const app = express();
const PORT = process.env.PORT || 5004;

// Middleware
app.use(compression());
app.use(cors());
app.use(express.raw({ type: ['application/octet-stream', 'application/x-binary'], limit: '10mb' }));
app.use(express.text({ type: ['text/*', 'text/plain'], limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'star_academy_session_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Template Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Global Settings & locals
app.use(settingsMiddleware);

// Route Modules
const biometricRoutes = require('./routes/biometricRoutes');
const publicRoutes = require('./routes/publicRoutes');
const adminAuthRoutes = require('./routes/adminAuthRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminStudentRoutes = require('./routes/adminStudentRoutes');
const adminTeacherRoutes = require('./routes/adminTeacherRoutes');
const adminAttendanceRoutes = require('./routes/adminAttendanceRoutes');
const adminNotificationRoutes = require('./routes/adminNotificationRoutes');
const adminHomeworkRoutes = require('./routes/adminHomeworkRoutes');
const adminResultRoutes = require('./routes/adminResultRoutes');
const adminTransportRoutes = require('./routes/adminTransportRoutes');
const adminFeeRoutes = require('./routes/adminFeeRoutes');
const adminReceiptRoutes = require('./routes/adminReceiptRoutes');
const adminPromotionRoutes = require('./routes/adminPromotionRoutes');
const adminPendingFeeRoutes = require('./routes/adminPendingFeeRoutes');
const adminClassRoutes = require('./routes/adminClassRoutes');
const adminSettingRoutes = require('./routes/adminSettingRoutes');
const apiRoutes = require('./routes/apiRoutes');

// Mount Routes
app.use('/api', apiRoutes);
app.use(biometricRoutes);
app.use('/', publicRoutes);
app.use('/admin', adminAuthRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/students', adminStudentRoutes);
app.use('/admin/teachers', adminTeacherRoutes);
app.use('/admin/attendance', adminAttendanceRoutes);
app.use('/admin/notifications', adminNotificationRoutes);
app.use('/admin/homework', adminHomeworkRoutes);
app.use('/admin/results', adminResultRoutes);
app.use('/admin/transport', adminTransportRoutes);
app.use('/admin/fees', adminFeeRoutes);
app.use('/admin/receipts', adminReceiptRoutes);
app.use('/admin/promotion', adminPromotionRoutes);
app.use('/admin/pending-fees', adminPendingFeeRoutes);
app.use('/admin/classes', adminClassRoutes);
app.use('/admin/settings', adminSettingRoutes);

// 404 Handler
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, message: 'API Endpoint Not Found' });
    }
    const schoolName = res.locals.school?.school_name || 'Quantum Science Acadmey';
    res.status(404).render('public/404', {
        title: `404 - Page Not Found | ${schoolName}`
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Application Error:', err);
    if (req.path.startsWith('/api')) {
        return res.status(500).json({ success: false, message: 'Server Internal Error', error: err.message });
    }
    res.status(500).send('Something went wrong. Please try again later.');
});

// Start Server
app.listen(PORT, '0.0.0.0', async () => {
    try {
        const initBiometricSchema = require('./database/init_biometric_schema');
        await initBiometricSchema();
    } catch (e) {
        console.warn('Notice on schema check:', e.message);
    }
    console.log(`=======================================================`);
    console.log(`🚀 Star Academy Rohtak School Management System`);
    console.log(`🌐 Public Website:     http://localhost:${PORT}`);
    console.log(`🔒 Admin Web Portal:   http://localhost:${PORT}/admin/login`);
    console.log(`📱 Mobile REST API:    http://localhost:${PORT}/api`);
    console.log(`📟 Biometric Monitor:  http://localhost:${PORT}/admin/biometric/logs`);
    console.log(`📡 Server Port:        ${PORT}`);
    console.log(`=======================================================`);
});
