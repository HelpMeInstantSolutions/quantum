const https = require('https');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Universal Push Notification Service for QSA School Management System
 * Supports:
 * 1. Mobile In-App Database Notifications (Always active)
 * 2. Firebase Cloud Messaging (FCM) HTTP v1 API (Modern, Google-recommended using Service Account)
 * 3. Firebase Cloud Messaging (FCM) Legacy API (If FCM_SERVER_KEY provided)
 * 4. OneSignal REST API Push (If ONESIGNAL_APP_ID & ONESIGNAL_REST_KEY provided)
 */

let cachedAccessToken = null;
let tokenExpiryTime = 0; // Epoch ms

/**
 * Locate Firebase Service Account JSON credentials
 * Automatically inspects root folder, config/, cwd, public/ for ANY valid Google Service Account JSON
 */
function getFirebaseCredentials() {
    // 1. Explicit path in env
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        try {
            const p = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
            if (fs.existsSync(p)) {
                const content = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (content.private_key && content.client_email) {
                    return { ...content, source: `env_path: ${p}` };
                }
            }
        } catch (e) {
            console.warn('[FCM v1] Error reading FIREBASE_SERVICE_ACCOUNT_PATH:', e.message);
        }
    }

    // 2. Scan directories for any Google Service Account JSON
    const searchDirs = [
        path.join(__dirname, '..'),           // project root
        path.join(__dirname, '..', 'config'),  // config/
        process.cwd(),                         // cwd
        path.join(__dirname, '..', 'public')   // public/ (in case uploaded there)
    ];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (file === 'package.json' || file === 'package-lock.json') continue;
                // Allow .json files or files containing firebase-adminsdk / service-account
                if (!file.endsWith('.json') && !file.includes('firebase-adminsdk') && !file.includes('service-account')) continue;
                const fullPath = path.join(dir, file);
                try {
                    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                    // Check if it's a valid service account with private key
                    if ((content.type === 'service_account' || content.private_key) && content.client_email) {
                        return {
                            ...content,
                            source: `${path.basename(dir)}/${file}`
                        };
                    }
                } catch (parseErr) {
                    // Ignore malformed json
                }
            }
        } catch (dirErr) {
            // Ignore directory read errors
        }
    }

    // 3. Inline environment variables
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        }
        return {
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            private_key: privateKey,
            project_id: process.env.FIREBASE_PROJECT_ID || 'quantum-science-academy-dff08',
            source: 'inline_env'
        };
    }

    // 4. Bundled fallback credentials in config/firebase_credentials.js (for zero-config cloud deployments)
    try {
        const bundledCreds = require('../config/firebase_credentials');
        if (bundledCreds && bundledCreds.client_email && bundledCreds.private_key) {
            return {
                ...bundledCreds,
                source: 'bundled_config: config/firebase_credentials.js'
            };
        }
    } catch (_) {}

    return null;
}

/**
 * Diagnostic tool to list all JSON files found and setup status
 */
function diagnoseFirebaseSetup() {
    const searchDirs = [
        path.join(__dirname, '..'),
        path.join(__dirname, '..', 'config'),
        path.join(__dirname, '..', 'public'),
        process.cwd()
    ];

    const jsonFiles = [];
    const seenPaths = new Set();

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                if (f === 'package.json' || f === 'package-lock.json') continue;
                if (!f.endsWith('.json') && !f.includes('firebase-adminsdk') && !f.includes('service-account')) continue;
                const full = path.join(dir, f);
                if (seenPaths.has(full)) continue;
                seenPaths.add(full);
                try {
                    const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
                    jsonFiles.push({
                        fileName: f,
                        location: path.relative(path.join(__dirname, '..'), full) || f,
                        isServiceAccount: Boolean(parsed.type === 'service_account' && parsed.private_key && parsed.client_email),
                        isGoogleServicesClient: Boolean(parsed.project_info && parsed.client),
                        projectId: parsed.project_id || parsed.project_info?.project_id || null,
                        clientEmail: parsed.client_email ? `${parsed.client_email.substring(0, 15)}...` : null
                    });
                } catch (e) {
                    jsonFiles.push({ fileName: f, location: full, error: 'Invalid JSON file' });
                }
            }
        } catch (e) {}
    }

    const creds = getFirebaseCredentials();
    return {
        detectedCredentials: creds ? {
            source: creds.source,
            project_id: creds.project_id,
            client_email: creds.client_email,
            has_private_key: Boolean(creds.private_key)
        } : null,
        fcm_server_key_present: Boolean(process.env.FCM_SERVER_KEY),
        onesignal_app_id: process.env.ONESIGNAL_APP_ID || null,
        jsonFilesFound: jsonFiles
    };
}

