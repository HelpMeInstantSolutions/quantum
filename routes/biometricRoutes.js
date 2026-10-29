const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const initBiometricSchema = require('../database/init_biometric_schema');
const { sendAttendancePushNotification } = require('../utils/pushNotificationService');

// Auto-initialize biometric & dual-session schema
(async () => {
    try {
        await initBiometricSchema();
    } catch (err) {
        console.warn('Biometric schema auto-init notice:', err.message);
    }
})();

// Ensure logs directory exists
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
    try {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    } catch (e) {
        console.error('Failed to create logs directory:', e.message);
    }
}
const LOG_FILE = path.join(LOGS_DIR, 'biometric.log');

// In-memory circular buffer for the last 100 requests (for live web viewer)
const inMemoryLogs = [];
const MAX_IN_MEMORY_LOGS = 100;

// Device state tracker
const deviceState = {
    lastSeen: null,
    lastDeviceId: null,
    lastRequestCode: null,
    lastIp: null,
    totalPings: 0,
    totalPunches: 0
};

/**
 * Append entry to log file and in-memory buffer
 */
function logBiometricRequest(reqInfo) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        ...reqInfo
    };

    // Update state
    deviceState.lastSeen = timestamp;
    if (reqInfo.devId) deviceState.lastDeviceId = reqInfo.devId;
    if (reqInfo.requestCode) deviceState.lastRequestCode = reqInfo.requestCode;
    deviceState.lastIp = reqInfo.ip;
    deviceState.totalPings++;

    // Add to in-memory array (keep latest at index 0)
    inMemoryLogs.unshift(logEntry);
    if (inMemoryLogs.length > MAX_IN_MEMORY_LOGS) {
        inMemoryLogs.pop();
    }

    // Append formatted text to logs/biometric.log
    const formattedLog = [
        `======================================================================`,
        `[BIOMETRIC LOG] ${timestamp}`,
        `Client IP:    ${reqInfo.ip}`,
        `Method:       ${reqInfo.method} ${reqInfo.url}`,
        `Path:         ${reqInfo.path}`,
        `Device ID:    ${reqInfo.devId || 'N/A'}`,
        `Request Code: ${reqInfo.requestCode || 'N/A'}`,
        `Trans ID:     ${reqInfo.transId || 'N/A'}`,
        `Query:        ${JSON.stringify(reqInfo.query)}`,
        `Headers:      ${JSON.stringify(reqInfo.headers, null, 2)}`,
        `Body (${reqInfo.bodyType}):`,
        typeof reqInfo.body === 'object' ? JSON.stringify(reqInfo.body, null, 2) : String(reqInfo.body || '(empty)'),
        `Response:     ${reqInfo.responseStatus || 200} | ${JSON.stringify(reqInfo.responseHeaders || {})}`,
        `======================================================================\n`
    ].join('\n');

    fs.appendFile(LOG_FILE, formattedLog, (err) => {
        if (err) console.error('Error writing to biometric.log:', err.message);
    });

    // Console output for terminal / PM2 logs
    console.log(`\n📡 [BIOMETRIC PUSH] ${timestamp} | ${reqInfo.method} ${reqInfo.path} | Dev: ${reqInfo.devId || 'Unknown'} | Code: ${reqInfo.requestCode || 'N/A'}`);
}

/**
 * Helper to extract Device ID, Request Code, and Trans ID from Headers/Query/Body
 * Handles binary-prefixed JSON from EBKN / Realand M61BH devices
 */
