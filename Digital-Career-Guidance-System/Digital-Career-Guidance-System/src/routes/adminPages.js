const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

// All admin page routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin', 'superadmin'));

// Admin Pages
router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getUsersPage);
router.get('/assessment', adminController.getAssessmentQuestionsPage);
router.get('/ocr-uploads', adminController.getOCRUploadsPage);
router.get('/safety-flags', adminController.getSafetyFlagsPage);
router.get('/universities', adminController.getUniversitiesPage);
router.get('/courses', adminController.getCoursesPage);
router.get('/audit-logs', adminController.getAuditLogsPage);

module.exports = router;