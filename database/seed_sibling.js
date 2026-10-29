const pool = require('../config/db');

async function seedSibling() {
    try {
        const [existing] = await pool.query("SELECT * FROM students WHERE admission_no = 'STA-2026-006'");
        if (existing.length === 0) {
            const [ins] = await pool.query(
                `INSERT INTO students (
                    admission_no, roll_no, first_name, last_name, gender, dob, blood_group,
                    class_id, section_id, session_year, father_name, father_phone, father_occupation,
                    mother_name, current_address, photo_url, status, admission_date
                ) VALUES (
                    'STA-2026-006', '102', 'Diya', 'Sharma', 'Female', '2014-08-15', 'O+',
                    1, 1, '2026-2027', 'Sunil Sharma', '+91-9812345678', 'Government Service',
                    'Meenakshi Sharma', 'Near Model Town, Rohtak', '/images/default_student_female.svg', 'active', CURDATE()
                )`
            );
            const diyaId = ins.insertId;

            // Add attendance for Diya
            await pool.query(
                `INSERT INTO attendance (student_id, class_id, section_id, attendance_date, status, remarks) VALUES 
                 (?, 1, 1, CURDATE(), 'Present', 'On time'),
                 (?, 1, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'Present', 'On time')`,
                [diyaId, diyaId]
            );

            // Add fee due for Diya
            await pool.query(
                `INSERT INTO student_fee_dues (student_id, fee_title, month_year, amount, net_amount, paid_amount, balance_amount, due_date, status) VALUES 
                 (?, 'Tuition Fee April 2026', '2026-04', 3500.00, 3500.00, 3500.00, 0.00, '2026-04-10', 'paid')`,
                [diyaId]
            );

            console.log('✅ Added sibling Diya Sharma (Class 6-A) for parent Sunil Sharma (+91-9812345678)');
        } else {
            console.log('ℹ️ Diya Sharma already exists');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error seeding sibling:', err);
        process.exit(1);
    }
}

seedSibling();
