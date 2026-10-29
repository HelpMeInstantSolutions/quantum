const pool = require('../config/db');

async function run() {
    try {
        console.log('🔄 Checking database updates for gender and parent sibling support...');

        // 1. Add gender to users if not exists
        const [userCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'gender'");
        if (userCols.length === 0) {
            await pool.query("ALTER TABLE users ADD COLUMN gender ENUM('Male', 'Female', 'Other') DEFAULT 'Male' AFTER phone");
            console.log('✅ Added gender to users table');
        } else {
            console.log('ℹ️ gender already exists in users table');
        }

        // 2. Add gender to teachers if not exists
        const [teacherCols] = await pool.query("SHOW COLUMNS FROM teachers LIKE 'gender'");
        if (teacherCols.length === 0) {
            await pool.query("ALTER TABLE teachers ADD COLUMN gender ENUM('Male', 'Female', 'Other') DEFAULT 'Male' AFTER employee_code");
            console.log('✅ Added gender to teachers table');
        } else {
            console.log('ℹ️ gender already exists in teachers table');
        }

        // Update default teachers gender
        await pool.query("UPDATE teachers SET gender = 'Female' WHERE designation LIKE '%Science Dept%' OR id = 2");
        await pool.query("UPDATE teachers SET gender = 'Male' WHERE id != 2");

        console.log('🎉 Avatar & gender migrations completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
}

run();