/**
 * Exchange Google Service Account credentials for an OAuth2 Bearer Access Token
 */
async function getGoogleAccessToken(creds) {
    const now = Date.now();
    if (cachedAccessToken && tokenExpiryTime > now + 300000) {
        return cachedAccessToken;
    }

    return new Promise((resolve, reject) => {
        try {
            const nowSec = Math.floor(now / 1000);
            const claimSet = {
                iss: creds.client_email,
                scope: 'https://www.googleapis.com/auth/firebase.messaging',
                aud: 'https://oauth2.googleapis.com/token',
                exp: nowSec + 3600,
                iat: nowSec
            };

            const assertion = jwt.sign(claimSet, creds.private_key, { algorithm: 'RS256' });
            const postData = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`;

            const req = https.request({
                hostname: 'oauth2.googleapis.com',
                port: 443,
                path: '/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.access_token) {
                            cachedAccessToken = parsed.access_token;
                            tokenExpiryTime = now + (parsed.expires_in || 3600) * 1000;
                            resolve(cachedAccessToken);
                        } else {
                            reject(new Error(`OAuth error: ${data}`));
                        }
                    } catch (e) {
                        reject(new Error(`OAuth JSON parse error: ${data}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.write(postData);
            req.end();
        } catch (signErr) {
            reject(signErr);
        }
    });
}

/**
 * Dispatch Push Notification using Modern Firebase HTTP v1 API
 */
async function sendFCMv1({ creds, token, title, message, studentId }) {
    try {
        const accessToken = await getGoogleAccessToken(creds);
        const projectId = creds.project_id || 'quantum-science-academy-dff08';

        const payload = JSON.stringify({
            message: {
                token: token,
                notification: {
                    title: title,
                    body: message
                },
                data: {
                    title: title,
                    message: message,
                    student_id: String(studentId || ''),
                    type: 'attendance_alert'
                },
                android: {
                    priority: 'high',
                    notification: {
                        channel_id: 'qsa_school_notifications',
                        sound: 'default',
                        default_sound: true,
                        default_vibrate_timings: true
                    }
                }
            }
        });

        return new Promise((resolve) => {
            const req = https.request({
                hostname: 'fcm.googleapis.com',
                port: 443,
                path: `/v1/projects/${projectId}/messages:send`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let resData = '';
                res.on('data', chunk => { resData += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`🚀 [FCM v1 PUSH SUCCESS] Status ${res.statusCode} -> Token ${token.substring(0, 15)}...`);
                        resolve({ success: true, status: res.statusCode });
                    } else {
                        console.warn(`⚠️ [FCM v1 PUSH FAILED] Status ${res.statusCode}: ${resData}`);
                        if (resData.includes('UNREGISTERED') || resData.includes('NOT_FOUND') || resData.includes('INVALID_ARGUMENT')) {
                            pool.query('DELETE FROM user_device_tokens WHERE device_token = ?', [token]).catch(() => {});
                        }
                        resolve({ success: false, status: res.statusCode, error: resData });
                    }
                });
            });

            req.on('error', (e) => {
                console.warn('[FCM v1] Network error:', e.message);
                resolve({ success: false, error: e.message });
            });

            req.write(payload);
            req.end();
        });
    } catch (err) {
        console.warn('[FCM v1] Dispatch exception:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Dispatch Push Notification using Legacy FCM HTTP API (Fallback)
 */
async function sendFCMLegacy({ serverKey, token, title, message, studentId }) {
    return new Promise((resolve) => {
        try {
            const payload = JSON.stringify({
                to: token,
                notification: {
                    title: title,
                    body: message,
                    sound: 'default'
                },
                data: {
                    title: title,
                    message: message,
                    student_id: String(studentId || ''),
                    type: 'attendance_alert'
                },
                priority: 'high'
            });

            const req = https.request({
                hostname: 'fcm.googleapis.com',
                port: 443,
                path: '/fcm/send',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `key=${serverKey}`,
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let resData = '';
                res.on('data', chunk => { resData += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`🚀 [FCM LEGACY PUSH SUCCESS] Status ${res.statusCode} -> Token ${token.substring(0, 15)}...`);
                        resolve({ success: true, status: res.statusCode });
                    } else {
                        console.warn(`⚠️ [FCM LEGACY PUSH FAILED] Status ${res.statusCode}: ${resData}`);
                        if (resData.includes('NotRegistered') || resData.includes('InvalidRegistration')) {
                            pool.query('DELETE FROM user_device_tokens WHERE device_token = ?', [token]).catch(() => {});
                        }
                        resolve({ success: false, status: res.statusCode, error: resData });
                    }
                });
            });

            req.on('error', (e) => {
                console.warn('[FCM Legacy] Network error:', e.message);
                resolve({ success: false, error: e.message });
            });

            req.write(payload);
            req.end();
        } catch (e) {
            console.warn('[FCM Legacy] Dispatch error:', e.message);
            resolve({ success: false, error: e.message });
        }
    });
}

