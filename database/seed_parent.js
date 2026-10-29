const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function seedParents() {
    try {
        const passwordHash = await bcrypt.hash('parent123', 10);

        // 1. Father (Male Parent)
        await pool.query(
            `INSERT INTO users (name, username, email, phone, gender, password_hash, role, avatar_url, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE 
                name = VALUES(name),
                phone = VALUES(phone),
                gender = VALUES(gender),
                password_hash = VALUES(password_hash),
                avatar_url = VALUES(avatar_url)`,
            [
                'Sunil Sharma',
                'parent1',
                'sunil.sharma@example.com',
                '+91-9812345678',
                'Male',
                passwordHash,
                'parent',
                '/images/default_avatar_male.svg'
            ]
        );

        // 2. Mother (Female Parent)
        await pool.query(
            `INSERT INTO users (name, username, email, phone, gender, password_hash, role, avatar_url, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE 
                name = VALUES(name),
                phone = VALUES(phone),
                gender = VALUES(gender),
                password_hash = VALUES(password_hash),
                avatar_url = VALUES(avatar_url)`,
            [
                'Meenakshi Sharma',
                'parent2',
                'meenakshi.sharma@example.com',
                '+91-9812345679',
                'Female',
                passwordHash,
                'parent',
                '/images/default_avatar_female.svg'
            ]
        );

        // Update mother_phone in students
        await pool.query(
            `UPDATE students SET mother_phone = ? WHERE father_phone = ?`,
            ['+91-9812345679', '+91-9812345678']
        );

        console.log('✅ Parent accounts successfully seeded:');
        console.log(' - parent1 / parent123 (+91-9812345678, Male avatar)');
        console.log(' - parent2 / parent123 (+91-9812345679, Female avatar)');
        console.log('✅ Updated mother_phone for siblings Aarav & Diya');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding parents:', err);
        process.exit(1);
    }
}

seedParents();
