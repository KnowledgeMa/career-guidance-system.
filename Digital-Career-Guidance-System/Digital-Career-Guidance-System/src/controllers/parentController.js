const { query } = require('../config/database');

class ParentController {
    // Parent Dashboard
    async getDashboard(req, res) {
        try {
            const parentId = req.user.id;

            // Get parent's children
            const childrenResult = await query(`
                SELECT
                    sp.id, sp.first_name, sp.last_name, sp.grade, sp.school, sp.province,
                    sp.profile_completion,
                    u.email, u.created_at as account_created,
                    u.last_login,
                    CASE WHEN EXISTS(SELECT 1 FROM results r WHERE r.user_id = sp.user_id) THEN true ELSE false END as has_results,
                    CASE WHEN EXISTS(SELECT 1 FROM assessments a WHERE a.user_id = sp.user_id AND a.status = 'completed') THEN true ELSE false END as has_assessment
                FROM student_profiles sp
                JOIN users u ON sp.user_id = u.id
                WHERE sp.parent_id = $1
                ORDER BY sp.first_name, sp.last_name
            `, [parentId]);

            const children = childrenResult.rows;

            // Get summary stats
            const stats = {
                totalChildren: children.length,
                childrenWithResults: children.filter(c => c.has_results).length,
                childrenWithAssessments: children.filter(c => c.has_assessment).length,
                avgProfileCompletion: children.length > 0 ?
                    Math.round(children.reduce((sum, c) => sum + (c.profile_completion || 0), 0) / children.length) : 0
            };

            res.render('parent/dashboard', {
                title: 'Parent Dashboard',
                activePage: 'parent-dashboard',
                children,
                stats,
                scripts: ['parent-dashboard']
            });
        } catch (error) {
            console.error('Parent dashboard error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    // Get all children
    async getChildren(req, res) {
        try {
            const parentId = req.user.id;

            const childrenResult = await query(`
                SELECT
                    sp.id, sp.first_name, sp.last_name, sp.grade, sp.school, sp.province,
                    sp.profile_completion,
                    u.email, u.created_at as account_created,
                    u.last_login
                FROM student_profiles sp
                JOIN users u ON sp.user_id = u.id
                WHERE sp.parent_id = $1
                ORDER BY sp.first_name, sp.last_name
            `, [parentId]);

            res.json({ children: childrenResult.rows });
        } catch (error) {
            console.error('Get children error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get specific child details
    async getChildDetails(req, res) {
        try {
            const parentId = req.user.id;
            const childId = req.params.childId;

            // Verify the child belongs to this parent
            const childResult = await query(`
                SELECT
                    sp.id, sp.first_name, sp.last_name, sp.grade, sp.school, sp.province,
                    sp.profile_completion,
                    u.email, u.created_at as account_created,
                    u.last_login
                FROM student_profiles sp
                JOIN users u ON sp.user_id = u.id
                WHERE sp.id = $1 AND sp.parent_id = $2
            `, [childId, parentId]);

            if (childResult.rows.length === 0) {
                return res.status(404).json({ error: 'Child not found' });
            }

            res.json({ child: childResult.rows[0] });
        } catch (error) {
            console.error('Get child details error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get child's results
    async getChildResults(req, res) {
        try {
            const parentId = req.user.id;
            const childId = req.params.childId;

            // First verify the child belongs to this parent
            const childCheck = await query(`
                SELECT sp.user_id
                FROM student_profiles sp
                WHERE sp.id = $1 AND sp.parent_id = $2
            `, [childId, parentId]);

            if (childCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Child not found' });
            }

            const childUserId = childCheck.rows[0].user_id;

            // Get results
            const resultsResult = await query(`
                SELECT
                    r.subject, r.mark, r.level, r.aps_points,
                    r.year, r.created_at
                FROM results r
                WHERE r.user_id = $1
                ORDER BY r.subject
            `, [childUserId]);

            res.json({ results: resultsResult.rows });
        } catch (error) {
            console.error('Get child results error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Get child's assessment
    async getChildAssessment(req, res) {
        try {
            const parentId = req.user.id;
            const childId = req.params.childId;

            // First verify the child belongs to this parent
            const childCheck = await query(`
                SELECT sp.user_id
                FROM student_profiles sp
                WHERE sp.id = $1 AND sp.parent_id = $2
            `, [childId, parentId]);

            if (childCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Child not found' });
            }

            const childUserId = childCheck.rows[0].user_id;

            // Get latest completed assessment
            const assessmentResult = await query(`
                SELECT
                    a.status, a.dominant_code, a.secondary_code,
                    a.career_matches, a.profile_summary, a.completed_at,
                    a.time_spent_minutes
                FROM assessments a
                WHERE a.user_id = $1 AND a.status = 'completed'
                ORDER BY a.completed_at DESC
                LIMIT 1
            `, [childUserId]);

            if (assessmentResult.rows.length === 0) {
                return res.json({ assessment: null, message: 'No completed assessment found' });
            }

            res.json({ assessment: assessmentResult.rows[0] });
        } catch (error) {
            console.error('Get child assessment error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = new ParentController();