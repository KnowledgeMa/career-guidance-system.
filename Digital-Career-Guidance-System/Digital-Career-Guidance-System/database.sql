-- DCGS Phase 0 Database Schema
-- Run this in your Neon SQL Editor

-- Users table with role-based access
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('student', 'parent', 'admin', 'superadmin')) DEFAULT 'student',
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Student profiles
CREATE TABLE student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    grade VARCHAR(20),
    school VARCHAR(255),
    province VARCHAR(100),
    parent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    profile_completion INTEGER DEFAULT 0 CHECK (profile_completion BETWEEN 0 AND 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens for JWT rotation
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Result uploads (OCR processing tracking)
CREATE TABLE result_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    filename VARCHAR(255),
    original_name VARCHAR(255),
    cloudinary_url TEXT,
    cloudinary_public_id VARCHAR(255),
    ocr_status VARCHAR(50) CHECK (ocr_status IN ('processing', 'completed', 'failed', 'confirmed')) DEFAULT 'processing',
    ocr_raw_text TEXT,
    gemini_response JSONB,
    groq_parsed JSONB,
    aps_score INTEGER,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Confirmed results (stored after user confirmation)
CREATE TABLE results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    mark INTEGER NOT NULL,
    level INTEGER NOT NULL,
    aps_points INTEGER NOT NULL,
    year INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Password reset tokens
CREATE TABLE password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin audit log (Phase 0 setup for future use)
CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_table VARCHAR(100),
    target_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_student_profiles_user_id ON student_profiles(user_id);
CREATE INDEX idx_result_uploads_user_id ON result_uploads(user_id);
CREATE INDEX idx_results_user_id ON results(user_id);
CREATE INDEX idx_password_resets_token ON password_resets(token_hash);
CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);
CREATE INDEX idx_audit_admin_id ON admin_audit_log(admin_id);

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_results_updated_at BEFORE UPDATE ON results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE result_uploads ADD COLUMN ocr_error TEXT DEFAULT NULL;

//phase 2
-- Universities master table
CREATE TABLE universities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    acronym VARCHAR(10) UNIQUE NOT NULL,
    province VARCHAR(100),
    website VARCHAR(255),
    logo_url TEXT,
    aps_calculation_method VARCHAR(50) CHECK (aps_calculation_method IN ('standard', 'wits_bonus', 'up_exclusion', 'uj_differential')) DEFAULT 'standard',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Courses table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID REFERENCES universities(id) ON DELETE CASCADE,
    faculty VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    duration_years INTEGER,
    nqf_level INTEGER,
    description TEXT,
    career_outcomes TEXT[],
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced course requirements with SA-specific conditional logic
CREATE TABLE course_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    
    -- Differential APS Scoring (Maths vs Math Lit)
    base_min_aps INTEGER NOT NULL DEFAULT 0,
    math_lit_aps_penalty INTEGER DEFAULT 2, -- Usually +2 for Math Lit (e.g., UJ Architecture: 30→32)
    tech_math_aps_adjustment INTEGER DEFAULT 0, -- 0 means treated same as core Maths
    
    -- Subject requirements with alternatives (Level Scaling logic)
    -- Example: Maths L3 OR Math Lit L4/L5
    subject_requirements JSONB NOT NULL DEFAULT '[]',
    /* Schema for subject_requirements:
    [
      {
        "subject": "Mathematics",
        "alternative": "Mathematical Literacy", 
        "min_level": 5,
        "alt_min_level": 6,
        "required": true,
        "weight": "compulsory" -- or "recommended"
      },
      {
        "subject": "Physical Sciences",
        "min_level": 4,
        "required": false
      }
    ]
    */
    
    -- Technical Mathematics handling (TUT/UJ style)
    accepts_technical_math BOOLEAN DEFAULT false,
    technical_math_faculties JSONB DEFAULT '[]', -- e.g., ["Engineering", "IT", "Built Environment"]
    
    -- University-specific calculation rules (Wits bonus, UP exclusion, etc.)
    aps_calculation_rules JSONB DEFAULT '{}',
    /* Schema for aps_calculation_rules:
    {
      "exclude_lo": true,                    -- UP-style: exclude Life Orientation
      "bonus_subjects": ["English", "Mathematics"], -- Wits-style
      "bonus_threshold": 80,                 -- % required for bonus
      "bonus_points": 2,                     -- points to add (usually 2)
      "max_bonus_points": 4                  -- cap total bonus
    }
    */
    
    -- Compulsory languages (usually implicit but explicit for clarity)
    requires_first_language_level INTEGER DEFAULT 4,
    requires_additional_language_level INTEGER DEFAULT 3,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stored recommendations (evaluation results)
