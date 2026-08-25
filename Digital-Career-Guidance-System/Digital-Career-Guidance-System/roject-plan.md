# DCGS Project Plan
## Digital Career Guidance System
**Zero-Budget Build Plan | Version 1.0**  
**Organization:** AXRAY / CROWBAR  
**Target Market:** South African Education Sector  

---

## 1. Executive Summary

### 1.1 Project Vision
Build an AI-powered web platform to bridge the gap between academic performance and career opportunity for South African students, addressing the critical shortage of career counsellors (1:800+ ratio) and reducing the 35% university dropout rate through scalable, intelligent guidance.

### 1.2 Key Metrics
- **Target Users:** 600,000+ annual Grade 12 candidates
- **Initial Capacity:** 5,000 active users (MVP)
- **Dropout Reduction Target:** 15% improvement in course-student alignment
- **Budget:** R0 / $0 (Zero-Budget Stack)

---

## 2. Project Objectives

### 2.1 Primary Goals
- [ ] Deliver personalized career counselling at scale using AI
- [ ] Automate academic result processing (OCR) and APS calculation
- [ ] Provide 24/7 multilingual AI counselling support
- [ ] Reduce information asymmetry in university admissions

### 2.2 Success Criteria (KPIs)
| Metric | Target | Measurement |
|--------|--------|-------------|
| User Registration | 1,000 students in Month 1 | PostgreSQL user count |
| OCR Accuracy | &gt;95% extraction accuracy | Manual validation sampling |
| Recommendation Relevance | 80% positive feedback | In-app rating system |
| Chat Response Time | &lt;2 seconds | Groq API latency |
| System Uptime | 99% | Render monitoring |
| Data Privacy | 0 breaches | Security audits |

---

## 3. Scope & Deliverables

### 3.1 In-Scope
- **5 Core Modules:**
  1. OCR Result Scanner (Gemini Vision + Groq)
  2. University Recommendation Engine (Groq + Pinecone)
  3. Career Assessment Engine (RIASEC Psychometric)
  4. Conversational AI Counsellor (24/7 Chat)
  5. Admin & Analytics Dashboard

- **3 User Roles:** Student, Parent/Guardian, Administrator
- **Zero-Budget Stack:** Free tiers only (Neon, Groq, Gemini, Render)

### 3.2 Out-of-Scope (Future Phases)
- Native mobile applications (Responsive web only)
- Direct university application integration (CAO/institutional APIs)
- Bursary/financial aid matching engine
- Alumni network features

### 3.3 Deliverables Checklist

#### Core Platform
- [ ] User Authentication System (JWT + OAuth)
- [ ] PostgreSQL Database (Neon) with full schema
- [ ] File Upload & OCR Pipeline
- [ ] APS Calculator Engine
- [ ] Recommendation Algorithm
- [ ] Career Assessment Module
- [ ] AI Chat Interface (Streaming)
- [ ] Admin Dashboard (CRUD + Analytics)

#### Documentation
- [ ] API Documentation (REST endpoints)
- [ ] Database Schema Documentation
- [ ] User Manual (Student/Parent)
- [ ] Admin Guide
- [ ] Deployment Guide
- [ ] Security & Compliance Report (POPIA)

#### Testing & Quality
- [ ] Unit Test Suite (Jest + Pytest)
- [ ] Integration Tests (Supertest)
- [ ] OCR Accuracy Validation
- [ ] Security Penetration Testing
- [ ] Mobile Responsiveness Testing
- [ ] UAT with 50+ Real Students

---

## 4. Technical Architecture Summary

### 4.1 Stack Overview
| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| **Frontend** | EJS + Vanilla JS + CSS3 | Server-side rendering, responsive UI |
| **Primary Backend** | Node.js + Express | Auth, business logic, API routing |
| **Secondary Backend** | Python + FastAPI | OCR preprocessing microservice |
| **AI Layer** | Groq API + Gemini API + Pinecone | LLM, OCR, Vector search |
| **Database** | Neon PostgreSQL + Upstash Redis | Relational data + Session cache |
| **File Storage** | Cloudinary | Temporary report card storage |
| **Hosting** | Render.com | App hosting + CI/CD |

