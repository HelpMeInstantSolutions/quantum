const pool = require('../config/db');

async function updateExisting() {
    try {
        await pool.query("UPDATE students SET photo_url = '/images/default_student_female.svg' WHERE gender = 'Female' AND (photo_url = '/images/default_student.png' OR photo_url IS NULL OR photo_url = '')");
        await pool.query("UPDATE students SET photo_url = '/images/default_student_male.svg' WHERE (gender = 'Male' OR gender IS NULL) AND (photo_url = '/images/default_student.png' OR photo_url IS NULL OR photo_url = '')");
        await pool.query("UPDATE users SET avatar_url = '/images/default_avatar_male.svg' WHERE role = 'admin' AND (avatar_url = '/images/default_avatar.png' OR avatar_url IS NULL)");
        await pool.query("UPDATE users SET avatar_url = '/images/default_teacher_female.svg' WHERE username = 'teacher2'");
        await pool.query("UPDATE users SET avatar_url = '/images/default_teacher_male.svg' WHERE username = 'teacher1'");
        console.log('✅ Updated all existing users, teachers and students with default gender avatars');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

updateExisting();