CREATE TABLE recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    
    -- Eligibility evaluation results
    eligibility_status VARCHAR(20) CHECK (eligibility_status IN ('ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE', 'MISSING_REQUIREMENTS')) NOT NULL,
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    
    -- APS breakdown (JSONB to store complex calculations)
    aps_breakdown JSONB NOT NULL,
    /* Schema:
    {
      "base_aps": 32,
      "adjusted_aps": 34,
      "math_penalty_applied": 0,
      "bonus_points": 2,
      "final_aps": 34,
      "subjects_used": [
        {"subject": "English HL", "mark": 82, "aps": 7, "bonus_applied": true}
      ]
    }
    */
    
    -- Detailed analysis
    subject_analysis JSONB DEFAULT '[]',
    narrative_reason TEXT,
    alternative_pathways JSONB DEFAULT '[]',
    
    -- Metadata
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE, -- Cache expiry (re-evaluate after result updates)
    viewed_by_user BOOLEAN DEFAULT FALSE,
    
    UNIQUE(user_id, course_id) -- One recommendation per user per course
);

-- Indexes for performance
CREATE INDEX idx_universities_acronym ON universities(acronym);
CREATE INDEX idx_courses_university_id ON courses(university_id);
CREATE INDEX idx_courses_faculty ON courses(faculty);
CREATE INDEX idx_course_req_course_id ON course_requirements(course_id);
CREATE INDEX idx_course_req_aps ON course_requirements(base_min_aps);
CREATE INDEX idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX idx_recommendations_course_id ON recommendations(course_id);
CREATE INDEX idx_recommendations_status ON recommendations(eligibility_status);
CREATE INDEX idx_recommendations_generated ON recommendations(generated_at);

-- Triggers for updated_at
CREATE TRIGGER update_universities_updated_at BEFORE UPDATE ON universities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_course_requirements_updated_at BEFORE UPDATE ON course_requirements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- PHASE 3: Career Assessment Engine Tables
-- ==========================================

CREATE TABLE assessment_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(20) CHECK (category IN ('personality', 'skills', 'interests', 'values', 'work_environment')) NOT NULL,
    question_text TEXT NOT NULL,
    riasec_dimension VARCHAR(20) CHECK (riasec_dimension IN ('R', 'I', 'A', 'S', 'E', 'C')) NOT NULL,
    question_type VARCHAR(20) DEFAULT 'likert',
    weight DECIMAL(3,2) DEFAULT 1.00,
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Career Clusters/Specializations
CREATE TABLE career_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    riasec_profile JSONB NOT NULL,
    key_subjects TEXT[],
    related_courses TEXT[],
    job_outlook TEXT,
    salary_range VARCHAR(50),
    growth_potential VARCHAR(20) CHECK (growth_potential IN ('high', 'medium', 'low')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Student Assessment Sessions
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('in_progress', 'completed', 'abandoned')) DEFAULT 'in_progress',

    responses JSONB DEFAULT '{}',
    riasec_scores JSONB DEFAULT '{}',
    dominant_code VARCHAR(2),
    secondary_code VARCHAR(2),
    career_matches JSONB DEFAULT '[]',
    profile_summary TEXT,
    personality_narrative TEXT,
    strengths_analysis JSONB DEFAULT '{}',
    work_style_description TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_question_index INTEGER DEFAULT 0,
    time_spent_minutes INTEGER DEFAULT 0,
    can_retake_after TIMESTAMP WITH TIME ZONE
);

-- Create partial unique index for one active assessment per user
CREATE UNIQUE INDEX idx_assessments_user_in_progress ON assessments(user_id) WHERE status = 'in_progress';

-- Assessment-Course Recommendations Link
CREATE TABLE assessment_course_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    match_score DECIMAL(4,3),
    match_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assessment_id, course_id)
);

-- Indexes for performance
CREATE INDEX idx_assessments_user_id ON assessments(user_id);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessments_dominant_code ON assessments(dominant_code);
CREATE INDEX idx_career_clusters_code ON career_clusters(code);
CREATE INDEX idx_career_clusters_active ON career_clusters(active);
CREATE INDEX idx_assessment_questions_category ON assessment_questions(category);
CREATE INDEX idx_assessment_questions_riasec ON assessment_questions(riasec_dimension);
CREATE INDEX idx_assessment_course_matches_assessment_id ON assessment_course_matches(assessment_id);

-- Function for updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_career_clusters_updated_at BEFORE UPDATE ON career_clusters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- PHASE 3: Seed Data - RIASEC Questions
-- ==========================================

