const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin', 'superadmin'));

// Dashboard
router.get('/dashboard', adminController.getDashboard);
router.get('/api/dashboard/stats', adminController.getDashboardStats);

// User Management
router.get('/users', adminController.getUsersPage);
router.get('/api/users', adminController.getUsers);
router.put('/api/users/:userId', adminController.updateUser);
router.delete('/api/users/:userId', adminController.deleteUser);

// Assessment Management
router.get('/assessment', adminController.getAssessmentQuestionsPage);
router.get('/api/assessment/questions', adminController.getAssessmentQuestions);
router.put('/api/assessment/questions/:questionId', adminController.updateAssessmentQuestion);

// OCR Uploads Management
router.get('/ocr-uploads', adminController.getOCRUploadsPage);
router.get('/api/ocr-uploads', adminController.getOCRUploads);

// Safety Flags
router.get('/safety-flags', adminController.getSafetyFlagsPage);
router.get('/api/safety-flags', adminController.getSafetyFlags);
router.put('/api/safety-flags/:flagId/review', adminController.markSafetyFlagReviewed);

// Universities and Courses
router.get('/universities', adminController.getUniversitiesPage);
router.get('/courses', adminController.getCoursesPage);

// Audit Logs
router.get('/audit-logs', adminController.getAuditLogsPage);
router.get('/api/audit-logs', adminController.getAuditLogs);

module.exports = router;