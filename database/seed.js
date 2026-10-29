const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedDatabase() {
    console.log('🔄 Initializing Database Schema...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    
    // Split queries by semicolon (excluding those within strings)
    const queries = schemaSql
        .replace(/--.*$/gm, '')
        .split(';')
        .map(q => q.trim())
        .filter(q => q.length > 0);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        for (const query of queries) {
            await connection.query(query);
        }
        console.log('✅ Schema created successfully.');

        // 1. Settings
        console.log('🌱 Seeding Settings...');
        const defaultSettings = [
            ['school_name', 'QUANTUM SCIENCE ACADEMY'],
            ['tagline', 'Inspiring Innovation, Igniting Scientific Minds & Excellence.'],
            ['phone', '+91-9466255941'],
            ['phone_alt', '+91-9466255941'],
            ['email', 'info@quantumscience.in'],
            ['address', 'Kaunt Road, Opposite Hanuman Mandir, Bhiwani, Haryana 127021'],
            ['affiliation_no', 'CBSE / HBSE Affiliated'],
            ['current_session', '2026-2027'],
            ['logo_url', '/images/logo.png'],
            ['receipt_prefix', 'QSA/2026/'],
            ['about_short', 'Quantum Science Academy Bhiwani is one of Haryana\'s premier educational institutions dedicated to providing holistic schooling, board preparation (HBSE & CBSE), and competitive entrance exam foundation coaching for science aspirants.'],
            ['about_full', 'Quantum Science Academy was established with a singular objective: to transform traditional learning into an inspiring, empowering, and holistic growth experience. Located in Bhiwani, Haryana, our institution has earned a stellar reputation for delivering top academic results in Board examinations as well as NEET/JEE competitive entrance tests.'],
            ['director_name', 'Dr. S. K. Hooda'],
            ['director_message', 'Education is not just about memorizing facts; it is about building character, nurturing curiosity, and empowering students to achieve their highest potential. At Quantum Science Academy, we provide unmatched faculty support and modern facilities to prepare every student for academic and life success.'],
            ['office_hours', 'Monday to Saturday: 8:00 AM - 4:00 PM']
        ];

        for (const [key, val] of defaultSettings) {
            await connection.query(
                `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) 
                 ON DUPLICATE KEY UPDATE setting_value = ?`,
                [key, val, val]
            );
        }

        // 2. Users (Admin, Teachers, Students)
        console.log('🌱 Seeding Users...');
        const adminPass = await bcrypt.hash('admin123', 10);
        const teacherPass = await bcrypt.hash('teacher123', 10);
        const studentPass = await bcrypt.hash('student123', 10);

        // Admin
        await connection.query(
            `INSERT INTO users (name, username, email, phone, password_hash, role) 
             VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)`,
            ['Administrator', 'admin', 'admin@staracademy.in', '+91-9467389100', adminPass, 'admin']
        );
        const [adminUser] = await connection.query(`SELECT id FROM users WHERE username = 'admin'`);

        // Teachers
        await connection.query(
            `INSERT INTO users (name, username, email, phone, password_hash, role) 
             VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)`,
            ['Ramesh Sharma (Class Teacher 10-A)', 'teacher1', 'ramesh@staracademy.in', '+91-9876543210', teacherPass, 'teacher']
        );
        const [teacher1User] = await connection.query(`SELECT id FROM users WHERE username = 'teacher1'`);

        await connection.query(
            `INSERT INTO users (name, username, email, phone, password_hash, role) 
             VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)`,
            ['Pooja Verma (Science Dept)', 'teacher2', 'pooja@staracademy.in', '+91-9876543211', teacherPass, 'teacher']
        );
        const [teacher2User] = await connection.query(`SELECT id FROM users WHERE username = 'teacher2'`);

        // Students Users
        await connection.query(
            `INSERT INTO users (name, username, email, phone, password_hash, role) 
             VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)`,
            ['Aarav Sharma', 'student1', 'aarav@staracademy.in', '+91-9467000001', studentPass, 'student']
        );
        const [student1User] = await connection.query(`SELECT id FROM users WHERE username = 'student1'`);

        await connection.query(
            `INSERT INTO users (name, username, email, phone, password_hash, role) 
             VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)`,
            ['Ananya Gupta', 'student2', 'ananya@staracademy.in', '+91-9467000002', studentPass, 'student']
        );
        const [student2User] = await connection.query(`SELECT id FROM users WHERE username = 'student2'`);

        // 3. Classes and Sections
        console.log('🌱 Seeding Classes & Sections...');
        const classesData = [
            { name: 'Class 6', level: 6, stream: 'General' },
            { name: 'Class 7', level: 7, stream: 'General' },
            { name: 'Class 8', level: 8, stream: 'General' },
            { name: 'Class 9', level: 9, stream: 'General' },
            { name: 'Class 10', level: 10, stream: 'General' },
            { name: 'Class 11 Science', level: 11, stream: 'Science (Medical/Non-Med)' },
            { name: 'Class 11 Commerce', level: 11, stream: 'Commerce' },
            { name: 'Class 12 Science', level: 12, stream: 'Science' },
            { name: 'Class 12 Commerce', level: 12, stream: 'Commerce' }
        ];

        for (const cls of classesData) {
            const [existing] = await connection.query(`SELECT id FROM classes WHERE class_name = ?`, [cls.name]);
            let classId;
            if (existing.length === 0) {
                const [res] = await connection.query(
                    `INSERT INTO classes (class_name, numeric_level, stream) VALUES (?, ?, ?)`,
                    [cls.name, cls.level, cls.stream]
                );
                classId = res.insertId;
            } else {
                classId = existing[0].id;
            }

            // Create sections A and B
            for (const sec of ['A', 'B']) {
                const [secEx] = await connection.query(
                    `SELECT id FROM sections WHERE class_id = ? AND section_name = ?`,
                    [classId, sec]
                );
                if (secEx.length === 0) {
                    await connection.query(
                        `INSERT INTO sections (class_id, section_name, room_no) VALUES (?, ?, ?)`,
                        [classId, sec, `Room-${cls.level}0${sec === 'A' ? 1 : 2}`]
                    );
                }
            }
        }

        // Get Class 10 and Section A
        const [class10Rows] = await connection.query(`SELECT id FROM classes WHERE class_name = 'Class 10'`);
        const class10Id = class10Rows[0].id;
        const [secARows] = await connection.query(`SELECT id FROM sections WHERE class_id = ? AND section_name = 'A'`, [class10Id]);
        const secAId = secARows[0].id;

        // 4. Subjects for Class 10
        console.log('🌱 Seeding Subjects...');
        const class10Subjects = [
            ['Mathematics', 'MTH-10'],
            ['Science', 'SCI-10'],
            ['English', 'ENG-10'],
            ['Hindi', 'HIN-10'],
            ['Social Science', 'SST-10']
        ];
        for (const [subName, subCode] of class10Subjects) {
            const [exSub] = await connection.query(
                `SELECT id FROM subjects WHERE class_id = ? AND subject_name = ?`,
                [class10Id, subName]
            );
            if (exSub.length === 0) {
                await connection.query(
                    `INSERT INTO subjects (class_id, subject_name, subject_code) VALUES (?, ?, ?)`,
                    [class10Id, subName, subCode]
                );
            }
        }

        // 5. Teachers Setup
        console.log('🌱 Seeding Teachers profile & subjects...');
        // Ramesh Sharma as Class Teacher of 10-A
        const [t1Ex] = await connection.query(`SELECT id FROM teachers WHERE user_id = ?`, [teacher1User[0].id]);
        let t1Id;
        if (t1Ex.length === 0) {
            const [r] = await connection.query(
                `INSERT INTO teachers (user_id, employee_code, designation, qualification, assigned_class_id, assigned_section_id, salary) 
                 VALUES (?, 'EMP-STA-101', 'Senior Mathematics Mentor & Class Teacher', 'M.Sc (Maths), B.Ed', ?, ?, 48000.00)`,
                [teacher1User[0].id, class10Id, secAId]
            );
            t1Id = r.insertId;
        } else {
            t1Id = t1Ex[0].id;
        }

        // Pooja Verma as Subject Teacher
        const [t2Ex] = await connection.query(`SELECT id FROM teachers WHERE user_id = ?`, [teacher2User[0].id]);
        let t2Id;
        if (t2Ex.length === 0) {
            const [r] = await connection.query(
                `INSERT INTO teachers (user_id, employee_code, designation, qualification, salary) 
                 VALUES (?, 'EMP-STA-102', 'Head of Science Department', 'M.Sc (Physics), B.Ed, Ph.D Scholar', 52000.00)`,
                [teacher2User[0].id]
            );
            t2Id = r.insertId;
        } else {
            t2Id = t2Ex[0].id;
        }

        // Teacher subjects allocation
        const [mathSubject] = await connection.query(`SELECT id FROM subjects WHERE class_id = ? AND subject_name = 'Mathematics'`, [class10Id]);
        const [sciSubject] = await connection.query(`SELECT id FROM subjects WHERE class_id = ? AND subject_name = 'Science'`, [class10Id]);
        
        if (mathSubject.length > 0) {
            await connection.query(
                `INSERT IGNORE INTO teacher_subjects (teacher_id, class_id, section_id, subject_id) VALUES (?, ?, ?, ?)`,
                [t1Id, class10Id, secAId, mathSubject[0].id]
            );
        }
        if (sciSubject.length > 0) {
            await connection.query(
                `INSERT IGNORE INTO teacher_subjects (teacher_id, class_id, section_id, subject_id) VALUES (?, ?, ?, ?)`,
                [t2Id, class10Id, secAId, sciSubject[0].id]
            );
        }

        // 6. Transport Routes
        console.log('🌱 Seeding Transport...');
        const [routesEx] = await connection.query(`SELECT id FROM transport_routes LIMIT 1`);
        let route1Id;
        if (routesEx.length === 0) {
            const [r1] = await connection.query(
                `INSERT INTO transport_routes (route_name, vehicle_number, vehicle_model, driver_name, driver_phone, monthly_charge) 
                 VALUES ('Route 1: City Bus Stand to Quantum Science Academy', 'HR-12-AB-4455', 'Tata Starbus 32 Seater', 'Suresh Kumar', '+91-9416012345', 1200.00)`
            );
            route1Id = r1.insertId;

            await connection.query(
                `INSERT INTO transport_stops (route_id, stop_name, pickup_time, drop_time, stop_fare, stop_order) VALUES 
                 (?, 'Old Bus Stand Bhiwani', '07:15 AM', '02:45 PM', 1200.00, 1),
                 (?, 'Clock Tower Circle', '07:25 AM', '02:35 PM', 1200.00, 2),
                 (?, 'Halu Bazar Gate', '07:35 AM', '02:25 PM', 1000.00, 3),
                 (?, 'Quantum Science Academy Campus', '07:50 AM', '02:10 PM', 0.00, 4)`,
                [route1Id, route1Id, route1Id, route1Id]
            );
        } else {
            route1Id = routesEx[0].id;
        }

        // 7. Students
        console.log('🌱 Seeding Students...');
        const demoStudents = [
            {
                user_id: student1User[0].id,
                admission_no: 'STA-2026-001',
                roll_no: '101',
                first_name: 'Aarav',
                last_name: 'Sharma',
                gender: 'Male',
                dob: '2010-05-14',
                blood_group: 'B+',
                father_name: 'Sunil Sharma',
                father_phone: '+91-9812345678',
                father_occupation: 'Govt. Officer',
                mother_name: 'Sunita Sharma',
                mother_phone: '+91-9812345679',
                address: 'H.No. 452, Sector 14, Rohtak, Haryana',
                class_id: class10Id,
                section_id: secAId,
                transport_route_id: route1Id
            },
            {
                user_id: student2User[0].id,
                admission_no: 'STA-2026-002',
                roll_no: '102',
                first_name: 'Ananya',
                last_name: 'Gupta',
                gender: 'Female',
                dob: '2010-08-22',
                blood_group: 'O+',
                father_name: 'Rajesh Gupta',
                father_phone: '+91-9812111222',
                father_occupation: 'Businessman',
                mother_name: 'Meena Gupta',
                mother_phone: '+91-9812111223',
                address: 'Flat 302, Model Town, Rohtak, Haryana',
                class_id: class10Id,
                section_id: secAId,
                transport_route_id: route1Id
            },
            {
                user_id: null,
                admission_no: 'STA-2026-003',
                roll_no: '103',
                first_name: 'Karan',
                last_name: 'Yadav',
                gender: 'Male',
                dob: '2010-02-11',
                blood_group: 'A+',
                father_name: 'Devender Yadav',
                father_phone: '+91-9812999888',
                father_occupation: 'Advocate',
                mother_name: 'Pooja Yadav',
                mother_phone: '+91-9812999889',
                address: 'Near Jat College Ground, Rohtak',
                class_id: class10Id,
                section_id: secAId,
                transport_route_id: null
            },
            {
                user_id: null,
                admission_no: 'STA-2026-004',
                roll_no: '104',
                first_name: 'Rohan',
                last_name: 'Malik',
                gender: 'Male',
                dob: '2010-11-30',
                blood_group: 'AB+',
                father_name: 'Satish Malik',
                father_phone: '+91-9812777666',
                father_occupation: 'Transport Contractor',
                mother_name: 'Seema Malik',
                mother_phone: '+91-9812777667',
                address: 'DLF Colony, Rohtak',
                class_id: class10Id,
                section_id: secAId,
                transport_route_id: route1Id
            },
            {
                user_id: null,
                admission_no: 'STA-2026-005',
                roll_no: '105',
                first_name: 'Kavita',
                last_name: 'Punia',
                gender: 'Female',
                dob: '2010-09-17',
                blood_group: 'B+',
                father_name: 'Mukesh Punia',
                father_phone: '+91-9812555444',
                father_occupation: 'Teacher',
                mother_name: 'Geeta Punia',
                mother_phone: '+91-9812555445',
                address: 'Subhash Nagar, Rohtak',
                class_id: class10Id,
                section_id: secAId,
                transport_route_id: null
            }
        ];

        for (const s of demoStudents) {
            const [ex] = await connection.query(`SELECT id FROM students WHERE admission_no = ?`, [s.admission_no]);
            let sId;
            if (ex.length === 0) {
                const [ins] = await connection.query(
                    `INSERT INTO students (user_id, admission_no, roll_no, first_name, last_name, gender, dob, blood_group, 
                     father_name, father_phone, father_occupation, mother_name, mother_phone, current_address, permanent_address, 
                     class_id, section_id, transport_route_id, admission_date) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-04-01')`,
                    [s.user_id, s.admission_no, s.roll_no, s.first_name, s.last_name, s.gender, s.dob, s.blood_group,
                     s.father_name, s.father_phone, s.father_occupation, s.mother_name, s.mother_phone, s.address, s.address,
                     s.class_id, s.section_id, s.transport_route_id]
                );
                sId = ins.insertId;
            } else {
                sId = ex[0].id;
            }

            // Seed documents for student 1 & 2
            if (s.admission_no === 'STA-2026-001' || s.admission_no === 'STA-2026-002') {
                const [docEx] = await connection.query(`SELECT id FROM student_documents WHERE student_id = ?`, [sId]);
                if (docEx.length === 0) {
                    await connection.query(
                        `INSERT INTO student_documents (student_id, doc_type, doc_title, file_url, file_size) VALUES 
                         (?, 'Aadhaar Card', 'Student Aadhaar Card Copy', '/uploads/documents/sample_aadhaar.pdf', '850 KB'),
                         (?, 'Birth Certificate', 'Municipal Corporation Birth Certificate', '/uploads/documents/sample_birth_cert.pdf', '1.1 MB'),
                         (?, 'Previous Marksheet', 'Class 9th Final CBSE Report Card', '/uploads/documents/sample_marksheet.pdf', '2.4 MB')`,
                        [sId, sId, sId]
                    );
                }
            }
        }

        // 8. Attendance
        console.log('🌱 Seeding Attendance...');
        const [studentRows] = await connection.query(`SELECT id, admission_no FROM students WHERE class_id = ?`, [class10Id]);
        const todayStr = new Date().toISOString().split('T')[0];
        
        for (const st of studentRows) {
            // Check today
            const [attEx] = await connection.query(
                `SELECT id FROM attendance WHERE student_id = ? AND attendance_date = ?`,
                [st.id, todayStr]
            );
            if (attEx.length === 0) {
                // Let student 4 be absent to demo alert trigger
                const status = (st.admission_no === 'STA-2026-004') ? 'Absent' : 'Present';
                const remarks = (status === 'Absent') ? 'Medical unexcused absence' : 'Present in morning assembly';
                await connection.query(
                    `INSERT INTO attendance (student_id, class_id, section_id, attendance_date, status, remarks, marked_by_user_id) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [st.id, class10Id, secAId, todayStr, status, remarks, teacher1User[0].id]
                );
            }
        }

        // 9. Notifications (Attendance alert, Holiday, Homework, Pending fees)
        console.log('🌱 Seeding Notifications...');
        const [notifEx] = await connection.query(`SELECT id FROM notifications LIMIT 1`);
        if (notifEx.length === 0) {
            await connection.query(
                `INSERT INTO notifications (title, message, category, target_role, class_id, is_pinned) VALUES 
                 ('Haryana Day & Diwali Festive Break Announcement', 'Quantum Science Academy campus will observe festive holidays from 28th October to 2nd November 2026. Normal classes resume on Monday.', 'holiday', 'all', NULL, 1),
                 ('Daily Attendance Alert: Rohan Malik is Absent Today', 'Dear Parent, your ward Rohan Malik (Class 10-A, Roll: 104) is marked ABSENT today. Please contact school desk if already notified.', 'attendance_alert', 'parent', ?, 0),
                 ('Mathematics Weekly Practice Sheet Chapter 4 Due Friday', 'Dear Class 10-A students, complete NCERT Quadratic Equations Exercise 4.2 & submit notebooks by Friday morning.', 'homework', 'student', ?, 0),
                 ('Tuition Fee Reminder for Term 2 (Session 2026-27)', 'Dear Parents, please clear pending academic dues by 10th of this month to avoid late fee charges.', 'fee_reminder', 'parent', NULL, 1)`,
                [class10Id, class10Id]
            );
        }

        // 10. Homework
        console.log('🌱 Seeding Homework...');
        const [hwEx] = await connection.query(`SELECT id FROM homework LIMIT 1`);
        if (hwEx.length === 0 && mathSubject.length > 0) {
            await connection.query(
                `INSERT INTO homework (class_id, section_id, subject_id, teacher_id, title, description, homework_date, due_date) VALUES 
                 (?, ?, ?, ?, 'Quadratic Equations Exercise 4.1 & 4.2', 'Solve all word problems from NCERT page 78 to 82 in your homework notebook with steps.', ?, DATE_ADD(?, INTERVAL 3 DAY))`,
                [class10Id, secAId, mathSubject[0].id, t1Id, todayStr, todayStr]
            );
        }

        // 11. Exams & Results
        console.log('🌱 Seeding Examination & Results...');
        const [examEx] = await connection.query(`SELECT id FROM exams WHERE exam_name = 'Unit Test 1 (July 2026)'`);
        let examId;
        if (examEx.length === 0) {
            const [exRes] = await connection.query(
                `INSERT INTO exams (exam_name, exam_type, session_year, class_id, start_date, end_date, status) 
                 VALUES ('Unit Test 1 (July 2026)', 'unit_test', '2026-2027', ?, '2026-07-15', '2026-07-22', 'published')`,
                [class10Id]
            );
            examId = exRes.insertId;

            // Schedule for Maths & Science
            const [s1] = await connection.query(
                `INSERT INTO exam_schedules (exam_id, subject_id, exam_date, max_marks, pass_marks) 
                 VALUES (?, ?, '2026-07-15', 50.00, 17.00)`,
                [examId, mathSubject[0].id]
            );
            const mathSchedId = s1.insertId;

            const [s2] = await connection.query(
                `INSERT INTO exam_schedules (exam_id, subject_id, exam_date, max_marks, pass_marks) 
                 VALUES (?, ?, '2026-07-17', 50.00, 17.00)`,
                [examId, sciSubject[0].id]
            );
            const sciSchedId = s2.insertId;

            // Seed marks for students in Maths & Science
            const demoMarks = [
                { id: studentRows[0].id, mMarks: 48.5, sMarks: 47.0, grade: 'A+' },
                { id: studentRows[1].id, mMarks: 46.0, sMarks: 49.0, grade: 'A+' },
                { id: studentRows[2].id, mMarks: 38.0, sMarks: 40.5, grade: 'A' },
                { id: studentRows[3].id, mMarks: 32.5, sMarks: 30.0, grade: 'B' },
                { id: studentRows[4].id, mMarks: 42.0, sMarks: 44.0, grade: 'A' }
            ];

            for (const dm of demoMarks) {
                await connection.query(
                    `INSERT INTO exam_results (exam_id, exam_schedule_id, student_id, marks_obtained, is_absent, grade, remarks) 
                     VALUES (?, ?, ?, ?, 0, ?, 'Excellent analytical problem solving')`,
                    [examId, mathSchedId, dm.id, dm.mMarks, dm.grade]
                );
                await connection.query(
                    `INSERT INTO exam_results (exam_id, exam_schedule_id, student_id, marks_obtained, is_absent, grade, remarks) 
                     VALUES (?, ?, ?, ?, 0, ?, 'Strong conceptual clarity in physics')`,
                    [examId, sciSchedId, dm.id, dm.sMarks, dm.grade]
                );
            }
        }

        // 12. Fee Management (Structure, Dues, and Receipts)
        console.log('🌱 Seeding Fee Structures, Dues & Receipts...');
        const [feeTypeEx] = await connection.query(`SELECT id FROM fee_types LIMIT 1`);
        let ftTuitionId, ftTransportId;
        if (feeTypeEx.length === 0) {
            // Whole School Annual Charges
            await connection.query(
                `INSERT INTO fee_types (fee_name, applies_to, amount, frequency) 
                 VALUES ('Annual Development & Smart Class Fee', 'whole_school', 6000.00, 'yearly')`
            );
            // Class 10 Tuition Fee
            const [ft1] = await connection.query(
                `INSERT INTO fee_types (fee_name, applies_to, class_id, amount, frequency) 
                 VALUES ('Class 10 Monthly Tuition Fee', 'class', ?, 3200.00, 'monthly')`,
                [class10Id]
            );
            ftTuitionId = ft1.insertId;

            // Transport Fee
            const [ft2] = await connection.query(
                `INSERT INTO fee_types (fee_name, applies_to, amount, frequency) 
                 VALUES ('Monthly Transport Bus Fee', 'whole_school', 1200.00, 'monthly')`
            );
            ftTransportId = ft2.insertId;
        }

        // Create student fee dues and sample receipts
        const [dueEx] = await connection.query(`SELECT id FROM student_fee_dues LIMIT 1`);
        if (dueEx.length === 0 && ftTuitionId) {
            // Student 1: Paid
            const [d1] = await connection.query(
                `INSERT INTO student_fee_dues (student_id, fee_type_id, fee_title, month_year, amount, discount, fine, net_amount, paid_amount, balance_amount, due_date, status) 
                 VALUES (?, ?, 'Tuition Fee - October 2026', 'October 2026', 3200.00, 0.00, 0.00, 3200.00, 3200.00, 0.00, '2026-10-10', 'paid')`,
                [studentRows[0].id, ftTuitionId]
            );

            // Receipt for Student 1
            const [rc1] = await connection.query(
                `INSERT INTO fee_receipts (receipt_no, student_id, payment_date, amount_paid, payment_mode, transaction_reference, remarks, collected_by_user_id) 
                 VALUES ('STAR/2026/0001', ?, '2026-10-05', 3200.00, 'UPI / QR', 'UPI-REF-9843218942', 'Received full payment for October tuition', ?)`,
                [studentRows[0].id, adminUser[0].id]
            );
            await connection.query(
                `INSERT INTO fee_receipt_items (receipt_id, student_fee_due_id, fee_title, amount) VALUES (?, ?, 'Tuition Fee - October 2026', 3200.00)`,
                [rc1.insertId, d1.insertId]
            );

            // Student 2: Partially Paid
            await connection.query(
                `INSERT INTO student_fee_dues (student_id, fee_type_id, fee_title, month_year, amount, discount, fine, net_amount, paid_amount, balance_amount, due_date, status) 
                 VALUES (?, ?, 'Tuition Fee - October 2026', 'October 2026', 3200.00, 200.00, 0.00, 3000.00, 1500.00, 1500.00, '2026-10-10', 'partially_paid')`,
                [studentRows[1].id, ftTuitionId]
            );

            // Student 3 & 4: Pending / Overdue
            await connection.query(
                `INSERT INTO student_fee_dues (student_id, fee_type_id, fee_title, month_year, amount, discount, fine, net_amount, paid_amount, balance_amount, due_date, status) 
                 VALUES (?, ?, 'Tuition Fee - October 2026', 'October 2026', 3200.00, 0.00, 100.00, 3300.00, 0.00, 3300.00, '2026-10-10', 'pending')`,
                [studentRows[2].id, ftTuitionId]
            );

            await connection.query(
                `INSERT INTO student_fee_dues (student_id, fee_type_id, fee_title, month_year, amount, discount, fine, net_amount, paid_amount, balance_amount, due_date, status) 
                 VALUES (?, ?, 'Tuition Fee - October 2026', 'October 2026', 3200.00, 0.00, 200.00, 3400.00, 0.00, 3400.00, '2026-10-05', 'pending')`,
                [studentRows[3].id, ftTuitionId]
            );
        }

        await connection.commit();
        console.log('🎉 Database Seeding Completed Successfully!');
    } catch (err) {
        await connection.rollback();
        console.error('❌ Database Seeding Failed:', err);
    } finally {
        connection.release();
    }
}

if (require.main === module) {
    seedDatabase().then(() => {
        process.exit(0);
    });
}

module.exports = seedDatabase;