INSERT INTO assessment_questions (category, question_text, riasec_dimension, question_type, weight, sort_order) VALUES
-- REALISTIC (R) - Hands-on, practical, concrete
('personality', 'I enjoy working with tools, machines, or equipment', 'R', 'likert', 1.0, 1),
('personality', 'I prefer hands-on activities over theoretical discussions', 'R', 'likert', 1.0, 2),
('skills', 'I am good at fixing mechanical or electrical problems', 'R', 'likert', 1.0, 3),
('interests', 'I would enjoy building or repairing things as a career', 'R', 'likert', 1.0, 4),
('work_environment', 'I prefer working outdoors or in varied environments', 'R', 'likert', 0.9, 5),
('values', 'Seeing tangible results from my work is important to me', 'R', 'likert', 0.9, 6),

-- INVESTIGATIVE (I) - Analytical, intellectual, scientific
('personality', 'I enjoy solving complex problems and puzzles', 'I', 'likert', 1.0, 7),
('personality', 'I am naturally curious about how things work', 'I', 'likert', 1.0, 8),
('skills', 'I excel at research and data analysis', 'I', 'likert', 1.0, 9),
('interests', 'I would enjoy a career in science, research, or technology', 'I', 'likert', 1.0, 10),
('work_environment', 'I prefer working independently on challenging tasks', 'I', 'likert', 0.9, 11),
('values', 'Intellectual challenge is more important than high salary', 'I', 'likert', 0.9, 12),

-- ARTISTIC (A) - Creative, expressive, original
('personality', 'I enjoy expressing myself through creative activities', 'A', 'likert', 1.0, 13),
('personality', 'I often come up with unique or unconventional ideas', 'A', 'likert', 1.0, 14),
('skills', 'I have talent in art, music, writing, or design', 'A', 'likert', 1.0, 15),
('interests', 'I would enjoy a career in the arts, media, or design', 'A', 'likert', 1.0, 16),
('work_environment', 'I prefer flexible schedules over strict routines', 'A', 'likert', 0.9, 17),
('values', 'Creative freedom is essential to my job satisfaction', 'A', 'likert', 0.9, 18),

-- SOCIAL (S) - Helping, teaching, healing
('personality', 'I enjoy helping others solve their problems', 'S', 'likert', 1.0, 19),
('personality', 'People often come to me for advice or support', 'S', 'likert', 1.0, 20),
('skills', 'I am good at explaining complex ideas to others', 'S', 'likert', 1.0, 21),
('interests', 'I would enjoy teaching, counseling, or healthcare', 'S', 'likert', 1.0, 22),
('work_environment', 'I thrive in collaborative team environments', 'S', 'likert', 0.9, 23),
('values', 'Making a positive impact on people''s lives is my priority', 'S', 'likert', 0.9, 24),

-- ENTERPRISING (E) - Leadership, persuasion, business
('personality', 'I enjoy leading groups and taking charge', 'E', 'likert', 1.0, 25),
('personality', 'I am comfortable taking risks for potential rewards', 'E', 'likert', 1.0, 26),
('skills', 'I am good at persuading and influencing others', 'E', 'likert', 1.0, 27),
('interests', 'I would enjoy running a business or managing people', 'E', 'likert', 1.0, 28),
('work_environment', 'I prefer competitive environments that reward performance', 'E', 'likert', 0.9, 29),
('values', 'Financial success and status are important to me', 'E', 'likert', 0.9, 30),

-- CONVENTIONAL (C) - Organized, detail-oriented, systematic
('personality', 'I prefer clear instructions and established procedures', 'C', 'likert', 1.0, 31),
('personality', 'I enjoy organizing and categorizing information', 'C', 'likert', 1.0, 32),
('skills', 'I am good at handling detailed work with accuracy', 'C', 'likert', 1.0, 33),
('interests', 'I would enjoy working with data, records, or financial systems', 'C', 'likert', 1.0, 34),
('work_environment', 'I prefer structured workplaces with clear hierarchies', 'C', 'likert', 0.9, 35),
('values', 'Job security and stability are my top priorities', 'C', 'likert', 0.9, 36);

-- ==========================================
-- PHASE 3: Seed Data - Career Clusters
-- ==========================================