### 4.2 Integration Points
- **Groq API:** LLM parsing, recommendations, chat (14,400 tokens/min free)
- **Gemini Vision:** OCR extraction (1,500 req/day free)
- **Pinecone:** Semantic search (100K vectors free)
- **O*NET:** Job market data (Free US DoL API)
- **Gmail SMTP:** Email OTP (500/day free)

### 4.3 Security & Compliance
- JWT authentication (15min access/7day refresh)
- BCrypt password hashing (12 salt rounds)
- POPIA compliance (South African data protection)
- Row-level data isolation
- Rate limiting (100 req/15min per IP)

---

## 5. Project Timeline

### 5.1 Phase Overview (15 Weeks Total)

| Phase | Duration | Dates | Focus Area | Key Deliverable |
|-------|----------|-------|------------|-----------------|
| **Phase 0** | Weeks 1-2 | Month 1 | Foundation | Deployed skeleton + Auth |
| **Phase 1** | Weeks 3-4 | Month 1 | OCR Engine | Working result scanner |
| **Phase 2** | Weeks 5-6 | Month 2 | Recommendations | Course matching algorithm |
| **Phase 3** | Weeks 7-8 | Month 2 | Assessment | RIASEC profiling system |
| **Phase 4** | Weeks 9-10 | Month 3 | AI Counsellor | Streaming chatbot |
| **Phase 5** | Weeks 11-12 | Month 3 | Admin Panel | Management dashboard |
| **Phase 6** | Weeks 13-14 | Month 4 | Testing | QA + UAT completion |
| **Phase 7** | Week 15 | Month 4 | Launch | Production release |

### 5.2 Detailed Phase Plans

#### Phase 0: Foundation & Setup (Weeks 1-2)
**Goal:** Establish development environment and core infrastructure

**Week 1 Tasks:**
- [ ] GitHub repository setup with branch protection
- [ ] Render.com deployment pipeline configuration
- [ ] Neon PostgreSQL database provisioning
- [ ] Database schema implementation (Core tables: users, student_profiles)
- [ ] Basic Express app structure with EJS templating
- [ ] Environment variable configuration (.env management)

**Week 2 Tasks:**
- [ ] User registration system (Student/Parent)
- [ ] JWT authentication implementation
- [ ] Login/logout flows with httpOnly cookies
- [ ] Basic EJS layout and navigation
- [ ] Password reset via email OTP (Nodemailer)
- [ ] OAuth Google integration (Passport.js)
- [ ] Rate limiting middleware (Redis)

**Deliverables:**
- [ ] Live staging URL on Render
- [ ] Working auth system
- [ ] Database schema deployed
- [ ] CI/CD pipeline active

**Milestone:** 🚦 **Project Infrastructure Ready**

---

#### Phase 1: OCR Result Scanning Engine (Weeks 3-4)
**Goal:** Enable automated academic result extraction

**Week 3 Tasks:**
- [ ] File upload endpoint (Multer) with 10MB limit
- [ ] Cloudinary integration for temporary storage
- [ ] FastAPI microservice setup (Python)
- [ ] Image preprocessing (Pillow: contrast, deskew, resize)
- [ ] Gemini Vision API integration for OCR
- [ ] Base64 encoding pipeline for image processing

**Week 4 Tasks:**
- [ ] Groq LLM integration for JSON extraction
- [ ] Structured parsing: `{subject, mark, level}` array
- [ ] APS score calculation engine (NSC conversion table)
- [ ] Results review UI (manual correction interface)
- [ ] Data validation (required NSC subjects check)
- [ ] PostgreSQL results table integration
- [ ] Upload version history (optional)

**Deliverables:**
- [ ] End-to-end OCR pipeline
- [ ] &lt;15 second extraction time
- [ ] 95%+ accuracy on clear scans
- [ ] Student correction interface

