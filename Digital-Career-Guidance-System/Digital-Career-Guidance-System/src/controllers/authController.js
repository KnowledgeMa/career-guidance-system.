const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const { query } = require('../config/database');
const { generateTokens } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Email transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const AuthController = {
    // Student/Parent Registration
    register: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password, firstName, lastName, grade, school, province, role } = req.body;
            
            // Check if user exists
            const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
            if (existingUser.rows.length > 0) {
                return res.status(409).json({ error: 'Email already registered' });
            }

            // Hash password
            const saltRounds = 12;
            const passwordHash = await bcrypt.hash(password, saltRounds);

            // Create user
            const userResult = await query(
                `INSERT INTO users (email, password_hash, role) 
                 VALUES ($1, $2, $3) RETURNING id, email, role, created_at`,
                [email, passwordHash, role || 'student']
            );
            const user = userResult.rows[0];

            // Create profile
            await query(
                `INSERT INTO student_profiles (user_id, first_name, last_name, grade, school, province) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [user.id, firstName, lastName, grade, school, province]
            );

            // Generate tokens
            const { accessToken, refreshToken } = generateTokens(user.id, user.role);

            // Store refresh token hash
            const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            await query(
                'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
                [user.id, refreshTokenHash, expiresAt]
            );

            // Set cookies
            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: parseInt(process.env.JWT_ACCESS_COOKIE_MAX_AGE) || 15 * 60 * 1000 // 15 minutes default
            });

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            res.status(201).json({
                message: 'Registration successful',
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    firstName,
                    lastName
                }
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // Login
    login: async (req, res) => {
        try {
            const { email, password } = req.body;

            // Get user with password
            const result = await query(
                'SELECT id, email, password_hash, role, email_verified FROM users WHERE email = $1',
                [email]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const user = result.rows[0];

            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Update last login
            await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

            // Generate tokens
            const { accessToken, refreshToken } = generateTokens(user.id, user.role);

            // Store refresh token
            const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            await query(
                'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
                [user.id, refreshTokenHash, expiresAt]
            );

            // Set cookies
            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: parseInt(process.env.JWT_ACCESS_COOKIE_MAX_AGE) || 15 * 60 * 1000
            });

            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            // Get profile data
            const profileResult = await query(
                'SELECT first_name, last_name, profile_completion FROM student_profiles WHERE user_id = $1',
                [user.id]
            );

            res.json({
                message: 'Login successful',
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    emailVerified: user.email_verified,
                    ...profileResult.rows[0]
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // Refresh access token
    refresh: async (req, res) => {
        try {
            const refreshToken = req.cookies.refreshToken;
            
            if (!refreshToken) {
                return res.status(401).json({ error: 'No refresh token' });
            }

            // Verify token
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            
            // Check if token exists in DB and is not revoked
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const tokenResult = await query(
                'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
                [tokenHash]
            );

            if (tokenResult.rows.length === 0) {
                return res.status(401).json({ error: 'Invalid refresh token' });
            }

            // Revoke old token
            await query('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1', 
                [tokenResult.rows[0].id]);

            // Generate new tokens
            const userResult = await query('SELECT id, role FROM users WHERE id = $1', [decoded.userId]);
            const { accessToken, refreshToken: newRefreshToken } = generateTokens(
                userResult.rows[0].id, 
                userResult.rows[0].role
            );

            // Store new refresh token
            const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            await query(
                'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
                [decoded.userId, newTokenHash, expiresAt]
            );

            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: parseInt(process.env.JWT_ACCESS_COOKIE_MAX_AGE) || 15 * 60 * 1000
            });

            res.cookie('refreshToken', newRefreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            res.json({ message: 'Token refreshed' });

        } catch (error) {
            res.status(401).json({ error: 'Invalid refresh token' });
        }
    },

    // Logout
    logout: async (req, res) => {
        try {
            const refreshToken = req.cookies.refreshToken;
            
            if (refreshToken) {
                const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
                await query('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1', 
                    [tokenHash]);
            }

            res.clearCookie('accessToken');
            res.clearCookie('refreshToken');
            
            res.json({ message: 'Logged out successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // GET /api/auth/me - Get current user with full profile (FIXED: Removed duplicate 'me' method)
    getMe: async (req, res) => {
        try {
            // Check if results table exists
            const tableCheck = await query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'results'
                ) as exists
            `);
            const hasResultsTable = tableCheck.rows[0].exists;

            // Check if assessments table exists  
            const assessCheck = await query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'assessments'
                ) as exists
            `);
            const hasAssessmentsTable = assessCheck.rows[0].exists;

            const result = await query(`
                SELECT 
                    u.id, u.email, u.role, u.email_verified, u.created_at,
                    sp.first_name, sp.last_name, sp.grade, sp.school, 
                    sp.province, sp.profile_completion, sp.parent_id,
                    ${hasResultsTable ? 'EXISTS(SELECT 1 FROM results WHERE user_id = u.id)' : 'FALSE'} as has_results,
                    ${hasAssessmentsTable ? 'EXISTS(SELECT 1 FROM assessments WHERE user_id = u.id)' : 'FALSE'} as has_assessment
                FROM users u
                LEFT JOIN student_profiles sp ON u.id = sp.user_id
                WHERE u.id = $1
            `, [req.user.id]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ user: result.rows[0] });
        } catch (error) {
            console.error('GetMe error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // getMe: async (req, res) => {
    //     try {
    //         const tablesResult = await query(`
    //             SELECT table_name 
    //             FROM information_schema.tables 
    //             WHERE table_schema = 'public' 
    //             AND table_name IN ('results', 'assessments', 'applications')
    //         `);
            
    //         const existingTables = tablesResult.rows.map(r => r.table_name);
    //         const hasResults = existingTables.includes('results');
    //         const hasAssessments = existingTables.includes('assessments');
    //         const hasApplications = existingTables.includes('applications');

    //         let queryStr = `
    //             SELECT 
    //                 u.id, u.email, u.role, u.email_verified, u.created_at,
    //                 sp.first_name, sp.last_name, sp.grade, sp.school, 
    //                 sp.province, sp.profile_completion, sp.parent_id
    //         `;

    //         if (hasResults) {
    //             queryStr += `, EXISTS(SELECT 1 FROM results WHERE user_id = u.id) as has_results`;
    //         } else {
    //             queryStr += `, FALSE as has_results`;
    //         }

    //         if (hasAssessments) {
    //             queryStr += `, EXISTS(SELECT 1 FROM assessments WHERE user_id = u.id) as has_assessment`;
    //         } else {
    //             queryStr += `, FALSE as has_assessment`;
    //         }

    //         if (hasApplications) {
    //             queryStr += `, (SELECT COUNT(*) FROM applications WHERE user_id = u.id) as application_count`;
    //         } else {
    //             queryStr += `, 0 as application_count`;
    //         }

    //         queryStr += `
    //             FROM users u
    //             LEFT JOIN student_profiles sp ON u.id = sp.user_id
    //             WHERE u.id = $1
    //         `;

    //         const result = await query(queryStr, [req.user.id]);

    //         if (result.rows.length === 0) {
    //             return res.status(404).json({ error: 'User not found' });
    //         }

    //         res.json({ user: result.rows[0] });
    //     } catch (error) {
    //         console.error('GetMe error:', error);
    //         res.status(500).json({ error: 'Internal server error' });
    //     }
    // },

    // PUT /api/auth/profile - Update profile
    
    updateProfile: async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { firstName, lastName, grade, school, province } = req.body;
            const userId = req.user.id;

            // Update profile
            await query(`
                UPDATE student_profiles 
                SET first_name = $1, last_name = $2, grade = $3, school = $4, province = $5
                WHERE user_id = $6
            `, [firstName, lastName, grade, school, province, userId]);

            // Recalculate completion - check which tables exist first
            const resultsCheck = await query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'results'
                ) as exists
            `);
            const hasResults = resultsCheck.rows[0].exists;

            let completion = 20; // Base 20 for profile
            
            if (hasResults) {
                const completionResult = await query(`
                    SELECT 
                        20 +
                        CASE WHEN EXISTS(SELECT 1 FROM results WHERE user_id = $1) THEN 25 ELSE 0 END
                        as completion
                    FROM student_profiles WHERE user_id = $1
                `, [userId]);
                completion = completionResult.rows[0]?.completion || 20;
            }

            await query('UPDATE student_profiles SET profile_completion = $1 WHERE user_id = $2', 
                [completion, userId]);

            res.json({ 
                message: 'Profile updated successfully',
                profile: { firstName, lastName, grade, school, province, completion }
            });

        } catch (error) {
            console.error('UpdateProfile error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // POST /api/auth/forgot-password
    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;
            
            // Always return success to prevent email enumeration
            const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
            
            if (userResult.rows.length > 0) {
                const token = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 3600000); // 1 hour

                await query(`
                    INSERT INTO password_resets (user_id, token_hash, expires_at)
                    VALUES ($1, $2, $3)
                `, [userResult.rows[0].id, crypto.createHash('sha256').update(token).digest('hex'), expiresAt]);

                // Send email using nodemailer (only log in development)
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[DEV ONLY] Password reset link: http://localhost:3000/reset-password?token=${token}`);
                } else {
                    // TODO: Implement actual email sending with nodemailer
                    // sendPasswordResetEmail(email, token);
                }
            }

            res.json({ message: 'If an account exists, a reset link has been sent' });
        } catch (error) {
            console.error('ForgotPassword error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // POST /api/auth/reset-password
    resetPassword: async (req, res) => {
        try {
            const { token, newPassword } = req.body;
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

            const resetResult = await query(`
                SELECT user_id FROM password_resets 
                WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL
            `, [tokenHash]);

            if (resetResult.rows.length === 0) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }

            const passwordHash = await bcrypt.hash(newPassword, 12);
            
            await query('UPDATE users SET password_hash = $1 WHERE id = $2', 
                [passwordHash, resetResult.rows[0].user_id]);
            
            await query('UPDATE password_resets SET used_at = NOW() WHERE token_hash = $1', 
                [tokenHash]);

            res.json({ message: 'Password reset successful' });
        } catch (error) {
            console.error('ResetPassword error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // POST /api/auth/change-password
    changePassword: async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.id;

            // Verify current password
            const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
            const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
            
            if (!valid) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            const newHash = await bcrypt.hash(newPassword, 12);
            await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

            res.json({ message: 'Password changed successfully' });
        } catch (error) {
            console.error('ChangePassword error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // GET /api/auth/users (Admin only)
    listUsers: async (req, res) => {
        try {
            // FIXED: Parse and validate page and limit parameters
            let page = Math.max(1, parseInt(req.query.page) || 1);
            let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const offset = (page - 1) * limit;
            
            const { role, search } = req.query;

            let whereClause = 'WHERE 1=1';
            const params = [];
            
            if (role) {
                params.push(role);
                whereClause += ` AND role = $${params.length}`;
            }
            
            if (search) {
                params.push(`%${search}%`);
                whereClause += ` AND email ILIKE $${params.length}`;
            }

            const countResult = await query(`SELECT COUNT(*) FROM users ${whereClause}`, params);
            const total = parseInt(countResult.rows[0].count);

            params.push(limit, offset);
            const usersResult = await query(`
                SELECT u.id, u.email, u.role, u.created_at, u.last_login,
                    sp.first_name, sp.last_name, sp.profile_completion
                FROM users u
                LEFT JOIN student_profiles sp ON u.id = sp.user_id
                ${whereClause}
                ORDER BY u.created_at DESC
                LIMIT $${params.length - 1} OFFSET $${params.length}
            `, params);

            res.json({
                users: usersResult.rows,
                pagination: {
                    total,
                    page: page,
                    limit: limit,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('ListUsers error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};



module.exports = AuthController;