INSERT INTO career_clusters (name, code, description, riasec_profile, key_subjects, related_courses, job_outlook, salary_range, growth_potential) VALUES
('Science, Technology, Engineering & Mathematics', 'STEM',
'Disciplines focused on scientific inquiry, technological innovation, engineering principles, and mathematical analysis. Includes research, development, and practical application of technical knowledge.',
'{"R": 0.7, "I": 0.9, "A": 0.4, "S": 0.3, "E": 0.4, "C": 0.5}',
'{"Mathematics", "Physical Sciences", "Life Sciences", "Information Technology"}',
'{"Engineering", "Computer Science", "Mathematics", "Physics", "Biotechnology", "Data Science"}',
'High demand for STEM professionals across all sectors. Critical skills shortage in SA.',
'R350,000 - R1,200,000+',
'high'),

('Health & Medical Sciences', 'HEALTH',
'Healthcare professions focused on patient care, medical research, public health, and wellbeing. Includes clinical practice, medical technology, and health administration.',
'{"R": 0.5, "I": 0.8, "A": 0.3, "S": 0.9, "E": 0.4, "C": 0.6}',
'{"Life Sciences", "Mathematics", "Physical Sciences"}',
'{"Medicine", "Nursing", "Pharmacy", "Physiotherapy", "Biomedical Science", "Psychology"}',
'Consistently growing sector with aging population. Major skills shortage in SA.',
'R280,000 - R2,000,000+',
'high'),

('Business, Economics & Management', 'BUSINESS',
'Commerce-focused careers including management, finance, marketing, human resources, and entrepreneurship. Emphasizes organizational operations and economic principles.',
'{"R": 0.3, "I": 0.5, "A": 0.3, "S": 0.5, "E": 0.9, "C": 0.7}',
'{"Mathematics", "Accounting", "Economics", "Business Studies"}',
'{"Commerce", "Business Science", "Economics", "Accounting", "Marketing", "Human Resources"}',
'Stable demand across industries. Entrepreneurship opportunities growing.',
'R250,000 - R1,500,000+',
'medium'),

('Arts, Media & Communications', 'ARTS',
'Creative and communicative professions spanning visual arts, performing arts, writing, media production, journalism, and public relations. Values originality and expression.',
'{"R": 0.3, "I": 0.3, "A": 0.9, "S": 0.5, "E": 0.5, "C": 0.3}',
'{"Languages", "Visual Arts", "Dramatic Arts", "History"}',
'{"Fine Arts", "Journalism", "Media Studies", "Film Production", "Graphic Design", "Creative Writing"}',
'Competitive field. Digital media skills highly valued. Freelance opportunities.',
'R180,000 - R800,000+',
'medium'),

('Education & Training', 'EDUCATION',
'Professionals who facilitate learning and development across all age groups. Includes teaching, educational psychology, curriculum development, and training coordination.',
'{"R": 0.3, "I": 0.6, "A": 0.5, "S": 0.9, "E": 0.5, "C": 0.6}',
'{"Languages", "Mathematics", "Life Sciences", "History", "Geography"}',
'{"Education", "Teaching", "Educational Psychology", "Curriculum Studies", "Special Needs Education"}',
'Constant demand. STEM and foundation phase teachers particularly needed.',
'R200,000 - R700,000+',
'high'),

('Law, Government & Public Service', 'LAW',
'Legal professions, public administration, policy development, and governance. Includes advocacy, legislation, civil service, and community development.',
'{"R": 0.3, "I": 0.7, "A": 0.4, "S": 0.6, "E": 0.6, "C": 0.7}',
'{"Languages", "History", "Life Sciences"}',
'{"Law", "LLB", "Public Administration", "Political Science", "International Relations", "Criminology"}',
'Competitive entry. Public sector expansion planned.',
'R240,000 - R1,000,000+',
'medium'),

('Agriculture, Environment & Sustainability', 'AGRI_ENV',
'Careers in food production, environmental science, conservation, and sustainable development. Combines fieldwork with scientific research.',
'{"R": 0.8, "I": 0.6, "A": 0.4, "S": 0.4, "E": 0.4, "C": 0.5}',
'{"Agricultural Sciences", "Life Sciences", "Geography", "Physical Sciences"}',
'{"Agriculture", "Environmental Science", "Forestry", "Viticulture", "Conservation", "Sustainable Development"}',
'Emerging focus on food security and climate adaptation. Growing sector.',
'R200,000 - R700,000+',
'high'),

('Engineering & Built Environment', 'ENGINEERING',
'Professional engineering disciplines and construction-related fields. Includes civil, mechanical, electrical, and chemical engineering, plus architecture and construction management.',
'{"R": 0.9, "I": 0.7, "A": 0.4, "S": 0.3, "E": 0.5, "C": 0.6}',
'{"Mathematics", "Physical Sciences", "Engineering Graphics", "Information Technology"}',
'{"Engineering", "Architecture", "Construction Management", "Town Planning", "Quantity Surveying"}',
'Critical skills shortage in SA. Infrastructure investment creating demand.',
'R350,000 - R1,500,000+',
'high'),

