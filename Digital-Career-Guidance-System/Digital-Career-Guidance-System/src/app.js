const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const authRoutes = require('./routes/auth');
const resultsRoutes = require('./routes/results');
const recommendationRoutes = require('./routes/recommendations');
const assessmentRoutes = require('./routes/assessment');
const chatRoutes = require('./routes/chat');
const parentRoutes = require('./routes/parent');
const { classifySubject } = require('./services/admissionService');
const { authenticate } = require('./middleware/auth');
const { csrfToken, validateCsrfToken } = require('./middleware/csrf');
require('dotenv').config();

const app = express();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'"], 
            // Add this line to allow onclick/onchange attributes fix this in development
            "script-src-attr": ["'unsafe-inline'"], 
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "https:"],
            "style-src": [
                "'self'",
                "'unsafe-inline'",
                "https://cdnjs.cloudflare.com"
            ],
        },
    },
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// CSRF Protection - conditionally disabled for testing.
if (process.env.DISABLE_CSRF === 'true') {
    console.log('⚠️  CSRF protection disabled for testing');
    app.use((req, res, next) => {
        res.locals.csrfToken = '';
        req.csrfToken = '';
        next();
    });
} else {
    app.use(csrfToken);
    app.use(validateCsrfToken);
}

// Static files
app.use(express.static(path.join(__dirname, './public')));


// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Layout setup


// Make user available to all views
app.use(async (req, res, next) => {
    res.locals.user = null;
    res.locals.activePage = '';
    res.locals.query = req.query;
    res.locals.csrfToken = req.csrfToken || '';
    
    if (req.cookies.accessToken) {
        try {
            const decoded = jwt.verify(req.cookies.accessToken, process.env.JWT_ACCESS_SECRET);
            const { query } = require('./config/database');
            
            // Get user + profile
            const userResult = await query(`
                SELECT u.id, u.email, u.role, u.email_verified, u.created_at,
                    sp.first_name, sp.last_name, sp.grade, sp.school, 
                    sp.province, sp.profile_completion
                FROM users u
                LEFT JOIN student_profiles sp ON u.id = sp.user_id
                WHERE u.id = $1
            `, [decoded.userId]);
            
            if (userResult.rows.length === 0) {
                return next();
            }
            
            const user = userResult.rows[0];
            
            // Get results with math classification
            const resultsResult = await query(`
                SELECT subject, mark, level, aps_points
                FROM results 
                WHERE user_id = $1 
                ORDER BY aps_points DESC, subject ASC
            `, [decoded.userId]);
            
            user.subjects = resultsResult.rows;
            user.has_results = resultsResult.rows.length > 0;
            
            // Classify math subjects
            const mathTypes = resultsResult.rows.map(s => {
                const name = s.subject.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (name === 'mathematics' || name === 'coremathematics') return 'core';
                if (name.includes('mathematicalliteracy') || name === 'mathliteracy') return 'lit';
                if (name.includes('technicalmathematics') || name === 'techmath') return 'tech';
                return 'other';
            });
            
            user.has_core_math = mathTypes.includes('core');
            user.has_math_lit = mathTypes.includes('lit');
            user.has_tech_math = mathTypes.includes('tech');
            
            // Get latest APS score
            const uploadResult = await query(`
                SELECT aps_score, ocr_status
                FROM result_uploads
                WHERE user_id = $1 AND ocr_status IN ('completed', 'confirmed')
                ORDER BY processed_at DESC
                LIMIT 1
            `, [decoded.userId]);
            
            user.latest_aps_score = uploadResult.rows[0]?.aps_score || null;
            user.upload_status = uploadResult.rows[0]?.ocr_status || 'none';
            
            // Get assessment data
            const assessmentResult = await query(`
                SELECT id, status, dominant_code, secondary_code, riasec_scores, 
                       completed_at, personality_narrative, strengths_analysis
                FROM assessments 
                WHERE user_id = $1 AND status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 1
            `, [decoded.userId]);
            
            user.has_assessment = assessmentResult.rows.length > 0;
            if (user.has_assessment) {
                const assessment = assessmentResult.rows[0];
                user.assessment = {
                    id: assessment.id,
                    dominant_code: assessment.dominant_code,
                    secondary_code: assessment.secondary_code,
                    riasec_scores: assessment.riasec_scores,
                    completed_at: assessment.completed_at,
                    personality_narrative: assessment.personality_narrative,
                    strengths: assessment.strengths_analysis
                };
            }
            
            // Get recommendations count
            const recommendationsResult = await query(`
                SELECT COUNT(*) as count
                FROM assessment_course_matches acm
                JOIN assessments a ON acm.assessment_id = a.id
                WHERE a.user_id = $1 AND a.status = 'completed'
            `, [decoded.userId]);
            
            user.recommendations_count = parseInt(recommendationsResult.rows[0].count) || 0;
            
            // Get chat history count
            const chatResult = await query(`
                SELECT COUNT(*) as count
                FROM chat_sessions 
                WHERE user_id = $1
            `, [decoded.userId]);
            
            user.chat_sessions_count = parseInt(chatResult.rows[0].count) || 0;
            
            // Get recent activity (last 7 days)
            const activityResult = await query(`
                SELECT 
                    'upload' as type, processed_at as timestamp, 'Results uploaded' as description
                FROM result_uploads 
                WHERE user_id = $1 AND processed_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
                UNION ALL
                SELECT 
                    'assessment' as type, completed_at as timestamp, 'Assessment completed' as description
                FROM assessments 
                WHERE user_id = $1 AND completed_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
                ORDER BY timestamp DESC
                LIMIT 5
            `, [decoded.userId]);
            
            user.recent_activity = activityResult.rows;
            
            res.locals.user = user;
            
        } catch (e) {
            if (!e.message.includes('does not exist')) {
                console.error('User middleware error:', e.message);
            }
        }
    }
    next();
});

