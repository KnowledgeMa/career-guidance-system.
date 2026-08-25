const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const admissionService = require('../services/admissionService');

// GET /api/recommendations/course/:courseId
// Get detailed course information for modal display
router.get('/course/:courseId', authenticate, async (req, res) => {
    try {
        const courseDetails = await admissionService.getDetailedCourseInfo(req.params.courseId);
        res.json(courseDetails);
    } catch (error) {
        console.error('Get course details error:', error);
        res.status(500).json({ error: 'Failed to fetch course details' });
    }
});

// GET /api/recommendations/matches
router.get('/matches', authenticate, async (req, res) => {
    try {
        const { faculty, university, limit = 200, offset = 0 } = req.query;
        
        const matches = await admissionService.findMatches(
            req.user.id,
            {
                faculty,
                university_id: university,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        );

        // Handle case where no results uploaded yet
        if (matches.message) {
            return res.json({
                matches: [],
                categorized: { eligible: [], conditional: [], missing_requirements: [], ineligible: [] },
                count: 0,
                message: matches.message,
                hasMore: false
            });
        }

        res.json({
            matches: matches.matches,  // eligible + conditional combined
            categorized: {
                eligible: matches.categorized.eligible,
                conditional: matches.categorized.conditional,
                missing_requirements: matches.categorized.missing_requirements,
                ineligible: matches.categorized.ineligible,
                specific_reasons: matches.categorized.specific_reasons
            },
            count: matches.count,
            total_evaluated: matches.total_evaluated,
            hasMore: matches.hasMore,
            nextOffset: matches.nextOffset,
            student_summary: matches.student_summary  // New: math status info
        });
        
    } catch (error) {
        console.error('Find matches error:', error);
        res.status(500).json({ error: 'Failed to generate recommendations' });
    }
});

// GET /api/recommendations/saved
router.get('/saved', authenticate, async (req, res) => {
    try {
        const { query } = require('../config/database');
        
        const result = await query(`
            SELECT 
                r.*,
                c.name as course_name,
                c.faculty,
                c.duration_years,
                u.name as university_name,
                u.acronym as university_acronym
            FROM recommendations r
            JOIN courses c ON r.course_id = c.id
            JOIN universities u ON c.university_id = u.id
            WHERE r.user_id = $1
            AND r.expires_at > CURRENT_TIMESTAMP
            ORDER BY r.generated_at DESC
        `, [req.user.id]);
        
        res.json({ recommendations: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

module.exports = router;