**Milestone:** 🚦 **Core Data Input Functional**

---

#### Phase 2: University Recommendation Engine (Weeks 5-6)
**Goal:** Match students to suitable university programs

**Week 5 Tasks:**
- [ ] University database population (SA universities)
- [ ] Course data structure (min APS, subjects, NQF levels)
- [ ] Course requirements table (subject-level mapping)
- [ ] PostgreSQL filtering logic (APS + subject matching)
- [ ] Pinecone vector database setup
- [ ] Course description embeddings generation

**Week 6 Tasks:**
- [ ] Student profile embedding generation (Sentence Transformers)
- [ ] Semantic similarity search implementation
- [ ] Groq ranking algorithm (top 10 matches)
- [ ] AI narrative generation for recommendations
- [ ] Job market data integration (O*NET enrichment)
- [ ] Results storage and retrieval API
- [ ] Recommendation display UI

**Deliverables:**
- [ ] Working recommendation algorithm
- [ ] &lt;8 second generation time
- [ ] Course database (50K+ vectors)
- [ ] Student eligibility checker

**Milestone:** 🚦 **Intelligent Matching Live**

---

#### Phase 3: Career Assessment Engine (Weeks 7-8)
**Goal:** Psychometric profiling and career clustering

**Week 7 Tasks:**
- [ ] RIASEC question bank design (Holland Codes)
- [ ] Assessment database schema (questions, answers)
- [ ] Adaptive questioning logic (branching)
- [ ] Multi-section assessment UI (Personality, Skills, Interests)
- [ ] Assessment progress tracking

**Week 8 Tasks:**
- [ ] Groq analysis pipeline (career cluster mapping)
- [ ] Career Profile report generation
- [ ] Top 3-5 career paths algorithm
- [ ] PDF export functionality
- [ ] Integration with Recommendation Engine
- [ ] Parent view permissions (read-only)
- [ ] 90-day retake restriction logic

**Deliverables:**
- [ ] Complete assessment flow
- [ ] Career Profile PDF generator
- [ ] Profile-recommendation integration
- [ ] Parent dashboard view

**Milestone:** 🚦 **Psychometric System Complete**

---

#### Phase 4: Conversational AI Counsellor (Weeks 9-10)
**Goal:** 24/7 AI guidance with context awareness

**Week 9 Tasks:**
- [ ] Chat UI widget design (embedded dashboard)
- [ ] WebSocket/SSE implementation (Socket.io)
- [ ] Groq streaming API integration
- [ ] Context injection system (student profile + results)
- [ ] Chat history storage (PostgreSQL)

**Week 10 Tasks:**
- [ ] Suggested prompt chips UI
- [ ] Multilingual support layer
- [ ] Safety guardrails (distress keyword detection)
- [ ] Helpline resource integration
- [ ] Human escalation ticket system
- [ ] Session management and retrieval
- [ ] Mobile-responsive chat interface

**Deliverables:**
- [ ] Real-time streaming chat
- [ ] &lt;2 second first response
- [ ] Context-aware conversations
- [ ] Crisis detection protocols

**Milestone:** 🚦 **AI Counsellor Operational**

---

#### Phase 5: Admin Panel & Analytics (Weeks 11-12)
**Goal:** System management and monitoring

**Week 11 Tasks:**
- [ ] Admin authentication (super-admin creation)
- [ ] University/College CRUD interface
- [ ] Course management (add/edit/delete)
- [ ] CSV/Excel bulk import functionality
- [ ] Admission criteria management UI

**Week 12 Tasks:**
- [ ] Chart.js analytics dashboard
- [ ] User registration statistics
- [ ] Assessment completion rates
- [ ] Chat session metrics
- [ ] Audit log system (admin actions)
- [ ] User account management (activate/deactivate)
- [ ] Broadcast announcement system

**Deliverables:**
- [ ] Full admin dashboard
- [ ] Data import tools
- [ ] Analytics visualization
- [ ] Audit trail system

