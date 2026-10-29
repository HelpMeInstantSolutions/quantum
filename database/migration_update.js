const pool = require('../config/db');

async function run() {
    try {
        console.log('🔄 Checking database updates...');

        // 1. Add section_id to subjects if not exists
        const [subCols] = await pool.query("SHOW COLUMNS FROM subjects LIKE 'section_id'");
        if (subCols.length === 0) {
            await pool.query("ALTER TABLE subjects ADD COLUMN section_id INT DEFAULT NULL AFTER class_id, ADD CONSTRAINT fk_subject_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE");
            console.log('✅ Added section_id to subjects table');
        } else {
            console.log('ℹ️ section_id already exists in subjects table');
        }

        // 2. Modify employee_code in teachers to be NULLable
        await pool.query("ALTER TABLE teachers MODIFY employee_code VARCHAR(50) DEFAULT NULL");
        console.log('✅ Modified teachers.employee_code to allow NULL');

        console.log('🎉 Migrations completed successfully.');
        process.exit(0);
    } catch(err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
}

run();
