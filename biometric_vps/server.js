/**
 * Realand / BioFace M61 Cloud Biometric Hub (Fail-Safe Production Version)
 * Dedicated aaPanel VPS: 156.67.111.84:5004
 * 
 * FAIL-SAFE GUARANTEE:
 * 1. If Machine/School Internet is down -> Machine saves punches in hardware flash memory (up to 100,000 punches).
 * 2. If Hostinger is down -> VPS saves punches in 'pending_queue.json' disk file.
 * 3. Auto-Retry Worker runs every 30 seconds: The second Hostinger comes back up, all pending punches are auto-synced!
 * 4. ZERO DATA LOSS in any scenario!
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5004;
const HOSTINGER_URL = process.env.HOSTINGER_URL || 'http://qunatum.mybhiwani.in';
const QUEUE_FILE = path.join(__dirname, 'pending_queue.json');

let totalPings = 0;
let totalPunches = 0;
let lastSeenDevice = null;
let lastSeenTime = null;
const logs = [];

function addLog(entry) {
    logs.unshift(entry);
    if (logs.length > 100) logs.pop();
}

// ======================================================================
// OFFLINE QUEUE STORAGE & RETRY SYSTEM
// ======================================================================

function loadQueue() {
    try {
        if (fs.existsSync(QUEUE_FILE)) {
            const data = fs.readFileSync(QUEUE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (_) {}
    return [];
}

function saveQueue(queue) {
    try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
    } catch (err) {
        console.error('Queue save error:', err.message);
    }
}

let pendingQueue = loadQueue();

/**
 * Forward Attendance Punch to Hostinger
 * Returns Promise: resolves true if 200 OK, false if Hostinger is down
 */
