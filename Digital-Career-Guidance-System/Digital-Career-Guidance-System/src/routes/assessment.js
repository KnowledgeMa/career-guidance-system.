const express = require('express');
const router = express.Router();
const AssessmentController = require('../controllers/assessmentController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /api/assessment/questions - Get all questions
router.get('/questions', AssessmentController.getQuestions.bind(AssessmentController));

// GET /api/assessment/status - Get current assessment status
router.get('/status', AssessmentController.getStatus.bind(AssessmentController));

// GET /api/assessment/latest - Get latest completed results
router.get('/latest', AssessmentController.getLatest.bind(AssessmentController));

// GET /api/assessment/riasec-info - Get RIASEC dimension info
router.get('/riasec-info', AssessmentController.getRIASECInfo.bind(AssessmentController));

// GET /api/assessment/results/:id - Get specific assessment results
router.get('/results/:id', AssessmentController.getResults.bind(AssessmentController));

// POST /api/assessment/start - Start new assessment
router.post('/start', AssessmentController.start.bind(AssessmentController));

// POST /api/assessment/response - Submit response
router.post('/response', AssessmentController.submitResponse.bind(AssessmentController));

// POST /api/assessment/complete - Complete assessment
router.post('/complete', AssessmentController.complete.bind(AssessmentController));

module.exports = router;
