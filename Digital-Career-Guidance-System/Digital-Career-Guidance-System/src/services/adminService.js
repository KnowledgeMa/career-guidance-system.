const { query } = require('../config/database');

class AdminService {
    // Dashboard statistics
    async getDashboardStats() {
        const stats = {};

        // User statistics
        const userStats = await query(`
            SELECT
                COUNT(*) as total_users,
                COUNT(CASE WHEN role = 'student' THEN 1 END) as students,
                COUNT(CASE WHEN role = 'parent' THEN 1 END) as parents,
                COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins,
                COUNT(CASE WHEN last_login > NOW() - INTERVAL '30 days' THEN 1 END) as active_users
            FROM users
        `);
        stats.users = userStats.rows[0];

        // Assessment statistics
        const assessmentStats = await query(`
            SELECT
                COUNT(*) as total_assessments,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_assessments,
                AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_completion_time_minutes
            FROM assessments
            WHERE status = 'completed' AND completed_at IS NOT NULL
        `);
        stats.assessments = assessmentStats.rows[0];

        // OCR statistics
        const ocrStats = await query(`
            SELECT
                COUNT(*) as total_uploads,
                COUNT(CASE WHEN ocr_status = 'completed' THEN 1 END) as successful_ocr,
                COUNT(CASE WHEN ocr_status = 'failed' THEN 1 END) as failed_ocr,
                AVG(aps_score) as avg_aps_score
            FROM result_uploads
            WHERE ocr_status IN ('completed', 'confirmed')
        `);
        stats.ocr = ocrStats.rows[0];

        // Safety flags
        const safetyStats = await query(`
            SELECT
                COUNT(*) as total_flags,
                COUNT(CASE WHEN reviewed_by_admin = true THEN 1 END) as reviewed_flags
            FROM safety_flags
        `);
        stats.safety = safetyStats.rows[0];

        // Course recommendations
        const courseStats = await query(`
            SELECT COUNT(*) as total_courses FROM courses
        `);
        stats.courses = courseStats.rows[0];

        return stats;
    }