const syncUser = (req, res, next) => {
    if (req.user && !res.locals.user) {
        res.locals.user = req.user;
    }
    next();
};

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/parent', parentRoutes);

// Admin Page Routes
app.use('/admin', require('./routes/adminPages'));

// Parent Page Routes
app.use('/parent', require('./routes/parentPages'));

// Page Routes
app.get('/', (req, res) => {
    if (res.locals.user) return res.redirect('/dashboard');
    res.render('pages/index', { 
        title: 'Welcome',
        scripts: ['landing']
    });
});

app.get('/login', (req, res) => res.redirect('/?tab=login'));
app.get('/register', (req, res) => res.redirect('/?tab=register'));

app.get('/dashboard', authenticate, syncUser, (req, res) => {
    // Redirect admin users to admin dashboard
    if (res.locals.user && (res.locals.user.role === 'admin' || res.locals.user.role === 'superadmin')) {
        return res.redirect('/admin/dashboard');
    }

    // Redirect parent users to parent dashboard
    if (res.locals.user && res.locals.user.role === 'parent') {
        return res.redirect('/parent/dashboard');
    }

    res.render('pages/dashboard', {
        title: 'Dashboard',
        activePage: 'dashboard',
        scripts: ['dashboard']
    });
});

app.get('/profile', authenticate, syncUser, (req, res) => {
    res.render('pages/profile', {
        title: 'Edit Profile',
        activePage: 'profile',
        scripts: ['profile']
    });
});


// Add page route
app.get('/upload', authenticate, (req, res) => {
    res.render('pages/upload', {
        title: 'Upload Results',
        activePage: 'upload',
        scripts: ['upload']
    });
});

app.get('/forgot-password', (req, res) => {
    res.render('pages/forgot-password', {
        title: 'Reset Password',
        scripts: ['forgot-password']
    });
});

app.get('/reset-password', (req, res) => {
    res.render('pages/reset-password', {
        title: 'Create New Password',
        token: req.query.token,
        scripts: ['reset-password']
    });
});

app.get('/recommendations', authenticate, (req, res) => {
    res.render('pages/recommendations', {
        title: 'Your Recommendations',
        activePage: 'recommendations',
        csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
});

// Phase 3: Assessment Routes
app.get('/assessment', authenticate, (req, res) => {
    res.render('pages/assessment', {
        title: 'Career Assessment',
        activePage: 'assessment',
        scripts: ['assessment']
    });
});

app.get('/assessment/results', authenticate, (req, res) => {
    res.render('pages/assessment-results', {
        title: 'Your Career Profile',
        activePage: 'assessment',
        scripts: ['assessment-results']
    });
});

// AI Counselor Page
app.get('/counsellor', authenticate, (req, res) => {
    res.render('pages/ai-counselor', {
        title: 'AI Counselor',
        activePage: 'counselor',
        csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
});

app.get('/counselor', authenticate, (req, res) => {
    res.render('pages/ai-counselor', {
        title: 'AI Counselor',
        activePage: 'counselor',
        csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
});

// Health check 
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        phase: '0.1.0'
    });
});

// Error handlers
app.use((req, res) => {
    res.status(404).render('errors/404', { title: 'Page Not Found' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('errors/500', { title: 'Server Error' });
});

module.exports = app;