function extractBiometricMeta(req) {
    const headers = req.headers || {};
    const query = req.query || {};
    let body = req.body;

    let bodyStr = '';
    let bodyType = 'empty';

    if (Buffer.isBuffer(body)) {
        bodyType = 'buffer';
        const start = body.indexOf(123); // '{' char code
        const end = body.lastIndexOf(125); // '}' char code
        if (start >= 0 && end > start) {
            try {
                bodyStr = body.subarray(start, end + 1).toString('utf8');
                body = JSON.parse(bodyStr);
                bodyType = 'json_buffer';
            } catch (_) {
                bodyStr = body.toString('utf8');
            }
        } else {
            bodyStr = body.toString('utf8');
        }
    } else if (typeof body === 'object' && body !== null) {
        bodyType = 'json_object';
        bodyStr = JSON.stringify(body);
    } else if (typeof body === 'string') {
        bodyType = 'text';
        const start = body.indexOf('{');
        const end = body.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                bodyStr = body.slice(start, end + 1);
                body = JSON.parse(bodyStr);
                bodyType = 'json_text';
            } catch (_) {
                bodyStr = body;
            }
        } else {
            bodyStr = body;
        }
    }

    // Normalize headers (case-insensitive in Node.js)
    const requestCode = headers['request_code'] || query['request_code'] || (body && body.request_code) || query['cmd'] || (body && body.cmd) || null;
    const devId = headers['dev_id'] || headers['dev-id'] || headers['device_id'] || query['dev_id'] || query['sn'] || query['SN'] || (body && (body.dev_id || body.sn || body.SN)) || 'DEFAULT_DEV';
    const transId = headers['trans_id'] || query['trans_id'] || (body && body.trans_id) || '1';

    return {
        devId: String(devId).trim(),
        requestCode: requestCode ? String(requestCode).trim() : null,
        transId: String(transId).trim(),
        body,
        bodyStr,
        bodyType
    };
}

/**
 * Format biometric time to MySQL standard DATETIME: YYYY-MM-DD HH:MM:SS
 */
function formatBiometricTime(timeStr) {
    if (!timeStr) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    const s = String(timeStr).replace(/[^0-9]/g, '');
    if (s.length === 14) {
        return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
    }
    return String(timeStr);
}

/**
 * Handle incoming punch log and record into database
 * Supports Dual Sessions: Morning School (In & Out) + Evening Tuition (In & Out)
 * Dispatches Push Notification (OneSignal / FCM) to mobile app
 */