    // User management
    async getUsers(page = 1, limit = 20, filters = {}) {
        const offset = (page - 1) * limit;
        let whereClause = '';
        const params = [];
        let paramIndex = 1;

        if (filters.role) {
            whereClause += ` AND u.role = $${paramIndex}`;
            params.push(filters.role);
            paramIndex++;
        }
        if (filters.email) {
            whereClause += ` AND u.email ILIKE $${paramIndex}`;
            params.push(`%${filters.email}%`);
            paramIndex++;
        }
        if (filters.grade) {
            whereClause += ` AND sp.grade = $${paramIndex}`;
            params.push(filters.grade);
            paramIndex++;
        }

        const usersQuery = `
            SELECT
                u.id, u.email, u.role, u.email_verified, u.created_at, u.last_login,
                sp.first_name, sp.last_name, sp.grade, sp.school, sp.province, sp.profile_completion
            FROM users u
            LEFT JOIN student_profiles sp ON u.id = sp.user_id
            WHERE 1=1 ${whereClause}
            ORDER BY u.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const countQuery = `
            SELECT COUNT(*) as total
            FROM users u
            LEFT JOIN student_profiles sp ON u.id = sp.user_id
            WHERE 1=1 ${whereClause}
        `;

        const [usersResult, countResult] = await Promise.all([
            query(usersQuery, params),
            query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
        ]);

        return {
            users: usersResult.rows,
            total: parseInt(countResult.rows[0].total),
            page,
            limit,
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    async updateUser(userId, updates) {
        const { role, email_verified } = updates;
        const updateFields = [];
        const params = [];
        let paramIndex = 1;

        if (role) {
            updateFields.push(`role = $${paramIndex}`);
            params.push(role);
            paramIndex++;
        }
        if (email_verified !== undefined) {
            updateFields.push(`email_verified = $${paramIndex}`);
            params.push(email_verified);
            paramIndex++;
        }

        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }

        params.push(userId);

        const result = await query(`
            UPDATE users
            SET ${updateFields.join(', ')}, updated_at = NOW()
            WHERE id = $${paramIndex}
            RETURNING id, email, role, email_verified, updated_at
        `, params);

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        return result.rows[0];
    }

    async deleteUser(userId) {
        // Start transaction
        await query('BEGIN');

        try {
            // Delete related data first
            await query('DELETE FROM safety_flags WHERE flagged_in_conversation IN (SELECT id FROM chat_sessions WHERE user_id = $1)', [userId]);
            await query('DELETE FROM chat_sessions WHERE user_id = $1', [userId]);
            await query('DELETE FROM assessments WHERE user_id = $1', [userId]);
            await query('DELETE FROM result_uploads WHERE user_id = $1', [userId]);
            await query('DELETE FROM results WHERE user_id = $1', [userId]);
            await query('DELETE FROM student_profiles WHERE user_id = $1', [userId]);
            await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
            await query('DELETE FROM password_resets WHERE user_id = $1', [userId]);

            // Delete user
            const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

            await query('COMMIT');

            return result.rows.length > 0;
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
    }

    // Assessment management
    async getAssessmentQuestions() {
        const result = await query(`
            SELECT id, category, question_text, riasec_dimension, weight, created_at
            FROM assessment_questions
            ORDER BY category, id
        `);
        return result.rows;
    }

    async updateAssessmentQuestion(questionId, updates) {
        const { question_text, riasec_dimension, weight } = updates;
        const result = await query(`
            UPDATE assessment_questions
            SET question_text = $1, riasec_dimension = $2, weight = $3, updated_at = NOW()
            WHERE id = $4
            RETURNING *
        `, [question_text, riasec_dimension, weight, questionId]);

        if (result.rows.length === 0) {
            throw new Error('Question not found');
        }

        return result.rows[0];
    }

    // OCR Results management
    async getOCRUploads(page = 1, limit = 20, filters = {}) {
        const offset = (page - 1) * limit;
        let whereClause = '';
        const params = [];
        let paramIndex = 1;

        if (filters.status) {
            whereClause += ` AND ru.ocr_status = $${paramIndex}`;
            params.push(filters.status);
            paramIndex++;
        }
        if (filters.user_email) {
            whereClause += ` AND u.email ILIKE $${paramIndex}`;
            params.push(`%${filters.user_email}%`);
            paramIndex++;
        }

        const uploadsQuery = `
            SELECT
                ru.id, ru.user_id, ru.cloudinary_url, ru.ocr_status, ru.aps_score,
                ru.gemini_response, ru.groq_parsed, ru.ocr_error, ru.created_at, ru.processed_at,
                u.email, sp.first_name, sp.last_name
            FROM result_uploads ru
            JOIN users u ON ru.user_id = u.id
            LEFT JOIN student_profiles sp ON u.id = sp.user_id
            WHERE 1=1 ${whereClause}
            ORDER BY ru.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const countQuery = `
            SELECT COUNT(*) as total
            FROM result_uploads ru
            JOIN users u ON ru.user_id = u.id
            WHERE 1=1 ${whereClause}
        `;

        const [uploadsResult, countResult] = await Promise.all([
            query(uploadsQuery, params),
            query(countQuery, params.slice(0, -2))
        ]);

        return {
            uploads: uploadsResult.rows,
            total: parseInt(countResult.rows[0].total),
            page,
            limit,
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    // Safety flags
    async getSafetyFlags(page = 1, limit = 20, reviewed = null) {
        const offset = (page - 1) * limit;
        let whereClause = '';
        const params = [];

        if (reviewed !== null) {
            whereClause = 'WHERE reviewed_by_admin = $1';
            params.push(reviewed);
        }

        params.push(limit, offset);

        const flagsQuery = `
            SELECT
                sf.id, sf.flagged_in_conversation, sf.flag_type, sf.confidence,
                sf.details, sf.reviewed_by_admin, sf.created_at,
                cs.user_id, u.email, sp.first_name, sp.last_name
            FROM safety_flags sf
            JOIN chat_sessions cs ON sf.flagged_in_conversation = cs.id
            JOIN users u ON cs.user_id = u.id
            LEFT JOIN student_profiles sp ON u.id = sp.user_id
            ${whereClause}
            ORDER BY sf.created_at DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM safety_flags sf
            ${whereClause.replace('WHERE', '') ? 'WHERE ' + whereClause.replace('WHERE', '') : ''}
        `;

        const [flagsResult, countResult] = await Promise.all([
            query(flagsQuery, params),
            query(countQuery, params.slice(0, -2))
        ]);

        return {
            flags: flagsResult.rows,
            total: parseInt(countResult.rows[0].total),
            page,
            limit,
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    async markSafetyFlagReviewed(flagId, adminId) {
        const result = await query(`
            UPDATE safety_flags
            SET reviewed_by_admin = true, reviewed_at = NOW(), reviewed_by = $2
            WHERE id = $1
            RETURNING *
        `, [flagId, adminId]);

        if (result.rows.length === 0) {
            throw new Error('Safety flag not found');
        }

        return result.rows[0];
    }

    // Universities and Courses
    async getUniversities() {
        const result = await query(`
            SELECT id, name, acronym, province, website, aps_calculation_method, created_at
            FROM universities
            ORDER BY name
        `);
        return result.rows;
    }

    async getCourses(universityId = null, page = 1, limit = 50) {
        const offset = (page - 1) * limit;
        let whereClause = '';
        const params = [limit, offset];

        if (universityId) {
            whereClause = 'WHERE c.university_id = $3';
            params.push(universityId);
        }

        const coursesQuery = `
            SELECT
                c.id, c.university_id, c.faculty, c.name, c.code, c.nqf_level,
                c.career_outcomes, c.created_at,
                u.name as university_name, u.acronym
            FROM courses c
            JOIN universities u ON c.university_id = u.id
            ${whereClause}
            ORDER BY u.name, c.faculty, c.name
            LIMIT $1 OFFSET $2
        `;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM courses c
            ${universityId ? 'WHERE c.university_id = $1' : ''}
        `;
        const countParams = universityId ? [universityId] : [];

        const [coursesResult, countResult] = await Promise.all([
            query(coursesQuery, params),
            query(countQuery, countParams)
        ]);

        return {
            courses: coursesResult.rows,
            total: parseInt(countResult.rows[0].total),
            page,
            limit,
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    // Audit logs
    async getAuditLogs(page = 1, limit = 50) {
        const offset = (page - 1) * limit;
        const logsQuery = `
            SELECT
                al.id, al.admin_id, al.action, al.target_table, al.target_id,
                al.old_data, al.new_data, al.ip_address, u.created_at,
                u.email as admin_email
            FROM admin_audit_log al
            JOIN users u ON al.admin_id = u.id
            ORDER BY u.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = 'SELECT COUNT(*) as total FROM admin_audit_log';

        const [logsResult, countResult] = await Promise.all([
            query(logsQuery, [limit, offset]),
            query(countQuery)
        ]);

        return {
            logs: logsResult.rows,
            total: parseInt(countResult.rows[0].total),
            page,
            limit,
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    async logAdminAction(adminId, action, targetTable, targetId, oldData, newData, ipAddress) {
        await query(`
            INSERT INTO admin_audit_log (admin_id, action, target_table, target_id, old_data, new_data, ip_address)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [adminId, action, targetTable, targetId, JSON.stringify(oldData), JSON.stringify(newData), ipAddress]);
    }
}

module.exports = new AdminService();