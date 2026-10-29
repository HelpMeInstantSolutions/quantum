const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadFolder = path.join(__dirname, '../public/uploads/documents');
        if (file.fieldname === 'photo') {
            uploadFolder = path.join(__dirname, '../public/uploads/students');
        } else if (file.fieldname === 'homework_file') {
            uploadFolder = path.join(__dirname, '../public/uploads/homework');
        } else if (file.fieldname === 'logo' || file.fieldname === 'favicon' || file.fieldname === 'director_photo') {
            uploadFolder = path.join(__dirname, '../public/uploads/branding');
        }
        if (!fs.existsSync(uploadFolder)) {
            fs.mkdirSync(uploadFolder, { recursive: true });
        }
        cb(null, uploadFolder);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg|ico|pdf|doc|docx/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype) || file.mimetype.includes('pdf') || file.mimetype.includes('image') || file.mimetype.includes('icon');
    if (extname || mimetype) {
        return cb(null, true);
    }
    cb(new Error('Only images, icons, PDF, and DOC files are allowed'));
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: fileFilter
});

module.exports = upload;
