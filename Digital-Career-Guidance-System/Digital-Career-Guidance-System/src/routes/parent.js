const express = require('express');
const router = express.Router();
const parentController = require('../controllers/parentController');
const { authenticate } = require('../middleware/auth');

// All parent routes require authentication and parent role
router.use(authenticate);
router.use((req, res, next) => {
    if (req.user.role !== 'parent') {
        return res.status(403).json({ error: 'Access denied. Parent role required.' });
    }
    next();
});

// Dashboard
router.get('/dashboard', parentController.getDashboard);

// Children management
router.get('/children', parentController.getChildren);
router.get('/children/:childId', parentController.getChildDetails);
router.get('/children/:childId/results', parentController.getChildResults);
router.get('/children/:childId/assessment', parentController.getChildAssessment);

module.exports = router;