**Milestone:** 🚦 **Administrative Control Center**

---

#### Phase 6: Testing & Polish (Weeks 13-14)
**Goal:** Quality assurance and optimization

**Week 13 Tasks:**
- [ ] Jest unit test suite (Node.js)
- [ ] Pytest unit tests (Python)
- [ ] Supertest integration tests
- [ ] OCR accuracy testing (100 sample documents)
- [ ] API load testing (100 concurrent users)
- [ ] Security audit (dependency check)

**Week 14 Tasks:**
- [ ] Mobile responsiveness testing (Android/iOS)
- [ ] Accessibility audit (WCAG AA)
- [ ] UAT with 50 real students
- [ ] Performance optimization
- [ ] Cold start mitigation (UptimeRobot pinging)
- [ ] Documentation finalization
- [ ] Bug fixes and stabilization

**Deliverables:**
- [ ] Test coverage &gt;80%
- [ ] UAT sign-off
- [ ] Performance benchmarks met
- [ ] Production-ready codebase

**Milestone:** 🚦 **Quality Gate Passed**

---

#### Phase 7: Launch (Week 15)
**Goal:** Production deployment and go-live

**Tasks:**
- [ ] Production database migration (Neon)
- [ ] Environment variable configuration (Production)
- [ ] SSL certificate verification
- [ ] UptimeRobot monitoring setup
- [ ] User onboarding guide publication
- [ ] Admin training completion
- [ ] Marketing material preparation
- [ ] Soft launch (100 beta users)
- [ ] Public announcement

**Deliverables:**
- [ ] Live production URL
- [ ] Monitoring dashboards active
- [ ] User documentation
- [ ] Support channels established

**Milestone:** 🚦 **🚀 SYSTEM LIVE**

---

## 6. Resource Allocation

### 6.1 Development Team Structure
| Role | Responsibility | Skills Required |
|------|---------------|-----------------|
| **Tech Lead** | Architecture, code review, DevOps | Node.js, PostgreSQL, System Design |
| **Full-Stack Dev** | Express backend, EJS frontend | JavaScript, CSS, SQL |
| **ML Engineer** | OCR pipeline, AI integration | Python, FastAPI, LLM APIs |
| **QA Engineer** | Testing, UAT coordination | Jest, Pytest, Test Planning |
| **Project Manager** | Timeline, stakeholder management | Agile, Documentation |

### 6.2 Budget Allocation (Zero-Budget Strategy)
| Service | Free Tier Limits | Upgrade Trigger | Cost at Scale |
|---------|-----------------|-----------------|---------------|
| Neon PostgreSQL | 512 MB | 5,000 users | $19/month |
| Render.com | 1 web service (sleeps) | Always-on requirement | $7/month |
| Groq API | 14,400 tokens/min | Rate limiting | Pay-per-use |
| Gemini API | 1,500 req/day | High OCR volume | Paid tier |
| Pinecone | 100K vectors | Course expansion | $70/month |
| Upstash Redis | 10K commands/day | Session load | $0.2/100K |
| Cloudinary | 25 GB | Storage limit | Cleanup policy |
| GitHub | 2,000 CI min | Large team | Free (OSS) |

**Total MVP Cost: R0 / $0**  
**First Upgrade Point: ~$26/month at 5,000 users**

---

## 7. Risk Management

| Risk | Likelihood | Impact | Mitigation Strategy | Owner |
|------|-----------|--------|-------------------|-------|
| **Gemini API Rate Limits** | Medium | High | Implement upload queue with exponential backoff; cache results | Tech Lead |
| **OCR Accuracy Issues** | High | Medium | Image preprocessing (Pillow); manual correction UI; ML Engineer validation | ML Engineer |
| **Groq Rate Limiting** | Medium | Medium | Per-user rate limiting; common answer caching; request queuing | Tech Lead |
| **Database Storage Full** | Low | High | Archive old chat sessions; compress data; upgrade plan ready | Tech Lead |
| **Cold Start Latency** | High | Low | UptimeRobot pinging (14-min intervals); upgrade to $7 plan | DevOps |
| **Data Privacy Breach** | Low | Critical | Encryption at rest; HTTPS; JWT; POPIA compliance; security audit | QA Engineer |
| **Scope Creep** | Medium | Medium | Strict phase gates; change control process; MVP focus | Project Manager |
| **Student Adoption** | Medium | High | UAT feedback integration; mobile-first design; school partnerships | PM/Marketing |

