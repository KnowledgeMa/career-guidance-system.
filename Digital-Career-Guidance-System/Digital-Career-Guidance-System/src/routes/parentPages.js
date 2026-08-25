const express = require('express');
const router = express.Router();
const parentController = require('../controllers/parentController');
const { authenticate } = require('../middleware/auth');

// All parent page routes require authentication and parent role
router.use(authenticate);
router.use((req, res, next) => {
    if (req.user.role !== 'parent') {
        return res.status(403).json({ error: 'Access denied. Parent role required.' });
    }
    next();
});

// Parent Pages
router.get('/dashboard', parentController.getDashboard);

module.exports = router;