('Information & Communication Technology', 'ICT',
'Technology-focused careers in software development, network administration, cybersecurity, data analytics, and digital innovation. Rapidly evolving sector.',
'{"R": 0.4, "I": 0.9, "A": 0.5, "S": 0.3, "E": 0.5, "C": 0.6}',
'{"Mathematics", "Information Technology", "Physical Sciences"}',
'{"Computer Science", "Software Engineering", "Data Science", "Cybersecurity", "Information Systems", "AI"}',
'Fastest growing sector. Severe skills shortage. Remote work opportunities.',
'R300,000 - R1,500,000+',
'high'),

('Social & Community Services', 'SOCIAL',
'Helping professions focused on community welfare, social justice, counseling, and support services. Emphasizes empathy and advocacy.',
'{"R": 0.3, "I": 0.4, "A": 0.5, "S": 0.9, "E": 0.4, "C": 0.5}',
'{"Life Sciences", "Languages", "History", "Geography"}',
'{"Social Work", "Psychology", "Sociology", "Community Development", "NGO Management", "Counseling"}',
'Government priority sector. NGO and development opportunities.',
'R180,000 - R500,000+',
'medium'),

('Hospitality, Tourism & Services', 'HOSPITALITY',
'Customer-facing industries including tourism, hotel management, food services, event planning, and personal services. Values interpersonal skills.',
'{"R": 0.4, "I": 0.3, "A": 0.5, "S": 0.7, "E": 0.6, "C": 0.5}',
'{"Languages", "Tourism", "Hospitality Studies", "Consumer Studies"}',
'{"Tourism Management", "Hospitality", "Event Management", "Culinary Arts", "Sports Management"}',
'Recovering post-pandemic. Entrepreneurship opportunities.',
'R150,000 - R600,000+',
'medium'),

('Skilled Trades & Technical', 'TRADES',
'Vocational and technical careers requiring specialized practical skills. Includes artisans, technicians, and applied technology roles.',
'{"R": 0.9, "I": 0.4, "A": 0.3, "S": 0.3, "E": 0.4, "C": 0.5}',
'{"Mathematics", "Physical Sciences", "Technical Mathematics", "Engineering Graphics"}',
'{"Electrical Engineering", "Mechanical Engineering", "Civil Engineering", "Artisan Training", "Technical Diplomas"}',
'Severe shortage of qualified artisans in SA. Government priority.',
'R180,000 - R600,000+',
'high');

-- ==========================================
-- PHASE 4: Chat Clusters
-- ==========================================


-- Chat sessions for conversation grouping
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255),
    context_json JSONB DEFAULT '{}', -- Stores student snapshot at session start
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Individual chat messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- Tokens used, latency, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Safety flags for distress detection
CREATE TABLE safety_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    flag_type VARCHAR(50) NOT NULL, -- 'distress', 'self_harm', 'crisis'
    confidence_score DECIMAL(3,2),
    reviewed_by_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Suggested prompts library
CREATE TABLE suggested_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL, -- 'general', 'career', 'urgent', 'post_assessment'
    prompt_text TEXT NOT NULL,
    context_conditions JSONB DEFAULT '{}', -- When to show this prompt
    priority INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE
);

-- Indexes
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_active ON chat_sessions(is_active);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX idx_safety_flags_user_id ON safety_flags(user_id);
CREATE INDEX idx_safety_flags_unreviewed ON safety_flags(reviewed_by_admin) WHERE reviewed_by_admin = FALSE;

-- Seed suggested prompts
INSERT INTO suggested_prompts (category, prompt_text, context_conditions, priority) VALUES
('general', 'What courses can I study with my APS score?', '{"has_results": true}', 10),
('general', 'Explain the difference between a degree and diploma', '{}', 9),
('career', 'Based on my assessment results, what careers suit me best?', '{"has_assessment": true}', 10),
('career', 'What are high-demand jobs in South Africa right now?', '{}', 8),
('urgent', 'I feel stressed about my future. What should I do?', '{}', 5),
('post_assessment', 'Help me understand my RIASEC profile', '{"has_assessment": true}', 9),
('general', 'How do I apply to universities?', '{}', 7),
('career', 'What subjects do I need for Engineering?', '{}', 8);

-- Trigger for updated_at
CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add to courses table to enable career cluster linking
ALTER TABLE courses ADD COLUMN related_courses TEXT[] DEFAULT '{}';

-- Create index for performance
CREATE INDEX idx_courses_related ON courses USING GIN (related_courses);