---

## 8. Functional Requirements Tracking

### 8.1 Authentication (FR-1)
- [x] FR-1.1: Email/password registration
- [x] FR-1.2: Parent linking via invite code
- [x] FR-1.3: Admin super-admin creation
- [x] FR-1.4: JWT session management
- [x] FR-1.5: Email OTP password reset
- [ ] FR-1.6: Google OAuth (SHOULD)
- [ ] FR-1.7: Account lockout (SHOULD)

### 8.2 OCR Engine (FR-2)
- [x] FR-2.1: PDF/image upload
- [x] FR-2.2: Gemini Vision API integration
- [x] FR-2.3: Groq JSON parsing
- [x] FR-2.4: APS auto-calculation
- [x] FR-2.5: PostgreSQL storage
- [x] FR-2.6: Manual correction interface
- [x] FR-2.7: NSC subject validation
- [ ] FR-2.8: Version history (SHOULD)
- [x] FR-2.9: 10MB file limit

### 8.3 Recommendations (FR-3)
- [x] FR-3.1: University database
- [x] FR-3.2: Course criteria storage
- [x] FR-3.3: APS filtering
- [x] FR-3.4: Groq ranking/narrative
- [x] FR-3.5: Pinecone vector matching
- [ ] FR-3.6: Job market enrichment (SHOULD)
- [x] FR-3.7: Results display
- [ ] FR-3.8: PDF export (SHOULD)
- [x] FR-3.9: Auto-regeneration on update

### 8.4 Assessment (FR-4)
- [x] FR-4.1: RIASEC assessment
- [x] FR-4.2: Multi-section coverage
- [ ] FR-4.3: Adaptive questioning (SHOULD)
- [x] FR-4.4: Groq career clustering
- [x] FR-4.5: Career Profile report
- [x] FR-4.6: Recommendation integration
- [ ] FR-4.7: 90-day retake (SHOULD)
- [ ] FR-4.8: Parent view (SHOULD)

### 8.5 AI Counsellor (FR-5)
- [x] FR-5.1: 24/7 chat interface
- [x] FR-5.2: Groq LLM integration
- [x] FR-5.3: Context awareness
- [x] FR-5.5: Suggested prompts
- [x] FR-5.6: Chat history storage
- [ ] FR-5.7: Human escalation (SHOULD)
- [ ] FR-5.8: Distress detection (SHOULD)

### 8.6 Application Tracking (FR-6)
- [x] FR-6.1: Application tracking
- [x] FR-6.2: Deadline reminders
- [x] FR-6.3: Readiness milestones
- [x] FR-6.4: Progress bar
- [ ] FR-6.5: Document checklist (SHOULD)
- [ ] FR-6.6: PDF export (COULD)

### 8.7 Admin Panel (FR-7)
- [x] FR-7.1: CRUD operations
- [x] FR-7.2: CSV bulk import
- [x] FR-7.3: System analytics
- [ ] FR-7.4: Broadcast announcements (SHOULD)
- [x] FR-7.5: User account management
- [ ] FR-7.6: Audit logging (SHOULD)

---

## 9. Non-Functional Requirements

