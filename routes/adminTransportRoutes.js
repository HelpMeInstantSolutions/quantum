const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireAdminWeb } = require('../middleware/authMiddleware');

router.use(requireAdminWeb);

// Transport Routes & Vehicles
router.get('/', async (req, res) => {
    try {
        const [routes] = await pool.query(
            `SELECT tr.*, 
                   COUNT(DISTINCT ts.id) as total_stops,
                   COUNT(DISTINCT s.id) as assigned_students 
             FROM transport_routes tr 
             LEFT JOIN transport_stops ts ON tr.id = ts.route_id 
             LEFT JOIN students s ON tr.id = s.transport_route_id AND s.status = 'active'
             GROUP BY tr.id ORDER BY tr.id ASC`
        );

        // Fetch stops
        const [stops] = await pool.query(`SELECT * FROM transport_stops ORDER BY route_id ASC, stop_order ASC`);

        res.render('admin/transport/index', {
            title: 'Transport & Fleet Management | Star Academy Rohtak',
            routes,
            stops
        });
    } catch (err) {
        console.error('Transport error:', err);
        res.status(500).send('Error loading transport data');
    }
});

// Create Route
router.post('/routes/create', async (req, res) => {
    try {
        const { route_name, vehicle_number, vehicle_model, driver_name, driver_phone, monthly_charge } = req.body;
        if (!route_name || !vehicle_number || !driver_name || !driver_phone) {
            req.session.flash_error = 'Please fill all required route & vehicle fields.';
            return res.redirect('/admin/transport');
        }

        await pool.query(
            `INSERT INTO transport_routes (route_name, vehicle_number, vehicle_model, driver_name, driver_phone, monthly_charge) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                route_name.trim(),
                vehicle_number.trim(),
                vehicle_model || 'Tata Starbus',
                driver_name.trim(),
                driver_phone.trim(),
                monthly_charge || 1200.00
            ]
        );

        req.session.flash_success = 'New transport route added successfully!';
        res.redirect('/admin/transport');
    } catch (err) {
        console.error('Create route error:', err);
        req.session.flash_error = 'Failed to add route: ' + err.message;
        res.redirect('/admin/transport');
    }
});

// Create Stop
router.post('/stops/create', async (req, res) => {
    try {
        const { route_id, stop_name, pickup_time, drop_time, stop_fare, stop_order } = req.body;
        if (!route_id || !stop_name) {
            req.session.flash_error = 'Route and Stop name are required.';
            return res.redirect('/admin/transport');
        }

        await pool.query(
            `INSERT INTO transport_stops (route_id, stop_name, pickup_time, drop_time, stop_fare, stop_order) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                route_id,
                stop_name.trim(),
                pickup_time || '07:30 AM',
                drop_time || '02:30 PM',
                stop_fare || 1200.00,
                stop_order || 1
            ]
        );

        req.session.flash_success = 'Pickup stop added successfully!';
        res.redirect('/admin/transport');
    } catch (err) {
        console.error('Create stop error:', err);
        req.session.flash_error = 'Failed to add stop: ' + err.message;
        res.redirect('/admin/transport');
    }
});

// Assigned Students
router.get('/students', async (req, res) => {
    try {
        const [students] = await pool.query(
            `SELECT s.id, s.admission_no, s.roll_no, s.first_name, s.last_name, s.father_name, s.father_phone,
                    c.class_name, sec.section_name, tr.route_name, tr.vehicle_number, tr.driver_name, tr.driver_phone,
                    ts.stop_name, ts.pickup_time
             FROM students s 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             JOIN transport_routes tr ON s.transport_route_id = tr.id 
             LEFT JOIN transport_stops ts ON s.transport_stop_id = ts.id 
             WHERE s.status = 'active'
             ORDER BY tr.id ASC, c.numeric_level ASC`
        );

        const [routes] = await pool.query(`SELECT * FROM transport_routes WHERE status = 'active'`);
        const [allStudents] = await pool.query(
            `SELECT s.id, s.admission_no, s.first_name, s.last_name, c.class_name, sec.section_name 
             FROM students s 
             JOIN classes c ON s.class_id = c.id 
             JOIN sections sec ON s.section_id = sec.id 
             WHERE s.transport_route_id IS NULL AND s.status = 'active'`
        );

        res.render('admin/transport/students', {
            title: 'Bus Transport Students | Star Academy Rohtak',
            students,
            routes,
            unassignedStudents: allStudents
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/transport');
    }
});

// Assign Student to Route
router.post('/assign-student', async (req, res) => {
    try {
        const { student_id, transport_route_id, transport_stop_id } = req.body;
        await pool.query(
            `UPDATE students SET transport_route_id = ?, transport_stop_id = ? WHERE id = ?`,
            [transport_route_id || null, transport_stop_id || null, student_id]
        );
        req.session.flash_success = 'Student bus transport allocation updated!';
        res.redirect('/admin/transport/students');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/transport/students');
    }
});

module.exports = router;