/**
 * Send Attendance Push Notification (In-App DB + FCM + OneSignal)
 */
async function sendAttendancePushNotification({ studentId, studentName, punchType, sessionType, punchTime }) {
    try {
        if (!studentId) return { success: false, error: 'studentId required' };

        // 1. Get student & guardian details
        const [students] = await pool.query(
            `SELECT s.id, s.first_name, s.last_name, s.father_name, s.father_phone, s.mother_phone,
                    s.class_id, s.section_id, s.user_id, c.class_name, sec.section_name 
             FROM students s 
             LEFT JOIN classes c ON s.class_id = c.id 
             LEFT JOIN sections sec ON s.section_id = sec.id 
             WHERE s.id = ? LIMIT 1`,
            [studentId]
        );

        if (students.length === 0) return { success: false, error: 'Student not found' };
        const st = students[0];
        const displayName = studentName || `${st.first_name} ${st.last_name || ''}`.trim();
        const formattedTime = punchTime 
            ? new Date(punchTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) 
            : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        // 2. Build Title & Message
        let title = '';
        let message = '';

        if (sessionType === 'school') {
            if (punchType === 'Check-In' || punchType === 'IN') {
                title = `🏫 School Check-In: ${displayName}`;
                message = `Dear Parent, ${displayName} (${st.class_name || ''}) safely reached school at ${formattedTime}.`;
            } else {
                title = `🎒 School Check-Out: ${displayName}`;
                message = `Dear Parent, ${displayName} has checked out of school at ${formattedTime}.`;
            }
        } else if (sessionType === 'tuition') {
            if (punchType === 'Check-In' || punchType === 'IN') {
                title = `📚 Tuition Check-In: ${displayName}`;
                message = `Dear Parent, ${displayName} reached evening tuition at ${formattedTime}.`;
            } else {
                title = `👋 Tuition Check-Out: ${displayName}`;
                message = `Dear Parent, ${displayName} has completed evening tuition and checked out at ${formattedTime}.`;
            }
        } else {
            title = `🔔 Attendance Alert: ${displayName}`;
            message = `Attendance punch recorded for ${displayName} at ${formattedTime}.`;
        }

        // 3. Store In-App Notification in DB (Visible to both Student & Parent)
        try {
            await pool.query(
                `INSERT INTO notifications (title, message, category, target_role, student_id, class_id, section_id, is_pinned) 
                 VALUES (?, ?, 'attendance_alert', 'all', ?, ?, ?, 0)`,
                [title, message, st.id, st.class_id, st.section_id]
            );
            console.log(`📱 [IN-APP NOTIFICATION STORED] For ${displayName}: "${title}"`);
        } catch (dbErr) {
            console.error('Database notification insert error:', dbErr.message);
        }

        // 4. Send OneSignal Push Notification (if configured)
        const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
        const oneSignalApiKey = process.env.ONESIGNAL_REST_KEY;
        if (oneSignalAppId && oneSignalApiKey) {
            sendOneSignal({
                appId: oneSignalAppId,
                apiKey: oneSignalApiKey,
                title,
                message,
                studentId: String(st.id)
            });
        }

        // 5. Send FCM Push Notification (Modern v1 or Legacy)
        const fcmResult = await sendFCM({
            studentId: st.id,
            userId: st.user_id,
            title,
            message
        });

        return { 
            success: true, 
            title, 
            message,
            fcm_result: fcmResult 
        };
    } catch (err) {
        console.error('Error in sendAttendancePushNotification:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Dispatch to registered devices via FCM
 */
async function sendFCM({ studentId, userId, title, message }) {
    try {
        const [tokens] = await pool.query(
            `SELECT DISTINCT device_token FROM user_device_tokens 
             WHERE student_id = ? 
                OR user_id = ? 
                OR user_id IN (
                    SELECT id FROM users WHERE phone IN (
                        SELECT father_phone FROM students WHERE id = ? AND father_phone IS NOT NULL AND father_phone != ''
                        UNION
                        SELECT mother_phone FROM students WHERE id = ? AND mother_phone IS NOT NULL AND mother_phone != ''
                    )
                )`,
            [studentId, userId, studentId, studentId]
        );

        if (!tokens || tokens.length === 0) {
            console.log(`ℹ️ [FCM] No registered device tokens found for student #${studentId} / user #${userId}`);
            return { dispatched: false, reason: 'No device tokens registered in database for this student/user' };
        }

        const creds = getFirebaseCredentials();
        const serverKey = process.env.FCM_SERVER_KEY;

        if (!creds && !serverKey) {
            console.warn('⚠️ [FCM] Neither Firebase Service Account (FCM v1) nor FCM_SERVER_KEY (Legacy) configured.');
            return { dispatched: false, reason: 'Firebase credentials or FCM_SERVER_KEY not configured on server' };
        }

        console.log(`📡 [FCM DISPATCH] Sending notification to ${tokens.length} registered device(s)...`);
        const results = [];

        for (const row of tokens) {
            if (creds) {
                const r = await sendFCMv1({
                    creds,
                    token: row.device_token,
                    title,
                    message,
                    studentId
                });
                results.push(r);
            } else if (serverKey) {
                const r = await sendFCMLegacy({
                    serverKey,
                    token: row.device_token,
                    title,
                    message,
                    studentId
                });
                results.push(r);
            }
        }

        return { dispatched: true, total_devices: tokens.length, results };
    } catch (e) {
        console.warn('FCM dispatch error:', e.message);
        return { dispatched: false, error: e.message };
    }
}

/**
 * Dispatch to OneSignal API
 */
function sendOneSignal({ appId, apiKey, title, message, studentId }) {
    try {
        const payload = JSON.stringify({
            app_id: appId,
            headings: { en: title },
            contents: { en: message },
            data: { student_id: studentId, type: 'attendance_alert' },
            included_segments: ['Subscribed Users']
        });

        const req = https.request({
            hostname: 'onesignal.com',
            port: 443,
            path: '/api/v1/notifications',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Basic ${apiKey}`,
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                console.log(`🚀 [ONESIGNAL PUSH DISPATCHED] Status: ${res.statusCode}`);
            });
        });

        req.on('error', (e) => {
            console.warn('OneSignal Push Network Error:', e.message);
        });

        req.write(payload);
        req.end();
    } catch (e) {
        console.warn('OneSignal Push dispatch failed:', e.message);
    }
}

module.exports = {
    sendAttendancePushNotification,
    sendOneSignal,
    sendFCM,
    sendFCMv1,
    sendFCMLegacy,
    getFirebaseCredentials,
    diagnoseFirebaseSetup,
    getGoogleAccessToken
};
