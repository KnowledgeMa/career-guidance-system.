const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');

// Generate tokens
const generateTokens = (userId, role) => {
    const accessToken = jwt.sign(
        { userId, role, type: 'access' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRY }
    );
    
    const refreshToken = jwt.sign(
        { userId, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRY }
    );
    
    return { accessToken, refreshToken };
};

// Verify access token middleware
const authenticate = async (req, res, next) => {
    try {
        const token = req.cookies.accessToken || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            console.log('[AUTH] No token found. Cookies:', req.cookies);
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        console.log('[AUTH] Token received, attempting verification...');
        console.log('[AUTH] Token length:', token.length);
        console.log('[AUTH] JWT_ACCESS_SECRET exists:', !!process.env.JWT_ACCESS_SECRET);
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        
        // Verify user still exists and is active
        const userResult = await query(
            `SELECT u.id, u.email, u.role, u.email_verified,
                    sp.first_name, sp.last_name
             FROM users u
             LEFT JOIN student_profiles sp ON u.id = sp.user_id
             WHERE u.id = $1`,
            [decoded.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User no longer exists' });
        }

        req.user = userResult.rows[0];
        next();
    } catch (error) {
        console.log('[AUTH] Verification error:', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token expired', 
                code: 'TOKEN_EXPIRED' 
            });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Role-based authorization
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// Rate limiting for auth routes
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis'); // We'll use memory store for Phase 0, Redis later

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many authentication attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    generateTokens,
    authenticate,
    authorize,
    authLimiter
};