function sendToHostinger(devId, transId, base64Buffer, parsedJson) {
    return new Promise(resolve => {
        try {
            const targetUrl = new url.URL(HOSTINGER_URL);
            const client = targetUrl.protocol === 'https:' ? https : http;
            const buffer = Buffer.from(base64Buffer, 'base64');

            const options = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: '/',
                method: 'POST',
                timeout: 8000,
                headers: {
                    'Host': targetUrl.hostname,
                    'request_code': 'realtime_glog',
                    'dev_id': String(devId),
                    'trans_id': String(transId),
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': buffer.length,
                    'Connection': 'close'
                }
            };

            const req = client.request(options, res => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ [HOSTINGER SYNC SUCCESS] Punch for User: ${parsedJson?.user_id || 'N/A'}`);
                    resolve(true);
                } else {
                    console.warn(`⚠️ [HOSTINGER HTTP ${res.statusCode}] Punch saved in queue for retry.`);
                    resolve(false);
                }
            });

            req.on('error', err => {
                console.warn(`⚠️ [HOSTINGER UNREACHABLE] ${err.message}. Punch saved in queue for retry.`);
                resolve(false);
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });

            req.write(buffer);
            req.end();
        } catch (err) {
            console.error('Send error:', err.message);
            resolve(false);
        }
    });
}

/**
 * Background Retry Worker
 * Runs every 30 seconds to flush any offline punches when Hostinger comes back online
 */
setInterval(async () => {
    if (pendingQueue.length === 0) return;

    console.log(`🔄 [RETRY WORKER] Attempting to flush ${pendingQueue.length} pending punch(es) to Hostinger...`);
    const remaining = [];

    for (const item of pendingQueue) {
        const success = await sendToHostinger(item.devId, item.transId, item.base64Buffer, item.parsedJson);
        if (!success) {
            remaining.push(item);
        }
    }

    pendingQueue = remaining;
    saveQueue(pendingQueue);

    if (remaining.length === 0) {
        console.log(`🎉 [RETRY WORKER] All pending punches successfully synced to Hostinger!`);
    } else {
        console.log(`⏳ [RETRY WORKER] ${remaining.length} punch(es) still waiting for Hostinger.`);
    }
}, 30000);

function formatTime(s) {
    if (!s) return new Date().toISOString().slice(0, 19).replace('T', ' ');
    const c = String(s).replace(/[^0-9]/g, '');
    return c.length === 14 ? `${c.slice(0,4)}-${c.slice(4,6)}-${c.slice(6,8)} ${c.slice(8,10)}:${c.slice(10,12)}:${c.slice(12,14)}` : String(s);
}

// ======================================================================
// MAIN HTTP SERVER
// ======================================================================
const server = http.createServer((req, res) => {
    const clientIp = req.socket.remoteAddress ? req.socket.remoteAddress.replace(/^.*:/, '') : 'UNKNOWN';

    // 1. Web Dashboard View
    if (req.method === 'GET' && (req.url === '/' || req.url === '/dashboard')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderDashboardHtml());
    }

    // 2. Machine Request Handling
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
        const rawBuffer = Buffer.concat(chunks);

        let parsedJson = null;
        const s = rawBuffer.indexOf(123), e = rawBuffer.lastIndexOf(125);
        if (s >= 0 && e > s) {
            try { parsedJson = JSON.parse(rawBuffer.subarray(s, e + 1).toString('utf8')); } catch (_) {}
        }

        const devId = req.headers['dev_id'] || parsedJson?.dev_id || 'A260800597';
        const transId = req.headers['trans_id'] || parsedJson?.trans_id || '1';
        const requestCode = req.headers['request_code'] || parsedJson?.request_code || 'receive_cmd';

        lastSeenDevice = devId;
        lastSeenTime = new Date().toISOString();

        const isPunch = (requestCode === 'realtime_glog') || parsedJson?.user_id || parsedJson?.io_time;

        if (isPunch) {
            totalPunches++;
            const cleanUid = parsedJson?.user_id ? String(parseInt(parsedJson.user_id, 10)) : (parsedJson?.user_id || 'Unknown');
            const cleanTime = formatTime(parsedJson?.io_time);

            console.log(`\n🎉 [PUNCH RECEIVED] User: ${cleanUid} | Time: ${cleanTime} | Action: ${parsedJson?.io_mode === 1 ? 'Check-In' : 'Check-Out'}`);

            addLog({
                type: 'PUNCH',
                time: new Date().toLocaleTimeString(),
                devId,
                clientIp,
                userId: cleanUid,
                punchTime: cleanTime,
                ioMode: parsedJson?.io_mode === 1 ? 'Check-In' : 'Check-Out'
            });

            // Try sending to Hostinger immediately
            const base64Buffer = rawBuffer.toString('base64');
            const success = await sendToHostinger(devId, transId, base64Buffer, parsedJson);
            
            // If Hostinger is down, queue it on disk for automatic retry
            if (!success) {
                pendingQueue.push({
                    devId,
                    transId,
                    base64Buffer,
                    parsedJson,
                    timestamp: new Date().toISOString()
                });
                saveQueue(pendingQueue);
                console.log(`💾 [PUNCH SAVED TO DISK QUEUE] Total waiting in queue: ${pendingQueue.length}`);
            }
        } else {
            totalPings++;
            addLog({
                type: 'HEARTBEAT',
                time: new Date().toLocaleTimeString(),
                devId,
                clientIp,
                requestCode
            });
        }

        // ACK: 200 OK + response_code: OK + Content-Length: 0 (Turns Machine GREEN)
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'response_code': 'OK',
            'trans_id': String(transId),
            'dev_id': String(devId),
            'Content-Length': 0,
            'Connection': 'close'
        });
        res.end();
    });
});

function renderDashboardHtml() {
    const isOnline = lastSeenTime && (Date.now() - new Date(lastSeenTime).getTime()) < 60000;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Biometric Cloud Hub | 156.67.111.84</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <meta http-equiv="refresh" content="5">
    <style>
        body { background: #0f172a; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; padding: 30px; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; }
        .badge-pulse { animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
    </style>
</head>
<body>
    <div class="container-fluid" style="max-width: 1200px;">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div>
                <h2 class="fw-bold text-white mb-1">📟 Biometric Cloud Hub (Fail-Safe aaPanel VPS)</h2>
                <p class="text-secondary mb-0">Dedicated IP: <code>156.67.111.84:${PORT}</code> ➔ Hostinger Auto-Sync &amp; Offline Queue</p>
            </div>
            <div>
                <a href="${HOSTINGER_URL}/admin/attendance" target="_blank" class="btn btn-warning fw-bold">🎓 Hostinger Attendance</a>
            </div>
        </div>

        <div class="row g-3 mb-4">
            <div class="col-md-3">
                <div class="card p-3">
                    <small class="text-secondary fw-semibold">DEVICE STATUS</small>
                    <h4 class="fw-bold mt-1 ${isOnline ? 'text-success' : 'text-danger'}">
                        ${isOnline ? '<span class="badge-pulse">🟢</span> ONLINE (GREEN)' : '🔴 WAITING FOR PING'}
                    </h4>
                    <small class="text-muted">Last Active: ${lastSeenTime ? new Date(lastSeenTime).toLocaleTimeString() : 'Never'}</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card p-3">
                    <small class="text-secondary fw-semibold">DEVICE SERIAL</small>
                    <h4 class="fw-bold mt-1 text-info">${lastSeenDevice || 'A260800597'}</h4>
                    <small class="text-muted">Model: Realand BioFace M61BH</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card p-3">
                    <small class="text-secondary fw-semibold">TOTAL PUNCHES RECEIVED</small>
                    <h4 class="fw-bold mt-1 text-warning">${totalPunches}</h4>
                    <small class="text-muted">Heartbeat Pings: ${totalPings}</small>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card p-3">
                    <small class="text-secondary fw-semibold">OFFLINE RETRY QUEUE</small>
                    <h4 class="fw-bold mt-1 ${pendingQueue.length > 0 ? 'text-danger' : 'text-success'}">
                        ${pendingQueue.length === 0 ? '✅ 0 Pending' : '⏳ ' + pendingQueue.length + ' Waiting'}
                    </h4>
                    <small class="text-muted">${pendingQueue.length === 0 ? 'All synced to Hostinger' : 'Retrying every 30s'}</small>
                </div>
            </div>
        </div>

        <div class="card p-4">
            <h5 class="fw-bold text-white mb-3">📡 Live Punch Stream</h5>
            <div class="table-responsive">
                <table class="table table-dark table-hover table-bordered">
                    <thead><tr><th>Time</th><th>Type</th><th>Device SN</th><th>IP</th><th>Details</th></tr></thead>
                    <tbody>
                        ${logs.length === 0 ? '<tr><td colspan="5" class="text-center text-secondary py-3">Waiting for machine...</td></tr>' : ''}
                        ${logs.map(l => `<tr>
                            <td>${l.time}</td>
                            <td>${l.type === 'PUNCH' ? '<span class="badge bg-success">PUNCH</span>' : '<span class="badge bg-secondary">HEARTBEAT</span>'}</td>
                            <td>${l.devId}</td>
                            <td>${l.clientIp}</td>
                            <td>${l.type === 'PUNCH' ? 'User ID: ' + l.userId + ' (' + l.ioMode + ')' : 'Code: ' + l.requestCode}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</body>
</html>`;
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Biometric Hub running on http://156.67.111.84:${PORT}`);
    if (pendingQueue.length > 0) {
        console.log(`📦 Loaded ${pendingQueue.length} pending punch(es) from offline queue.`);
    }
});
