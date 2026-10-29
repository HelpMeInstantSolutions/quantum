const jwt = require('jsonwebtoken');

// Web Admin Session Auth
function requireAdminWeb(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        res.locals.adminUser = req.session.user;
        return next();
    }
    req.session.returnTo = req.originalUrl;
    return res.redirect('/admin/login');
}

// Mobile REST API Auth (JWT)
function requireApiAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'Authentication required. Missing Authorization header.' });
    }

    const token = authHeader.split(' ')[1] || authHeader;
    if (!token) {
        return res.status(401).json({ success: false, message: 'Malformed authorization token.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'star_academy_jwt_super_key_mobile_2026');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired authorization token.', error: err.message });
    }
}

// Role Guard for API
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `Forbidden: Access restricted to roles [${allowedRoles.join(', ')}]. Your role is ${req.user.role}.` 
            });
        }
        next();
    };
}

module.exports = {
    requireAdminWeb,
    requireApiAuth,
    requireRole
};
