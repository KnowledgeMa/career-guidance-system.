const express = require('express');
const router = express.Router();
const multer = require('multer');
const ResultsController = require('../controllers/resultsController');
const { authenticate } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

router.post('/upload', authenticate, upload.single('reportCard'), ResultsController.upload.bind(ResultsController));
router.get('/status/:uploadId', authenticate, ResultsController.getStatus.bind(ResultsController));
router.get('/latest', authenticate, ResultsController.getLatest.bind(ResultsController));
router.post('/confirm', authenticate, ResultsController.confirmResults.bind(ResultsController));
router.put('/:id', authenticate, ResultsController.updateResult.bind(ResultsController));

module.exports = router;