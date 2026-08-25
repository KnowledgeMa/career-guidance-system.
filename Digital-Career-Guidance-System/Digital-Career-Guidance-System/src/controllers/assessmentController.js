const assessmentService = require('../services/assessmentService');

class AssessmentController {
    /**
     * GET /api/assessment/questions
     * Get all assessment questions grouped by category
     */
    async getQuestions(req, res) {
        try {
            const questions = await assessmentService.getQuestions();
            res.json({
                success: true,
                data: questions
            });
        } catch (error) {
            console.error('Get questions error:', error);
            res.status(500).json({ error: 'Failed to load assessment questions' });
        }
    }

    /**
     * POST /api/assessment/start
     * Start a new assessment
     */
    async start(req, res) {
        try {
            const result = await assessmentService.startAssessment(req.user.id);

            if (result.restricted) {
                return res.status(403).json({
                    error: result.message,
                    restricted: true,
                    daysRemaining: result.daysRemaining,
                    canRetakeAfter: result.canRetakeAfter
                });
            }

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Start assessment error:', error);
            res.status(500).json({ error: 'Failed to start assessment' });
        }
    }

    /**
     * POST /api/assessment/response
     * Submit a response to a question
     */
    async submitResponse(req, res) {
        try {
            const { assessmentId, questionId, answer } = req.body;

            if (!assessmentId || !questionId || !answer) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const result = await assessmentService.submitResponse(
                req.user.id,
                assessmentId,
                questionId,
                parseInt(answer)
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Submit response error:', error);
            res.status(500).json({ error: error.message || 'Failed to submit response' });
        }
    }

    /**
     * POST /api/assessment/complete
     * Complete the assessment and generate results
     */
    async complete(req, res) {
        try {
            const { assessmentId } = req.body;

            if (!assessmentId) {
                return res.status(400).json({ error: 'Assessment ID required' });
            }

            const result = await assessmentService.completeAssessment(
                req.user.id,
                assessmentId
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Complete assessment error:', error);
            res.status(500).json({ error: error.message || 'Failed to complete assessment' });
        }
    }

    /**
     * GET /api/assessment/status
     * Get current assessment status for user
     */
    async getStatus(req, res) {
        try {
            const assessment = await assessmentService.getUserAssessment(req.user.id);

            res.json({
                success: true,
                data: {
                    hasAssessment: !!assessment,
                    assessment: assessment
                }
            });
        } catch (error) {
            console.error('Get status error:', error);
            res.status(500).json({ error: 'Failed to get assessment status' });
        }
    }

    /**
     * GET /api/assessment/results/:id
     * Get detailed results for a specific assessment
     */
    async getResults(req, res) {
        try {
            const assessment = await assessmentService.getAssessment(req.params.id);

            if (!assessment) {
                return res.status(404).json({ error: 'Assessment not found' });
            }

            if (assessment.userId !== req.user.id) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            // Get dimension info
            const dimensionInfo = assessmentService.getDimensionInfo();

            res.json({
                success: true,
                data: {
                    ...assessment,
                    dimensionInfo
                }
            });
        } catch (error) {
            console.error('Get results error:', error);
            res.status(500).json({ error: 'Failed to get results' });
        }
    }

    /**
     * GET /api/assessment/latest
     * Get latest completed assessment results
     */
    async getLatest(req, res) {
        try {
            const assessment = await assessmentService.getUserAssessment(req.user.id);
            
            if (!assessment) {
                return res.json({ success: true, data: null });
            }

            // Data is already normalized to camelCase by the service
            res.json({
                success: true,
                data: assessment
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get assessment' });
        }
    }
    /**
     * GET /api/assessment/riasec-info
     * Get information about RIASEC dimensions
     */
    async getRIASECInfo(req, res) {
        try {
            const info = assessmentService.getDimensionInfo();
            res.json({
                success: true,
                data: info
            });
        } catch (error) {
            console.error('Get RIASEC info error:', error);
            res.status(500).json({ error: 'Failed to get RIASEC information' });
        }
    }
}

module.exports = new AssessmentController();
