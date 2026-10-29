const pool = require('../config/db');

/**
 * Ensures all required biometric, dual-session attendance,
 * and push notification schema changes exist in MySQL.
 */
async function initBiometricSchema() {
    try {
        console.log('🔄 Checking database schema for Biometric & Dual-Session Attendance...');

        // 1. Biometric punch logs table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS biometric_punch_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_sn VARCHAR(100) NULL,
                enroll_id VARCHAR(50) NOT NULL,
                punch_time DATETIME NOT NULL,
                punch_type VARCHAR(50) DEFAULT 'Check-In',
                verify_mode INT DEFAULT 1,
                io_mode INT DEFAULT 0,
                matched_user_type VARCHAR(50) NULL,
                matched_id INT NULL,
                matched_name VARCHAR(150) NULL,
                raw_data TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_enroll_time (enroll_id, punch_time),
                INDEX idx_punch_time (punch_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Helper to check if column exists
        async function columnExists(tableName, columnName) {
            try {
                const [rows] = await pool.query(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                    [tableName, columnName]
                );
                return rows.length > 0;
            } catch (e) {
                return false;
            }
        }

        // 2. Add biometric_id to students table
        const hasBioId = await columnExists('students', 'biometric_id');
        if (!hasBioId) {
            try {
                await pool.query(`ALTER TABLE students ADD COLUMN biometric_id VARCHAR(50) NULL AFTER roll_no`);
                console.log('✅ Added column `biometric_id` to `students` table.');
            } catch (err) {
                console.warn('Notice adding biometric_id:', err.message);
            }
        }

        // 3. Add morning and tuition attendance columns to attendance table
        const attendanceCols = [
            { name: 'morning_in', def: 'TIME NULL' },
            { name: 'morning_out', def: 'TIME NULL' },
            { name: 'tuition_in', def: 'TIME NULL' },
            { name: 'tuition_out', def: 'TIME NULL' },
            { name: 'morning_status', def: "VARCHAR(20) DEFAULT 'None'" },
            { name: 'tuition_status', def: "VARCHAR(20) DEFAULT 'None'" }
        ];

        for (const col of attendanceCols) {
            const exists = await columnExists('attendance', col.name);
            if (!exists) {
                try {
                    await pool.query(`ALTER TABLE attendance ADD COLUMN ${col.name} ${col.def}`);
                    console.log(`✅ Added column \`${col.name}\` to \`attendance\` table.`);
                } catch (err) {
                    console.warn(`Notice adding ${col.name}:`, err.message);
                }
            }
        }

        // 4. Device push tokens table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_device_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                student_id INT NULL,
                device_token VARCHAR(500) NOT NULL UNIQUE,
                provider VARCHAR(50) DEFAULT 'fcm',
                device_type VARCHAR(50) DEFAULT 'android',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_student_id (student_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Ensure device_token column is wide enough for FCM tokens
        try {
            await pool.query(`ALTER TABLE user_device_tokens MODIFY COLUMN device_token VARCHAR(500) NOT NULL`);
        } catch (alterErr) {
            // Ignore if already 500 or table doesn't support modify
        }

        console.log('✅ Biometric & Dual-Session Attendance Schema Ready!');
    } catch (err) {
        console.error('⚠️ Biometric schema init warning:', err.message);
    }
}

if (require.main === module) {
    initBiometricSchema().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = initBiometricSchema;