async function processPunchLog(devId, punch) {
    try {
        const rawEnrollId = punch.user_id || punch.pin || punch.enroll_id || punch.id;
        const enrollId = rawEnrollId ? String(parseInt(rawEnrollId, 10)) : null;
        const punchTime = formatBiometricTime(punch.io_time || punch.time || punch.timestamp);
        const verifyMode = punch.verify_mode || 1;
        const ioMode = punch.io_mode || 0;

        if (!enrollId) {
            console.warn('[BIOMETRIC] Punch ignored: Missing enroll_id', punch);
            return null;
        }

        deviceState.totalPunches++;

        // 1. Try to match with Students ONLY by explicitly assigned biometric_id
        let matchedType = null;
        let matchedId = null;
        let matchedName = null;
        let punchType = ioMode === 1 ? 'Check-Out' : 'Check-In';

        const [students] = await pool.query(
            `SELECT id, class_id, section_id, CONCAT(first_name, ' ', COALESCE(last_name, '')) as name 
             FROM students 
             WHERE biometric_id = ? 
             LIMIT 1`,
            [enrollId]
        );

        if (students.length > 0) {
            const st = students[0];
            matchedType = 'student';
            matchedId = st.id;
            matchedName = st.name.trim();

            // Parse date & time
            const parts = punchTime.split(' ');
            const punchDate = parts[0] || new Date().toISOString().slice(0, 10);
            const punchTimeOnly = parts[1] || '00:00:00';
            const punchHour = parseInt(punchTimeOnly.split(':')[0], 10);

            // Fetch existing attendance record for today
            const [existingRows] = await pool.query(
                `SELECT * FROM attendance WHERE student_id = ? AND attendance_date = ? LIMIT 1`,
                [st.id, punchDate]
            );

            let attendanceId = null;
            let currentMorningIn = null;
            let currentMorningOut = null;
            let currentTuitionIn = null;
            let currentTuitionOut = null;
            let sessionType = 'school';

            if (existingRows.length > 0) {
                const row = existingRows[0];
                attendanceId = row.id;
                currentMorningIn = row.morning_in;
                currentMorningOut = row.morning_out;
                currentTuitionIn = row.tuition_in;
                currentTuitionOut = row.tuition_out;
            }

            // Morning Session: Before 14:00 (2:00 PM)
            // Evening Tuition Session: 14:00 (2:00 PM) onwards
            if (punchHour < 14) {
                sessionType = 'school';
                if (!currentMorningIn) {
                    punchType = 'Check-In';
                    if (attendanceId) {
                        await pool.query(
                            `UPDATE attendance SET 
                                morning_in = ?, 
                                morning_status = 'Present', 
                                status = 'Present',
                                remarks = CONCAT(COALESCE(remarks, ''), ' [School IN: ', ?, ']')
                             WHERE id = ?`,
                            [punchTimeOnly, punchTimeOnly, attendanceId]
                        );
                    } else {
                        const [ins] = await pool.query(
                            `INSERT INTO attendance (student_id, class_id, section_id, attendance_date, status, morning_in, morning_status, remarks) 
                             VALUES (?, ?, ?, ?, 'Present', ?, 'Present', ?)`,
                            [st.id, st.class_id, st.section_id, punchDate, punchTimeOnly, `[School IN: ${punchTimeOnly}]`]
                        );
                        attendanceId = ins.insertId;
                    }
                    console.log(`🏫 [SCHOOL CHECK-IN] ${matchedName} (ID: ${st.id}) marked IN at ${punchTimeOnly}`);
                } else {
                    punchType = 'Check-Out';
                    await pool.query(
                        `UPDATE attendance SET 
                            morning_out = ?, 
                            remarks = CONCAT(COALESCE(remarks, ''), ' [School OUT: ', ?, ']')
                         WHERE id = ?`,
                        [punchTimeOnly, punchTimeOnly, attendanceId]
                    );
                    console.log(`🎒 [SCHOOL CHECK-OUT] ${matchedName} (ID: ${st.id}) marked OUT at ${punchTimeOnly}`);
                }
            } else {
                // Evening Tuition Session
                sessionType = 'tuition';
                if (!currentTuitionIn) {
                    punchType = 'Check-In';
                    if (attendanceId) {
                        await pool.query(
                            `UPDATE attendance SET 
                                tuition_in = ?, 
                                tuition_status = 'Present', 
                                status = 'Present',
                                remarks = CONCAT(COALESCE(remarks, ''), ' [Tuition IN: ', ?, ']')
                             WHERE id = ?`,
                            [punchTimeOnly, punchTimeOnly, attendanceId]
                        );
                    } else {
                        const [ins] = await pool.query(
                            `INSERT INTO attendance (student_id, class_id, section_id, attendance_date, status, tuition_in, tuition_status, remarks) 
                             VALUES (?, ?, ?, ?, 'Present', ?, 'Present', ?)`,
                            [st.id, st.class_id, st.section_id, punchDate, punchTimeOnly, `[Tuition IN: ${punchTimeOnly}]`]
                        );
                        attendanceId = ins.insertId;
                    }
                    console.log(`📚 [TUITION CHECK-IN] ${matchedName} (ID: ${st.id}) marked IN at ${punchTimeOnly}`);
                } else {
                    punchType = 'Check-Out';
                    await pool.query(
                        `UPDATE attendance SET 
                            tuition_out = ?, 
                            remarks = CONCAT(COALESCE(remarks, ''), ' [Tuition OUT: ', ?, ']')
                         WHERE id = ?`,
                        [punchTimeOnly, punchTimeOnly, attendanceId]
                    );
                    console.log(`👋 [TUITION CHECK-OUT] ${matchedName} (ID: ${st.id}) marked OUT at ${punchTimeOnly}`);
                }
            }

            // Dispatch Push Notification to Parents & App
            sendAttendancePushNotification({
                studentId: st.id,
                studentName: matchedName,
                punchType: punchType,
                sessionType: sessionType,
                punchTime: punchTime
            }).catch(e => console.warn('Push dispatch error:', e.message));

        } else {
            // 2. Try to match with Teachers
            const [teachers] = await pool.query(
                `SELECT t.id, u.name 
                 FROM teachers t 
                 JOIN users u ON t.user_id = u.id 
                 WHERE t.id = ? OR t.employee_code = ? OR t.user_id = ? 
                 LIMIT 1`,
                [enrollId, enrollId, enrollId]
            );

            if (teachers.length > 0) {
                matchedType = 'teacher';
                matchedId = teachers[0].id;
                matchedName = teachers[0].name;
                console.log(`✅ [BIOMETRIC PUNCH] Teacher verified: ${matchedName} (ID: ${matchedId})`);
            }
        }

        // 3. Save raw log in biometric_punch_logs
        await pool.query(
            `INSERT INTO biometric_punch_logs 
             (device_sn, enroll_id, punch_time, punch_type, verify_mode, io_mode, matched_user_type, matched_id, matched_name, raw_data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [devId, String(enrollId), punchTime, punchType, verifyMode, ioMode, matchedType, matchedId, matchedName, JSON.stringify(punch)]
        );

        return { enrollId, punchTime, matchedType, matchedName, punchType };
    } catch (err) {
        console.error('[BIOMETRIC] Error saving punch log:', err.message);
        return null;
    }
}

/**
 * Core Handler Function for FKWeb & Biometric HTTP Push
 */
async function handleBiometricRequest(req, res) {
    const meta = extractBiometricMeta(req);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;

    const reqInfo = {
        ip,
        method: req.method,
        url: req.originalUrl || req.url,
        path: req.path,
        devId: meta.devId,
        requestCode: meta.requestCode,
        transId: meta.transId,
        query: req.query,
        headers: req.headers,
        bodyType: meta.bodyType,
        body: meta.body
    };

    // Prepare default FKWeb acknowledgement headers
    res.setHeader('response_code', 'OK');
    res.setHeader('trans_id', meta.transId || '1');
    if (meta.devId && meta.devId !== 'DEFAULT_DEV') {
        res.setHeader('dev_id', meta.devId);
    }
    res.setHeader('Connection', 'close');

    // 1. Check if request is an iClock / ADMS Handshake (Options query)
    if (req.path.includes('/iclock') || req.query.options === 'all' || req.query.table === 'options') {
        reqInfo.responseStatus = 200;
        reqInfo.responseHeaders = { 'Content-Type': 'text/plain' };
        logBiometricRequest(reqInfo);

        const optionsResponse = [
            `GET OPTION FROM: ${meta.devId}`,
            `Stamp=9999`,
            `OpStamp=0`,
            `ErrorDelay=60`,
            `Delay=30`,
            `TransTimes=00:00;14:00`,
            `TransInterval=1`,
            `TransFlag=1111000000`,
            `TimeZone=5.5`,
            `Realtime=1`,
            `ServerVersion=3.1.1`
        ].join('\n');

        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(optionsResponse);
    }

    // 2. Check if request is an iClock / ADMS Polling command (/getrequest)
    if (req.path.includes('/getrequest')) {
        reqInfo.responseStatus = 200;
        reqInfo.responseHeaders = { 'Content-Type': 'text/plain' };
        logBiometricRequest(reqInfo);

        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send('OK\n');
    }

    // 3. FKWeb Real-Time Attendance Log Push (realtime_glog)
    if (meta.requestCode === 'realtime_glog' || req.query.table === 'ATTLOG') {
        console.log(`📥 [BIOMETRIC PUNCH RECEIVED] From Device: ${meta.devId}`);

        // A. If payload is JSON
        if (typeof meta.body === 'object' && meta.body !== null) {
            if (Array.isArray(meta.body)) {
                for (const punch of meta.body) {
                    await processPunchLog(meta.devId, punch);
                }
            } else if (Array.isArray(meta.body.glog_data)) {
                for (const punch of meta.body.glog_data) {
                    await processPunchLog(meta.devId, punch);
                }
            } else {
                await processPunchLog(meta.devId, meta.body);
            }
        } else if (meta.bodyStr) {
            // B. If payload is tab-separated / line-separated text
            const lines = meta.bodyStr.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const parts = trimmed.split('\t');
                if (parts.length >= 2) {
                    await processPunchLog(meta.devId, {
                        user_id: parts[0],
                        io_time: parts[1],
                        verify_mode: parts[3] ? parseInt(parts[3]) : 1,
                        io_mode: parts[2] ? parseInt(parts[2]) : 0
                    });
                }
            }
        }

        reqInfo.responseStatus = 200;
        reqInfo.responseHeaders = { 'response_code': 'OK', 'Content-Length': '0' };
        logBiometricRequest(reqInfo);

        // Exact EBKN ACK: Empty body with response_code: OK header to clear buffer
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('response_code', 'OK');
        res.setHeader('trans_id', String(meta.transId));
        res.setHeader('Content-Length', '0');
        res.setHeader('Connection', 'close');
        return res.status(200).end();
    }

    // 4. FKWeb Registration / Enrollment Data Push (realtime_enroll_data)
    if (meta.requestCode === 'realtime_enroll_data') {
        console.log(`👤 [BIOMETRIC ENROLL DATA RECEIVED] From Device: ${meta.devId}`);
        reqInfo.responseStatus = 200;
        reqInfo.responseHeaders = { 'response_code': 'OK', 'Content-Length': '0' };
        logBiometricRequest(reqInfo);

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('response_code', 'OK');
        res.setHeader('trans_id', String(meta.transId));
        res.setHeader('Content-Length', '0');
        res.setHeader('Connection', 'close');
        return res.status(200).end();
    }

    // 5. FKWeb Heartbeat / Command Polling (receive_cmd)
    // *** THIS IS THE EXACT HANDSHAKE THAT TURNS THE CLOUD STATUS ICON GREEN ***
    if (meta.requestCode === 'receive_cmd' || meta.requestCode === 'connect' || meta.requestCode === 'init') {
        console.log(`💚 [BIOMETRIC HEARTBEAT - CLOUD ONLINE] Device: ${meta.devId} is alive!`);
        reqInfo.responseStatus = 200;
        reqInfo.responseHeaders = { 'response_code': 'OK', 'Content-Length': '0' };
        logBiometricRequest(reqInfo);

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('response_code', 'OK');
        res.setHeader('trans_id', String(meta.transId));
        res.setHeader('Content-Length', '0');
        res.setHeader('Connection', 'close');
        return res.status(200).end();
    }

    // 6. Generic Biometric Ack (Handles any ping/push from the machine to root or endpoints)
    reqInfo.responseStatus = 200;
    reqInfo.responseHeaders = { 'response_code': 'OK', 'Content-Length': '0' };
    logBiometricRequest(reqInfo);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('response_code', 'OK');
    res.setHeader('trans_id', String(meta.transId));
    res.setHeader('Content-Length', '0');
    res.setHeader('Connection', 'close');
    return res.status(200).end();
}

// ======================================================================
// ROUTE MOUNTING
// ======================================================================

// Explicit Biometric Endpoints recognized across various firmware
const BIOMETRIC_PATHS = [
    '/ebkn',
    '/hdata.aspx',
    '/iclock/cdata',
    '/iclock/getrequest',
    '/cdata',
    '/getrequest',
    '/devicecmd',
    '/api/biometric',
    '/api/biometric/fkweb',
    '/api/biometric/push',
    '/api/biometric/cdata',
    '/fkweb',
    '/fkweb/cdata'
];

router.all(BIOMETRIC_PATHS, handleBiometricRequest);

// Intelligent Root Interceptor Middleware:
// If request to root '/' has biometric headers or is a POST with biometric payload,
// handle it. Otherwise pass through (next()) so public website works normally!
router.use((req, res, next) => {
    const isRoot = req.path === '/' || req.path === '';
    const headers = req.headers || {};
    const query = req.query || {};

    const hasBiometricHeader = headers['request_code'] || headers['dev_id'] || headers['dev-id'];
    const hasBiometricQuery = query['sn'] || query['SN'] || query['dev_id'] || query['request_code'] || query['table'];
    const isBiometricPost = isRoot && req.method === 'POST' && (hasBiometricHeader || hasBiometricQuery || !headers['accept']?.includes('text/html'));

    if (isBiometricPost || (isRoot && (hasBiometricHeader || hasBiometricQuery))) {
        return handleBiometricRequest(req, res);
    }

    // Not a biometric request, proceed to next routes (public/admin/app)
    next();
});

// ======================================================================
// LOG INSPECTION ENDPOINTS (For Admin & Debugging)
// ======================================================================

// 1. JSON API for real-time monitoring: GET /api/biometric/logs
router.get('/api/biometric/logs', (req, res) => {
    res.json({
        success: true,
        device_state: deviceState,
        in_memory_logs_count: inMemoryLogs.length,
        logs: inMemoryLogs.slice(0, 50)
    });
});

// 2. Device Status Check: GET /api/biometric/status
router.get('/api/biometric/status', (req, res) => {
    const isConnectedRecently = deviceState.lastSeen && (Date.now() - new Date(deviceState.lastSeen).getTime()) < 60000;
    res.json({
        success: true,
        cloud_status: isConnectedRecently ? 'CONNECTED (GREEN)' : 'WAITING_FOR_DEVICE',
        device_state: deviceState,
        message: isConnectedRecently 
            ? `Device ${deviceState.lastDeviceId} is active and communicating.` 
            : 'No ping received in the last 60 seconds.'
    });
});

// 3. Download / View Raw Log File: GET /api/biometric/logs/raw
router.get('/api/biometric/logs/raw', (req, res) => {
    if (fs.existsSync(LOG_FILE)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.sendFile(LOG_FILE);
    }
    res.status(404).send('No biometric log file generated yet. Waiting for machine request.');
});

// 4. HTML Dashboard View: GET /admin/biometric/logs
router.get('/admin/biometric/logs', (req, res) => {
    const isConnected = deviceState.lastSeen && (Date.now() - new Date(deviceState.lastSeen).getTime()) < 60000;
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Biometric Machine Live Monitor | Quantum Science Academy</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <meta http-equiv="refresh" content="10">
        <style>
            body { background: #0f172a; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; }
            .badge-live { animation: pulse 2s infinite; }
            @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
            pre { background: #020617; color: #38bdf8; padding: 12px; border-radius: 8px; font-size: 12px; }
        </style>
    </head>
    <body class="p-4">
        <div class="container-fluid">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 class="fw-bold text-white mb-1">📟 Biometric Device Live Monitor</h2>
                    <p class="text-secondary mb-0">FKWeb &amp; HTTP Push Protocol Receiver • Auto-refreshes every 10s</p>
                </div>
                <div>
                    <a href="/api/biometric/logs/raw" target="_blank" class="btn btn-outline-info btn-sm me-2">📄 View Raw biometric.log</a>
                    <a href="/admin" class="btn btn-primary btn-sm">⬅ Admin Dashboard</a>
                </div>
            </div>

            <!-- Status KPI Cards -->
            <div class="row g-3 mb-4">
                <div class="col-md-3">
                    <div class="card p-3">
                        <small class="text-secondary fw-semibold">CLOUD STATUS</small>
                        <h4 class="fw-bold mt-1 ${isConnected ? 'text-success' : 'text-danger'}">
                            ${isConnected ? '🟢 ONLINE (CONNECTED)' : '🔴 WAITING PING'}
                        </h4>
                        <small class="text-muted">${deviceState.lastSeen ? 'Last seen: ' + new Date(deviceState.lastSeen).toLocaleTimeString() : 'No ping yet'}</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card p-3">
                        <small class="text-secondary fw-semibold">DEVICE ID / SERIAL</small>
                        <h4 class="fw-bold mt-1 text-info">${deviceState.lastDeviceId || 'Detecting...'}</h4>
                        <small class="text-muted">IP: ${deviceState.lastIp || 'N/A'}</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card p-3">
                        <small class="text-secondary fw-semibold">LAST REQUEST CODE</small>
                        <h4 class="fw-bold mt-1 text-warning">${deviceState.lastRequestCode || 'None'}</h4>
                        <small class="text-muted">Heartbeat / Push Type</small>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card p-3">
                        <small class="text-secondary fw-semibold">ACTIVITY COUNTERS</small>
                        <h4 class="fw-bold mt-1 text-white">📡 ${deviceState.totalPings} | 📥 ${deviceState.totalPunches}</h4>
                        <small class="text-muted">Total Pings | Punches Received</small>
                    </div>
                </div>
            </div>

            <!-- Live Logs Table -->
            <div class="card p-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="fw-bold text-white mb-0">📡 Recent Incoming Machine Payloads (${inMemoryLogs.length})</h5>
                    <span class="badge bg-success badge-live">● Live Stream Active</span>
                </div>
                ${inMemoryLogs.length === 0 ? `
                    <div class="alert alert-dark text-center py-5">
                        <h5>No requests captured yet</h5>
                        <p class="text-secondary mb-0">Ensure the machine is turned on, connected to Wi-Fi, and pointing to <code>http://qunatum.mybhiwani.in</code>.</p>
                    </div>
                ` : `
                    <div class="table-responsive">
                        <table class="table table-dark table-hover table-bordered align-middle">
                            <thead class="table-secondary text-dark">
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Method &amp; Path</th>
                                    <th>Device SN</th>
                                    <th>Request Code</th>
                                    <th>Payload (Body / Query)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${inMemoryLogs.map(l => `
                                    <tr>
                                        <td class="text-nowrap font-monospace text-info">${new Date(l.timestamp).toLocaleTimeString()}</td>
                                        <td><span class="badge bg-primary">${l.method}</span> <code class="text-warning">${l.path}</code></td>
                                        <td><strong class="text-white">${l.devId || 'Unknown'}</strong></td>
                                        <td><span class="badge bg-secondary">${l.requestCode || 'General'}</span></td>
                                        <td>
                                            <pre class="mb-0">${typeof l.body === 'object' ? JSON.stringify(l.body, null, 2) : (l.body || JSON.stringify(l.query))}</pre>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

module.exports = router;