| Category | Requirement | Target | Verification |
|----------|-------------|--------|--------------|
| **Performance** | AI first response | &lt;2 seconds | Groq latency monitoring |
| **Performance** | OCR end-to-end | &lt;15 seconds | Timer logs |
| **Performance** | Recommendation generation | &lt;8 seconds | API timing |
| **Availability** | System uptime | 99% | Render monitoring |
| **Scalability** | Concurrent users | 100 (MVP) | Load testing |
| **Accessibility** | WCAG AA compliance | Pass | Screen reader testing |
| **Mobile** | Responsive design | Fully functional | Device testing |
| **Maintainability** | Code documentation | 100% JSDoc | Code review |
| **Compliance** | POPIA adherence | Full compliance | Legal review |

---

## 10. API Endpoints Summary

### Auth Routes
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/auth/register | Create account | No |
| POST | /api/auth/login | JWT login | No |
| POST | /api/auth/logout | Invalidate session | Yes |
| POST | /api/auth/forgot-password | Send OTP | No |
| POST | /api/auth/reset-password | Reset with OTP | No |
| GET | /api/auth/me | Current user | Yes |

### Results & OCR
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/results/upload | Upload report | Yes |
| GET | /api/results/:userId | Get results | Yes |
| PUT | /api/results/:id | Correct entry | Yes |
| DELETE | /api/results/:id | Remove entry | Yes |
| POST | /api/results/calculate-aps | Recalculate | Yes |

### Recommendations
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/recommendations/generate | Generate new | Yes |
| GET | /api/recommendations/:userId | List saved | Yes |
| GET | /api/recommendations/:id/detail | Get details | Yes |

### Assessment
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/assessment/questions | Get questions | Yes |
| POST | /api/assessment/submit | Submit answers | Yes |
| GET | /api/assessment/:userId/profile | Get profile | Yes |

### Chat
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/chat/message | Send message | Yes |
| GET | /api/chat/history/:userId | Get history | Yes |
| DELETE | /api/chat/session/:id | Clear session | Yes |

### Admin
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/admin/users | List users | Admin |
| POST | /api/admin/universities | Add university | Admin |
| PUT | /api/admin/courses/:id | Edit course | Admin |
| DELETE | /api/admin/courses/:id | Delete course | Admin |
| POST | /api/admin/courses/bulk-import | CSV import | Admin |
| GET | /api/admin/analytics | System stats | Admin |

---

## 11. Database Schema Summary

### Core Tables
- **users:** id, email, password_hash, role, created_at
- **student_profiles:** id, user_id, name, grade, school, province, parent_id
- **results:** id, user_id, subject, mark, level, aps_score, upload_date
- **universities:** id, name, acronym, province, website, logo_url
- **courses:** id, university_id, faculty, name, min_aps, duration, nqf_level
- **course_requirements:** id, course_id, subject, min_level
- **recommendations:** id, user_id, course_id, match_score, ai_narrative
- **assessments:** id, user_id, answers_json, career_clusters, profile_summary
- **chat_history:** id, user_id, session_id, role, content, timestamp
- **applications:** id, user_id, course_id, status, deadline, notes
- **admin_audit_log:** id, admin_id, action, target_table, target_id, timestamp

---

## 12. Communication Plan

| Stakeholder | Communication | Frequency | Channel |
|-------------|--------------|-----------|---------|
| Development Team | Stand-ups | Daily | Slack/Discord |
| Project Manager | Progress reports | Weekly | Email/Notion |
| AXRAY/CROWBAR | Steering committee | Bi-weekly | Video call |
| Beta Testers | Feedback sessions | Phase 6 | In-app/Email |
| End Users | Updates | Post-launch | In-app announcements |

---

## 13. Appendix

### 13.1 Technology Stack Details
**Frontend:** EJS, Vanilla JS ES2022, CSS3, Chart.js, Socket.io-client  
**Backend (Node):** Express.js, Passport.js, Multer, Nodemailer, bcryptjs, jsonwebtoken, pg  
**Backend (Python):** FastAPI, Pillow, Uvicorn, httpx  
**AI/ML:** Groq API, Gemini API, Pinecone, Sentence Transformers  
**Database:** Neon PostgreSQL, Upstash Redis  
**DevOps:** GitHub Actions, Render.com, Cloudinary  

### 13.2 File Structure