const adminService = require('../services/adminService');

class AdminController {
    // Dashboard
    async getDashboard(req, res) {
        try {
            const stats = await adminService.getDashboardStats();
            res.render('admin/dashboard', {
                title: 'Admin Dashboard',
                activePage: 'admin-dashboard',
                stats,
                scripts: ['admin-dashboard']
            });
        } catch (error) {
            console.error('Admin dashboard error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    async getDashboardStats(req, res) {
        try {
            const stats = await adminService.getDashboardStats();
            res.json(stats);
        } catch (error) {
            console.error('Dashboard stats error:', error);
            res.status(500).json({ error: 'Failed to fetch dashboard stats' });
        }
    }

    // User Management
    async getUsersPage(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const filters = {
                role: req.query.role,
                email: req.query.email,
                grade: req.query.grade
            };

            const result = await adminService.getUsers(page, limit, filters);

            res.render('admin/users', {
                title: 'User Management',
                activePage: 'admin-users',
                users: result.users,
                pagination: {
                    currentPage: result.page,
                    totalPages: result.totalPages,
                    total: result.total,
                    hasNext: result.page < result.totalPages,
                    hasPrev: result.page > 1
                },
                filters,
                scripts: ['admin-users']
            });
        } catch (error) {
            console.error('Users page error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    async getUsers(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const filters = {
                role: req.query.role,
                email: req.query.email,
                grade: req.query.grade
            };

            const result = await adminService.getUsers(page, limit, filters);
            res.json(result);
        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    }

    async updateUser(req, res) {
        try {
            const { userId } = req.params;
            const updates = req.body;

            // Log the action
            const oldUser = await adminService.getUsers(1, 1, { email: updates.email || '' });
            const oldData = oldUser.users.find(u => u.id === userId);

            const updatedUser = await adminService.updateUser(userId, updates);

            // Log audit
            await adminService.logAdminAction(
                req.user.id,
                'UPDATE_USER',
                'users',
                userId,
                oldData,
                updatedUser,
                req.ip
            );

            res.json(updatedUser);
        } catch (error) {
            console.error('Update user error:', error);
            res.status(500).json({ error: error.message || 'Failed to update user' });
        }
    }

    async deleteUser(req, res) {
        try {
            const { userId } = req.params;

            // Get user data before deletion for audit
            const userData = await adminService.getUsers(1, 1, {});
            const user = userData.users.find(u => u.id === userId);

            const deleted = await adminService.deleteUser(userId);

            if (deleted) {
                // Log audit
                await adminService.logAdminAction(
                    req.user.id,
                    'DELETE_USER',
                    'users',
                    userId,
                    user,
                    null,
                    req.ip
                );
                res.json({ success: true });
            } else {
                res.status(404).json({ error: 'User not found' });
            }
        } catch (error) {
            console.error('Delete user error:', error);
            res.status(500).json({ error: error.message || 'Failed to delete user' });
        }
    }

    // Assessment Management
    async getAssessmentQuestionsPage(req, res) {
        try {
            const questions = await adminService.getAssessmentQuestions();

            // Group by category
            const groupedQuestions = questions.reduce((acc, q) => {
                if (!acc[q.category]) acc[q.category] = [];
                acc[q.category].push(q);
                return acc;
            }, {});

            res.render('admin/assessment', {
                title: 'Assessment Management',
                activePage: 'admin-assessment',
                questions: groupedQuestions,
                scripts: ['admin-assessment']
            });
        } catch (error) {
            console.error('Assessment questions page error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    async getAssessmentQuestions(req, res) {
        try {
            const questions = await adminService.getAssessmentQuestions();
            res.json(questions);
        } catch (error) {
            console.error('Get assessment questions error:', error);
            res.status(500).json({ error: 'Failed to fetch questions' });
        }
    }

    async updateAssessmentQuestion(req, res) {
        try {
            const { questionId } = req.params;
            const updates = req.body;

            const updatedQuestion = await adminService.updateAssessmentQuestion(questionId, updates);

            // Log audit
            await adminService.logAdminAction(
                req.user.id,
                'UPDATE_QUESTION',
                'assessment_questions',
                questionId,
                null, // Old data not fetched
                updatedQuestion,
                req.ip
            );

            res.json(updatedQuestion);
        } catch (error) {
            console.error('Update question error:', error);
            res.status(500).json({ error: error.message || 'Failed to update question' });
        }
    }

    // OCR Results Management
    async getOCRUploadsPage(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const filters = {
                status: req.query.status,
                user_email: req.query.user_email
            };

            const result = await adminService.getOCRUploads(page, limit, filters);

            res.render('admin/ocr-uploads', {
                title: 'OCR Uploads Management',
                activePage: 'admin-ocr',
                uploads: result.uploads,
                pagination: {
                    currentPage: result.page,
                    totalPages: result.totalPages,
                    total: result.total,
                    hasNext: result.page < result.totalPages,
                    hasPrev: result.page > 1
                },
                filters,
                scripts: ['admin-ocr']
            });
        } catch (error) {
            console.error('OCR uploads page error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    async getOCRUploads(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const filters = {
                status: req.query.status,
                user_email: req.query.user_email
            };

            const result = await adminService.getOCRUploads(page, limit, filters);
            res.json(result);
        } catch (error) {
            console.error('Get OCR uploads error:', error);
            res.status(500).json({ error: 'Failed to fetch OCR uploads' });
        }
    }

    // Safety Flags
    async getSafetyFlagsPage(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const reviewed = req.query.reviewed === 'true' ? true : req.query.reviewed === 'false' ? false : null;

            const result = await adminService.getSafetyFlags(page, limit, reviewed);

            res.render('admin/safety-flags', {
                title: 'Safety Flags Review',
                activePage: 'admin-safety',
                flags: result.flags,
                pagination: {
                    currentPage: result.page,
                    totalPages: result.totalPages,
                    total: result.total,
                    hasNext: result.page < result.totalPages,
                    hasPrev: result.page > 1
                },
                reviewed,
                scripts: ['admin-safety']
            });
        } catch (error) {
            console.error('Safety flags page error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    async getSafetyFlags(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const reviewed = req.query.reviewed === 'true' ? true : req.query.reviewed === 'false' ? false : null;

            const result = await adminService.getSafetyFlags(page, limit, reviewed);
            res.json(result);
        } catch (error) {
            console.error('Get safety flags error:', error);
            res.status(500).json({ error: 'Failed to fetch safety flags' });
        }
    }

    async markSafetyFlagReviewed(req, res) {
        try {
            const { flagId } = req.params;
            const reviewedFlag = await adminService.markSafetyFlagReviewed(flagId, req.user.id);
            res.json(reviewedFlag);
        } catch (error) {
            console.error('Mark safety flag reviewed error:', error);
            res.status(500).json({ error: error.message || 'Failed to mark flag as reviewed' });
        }
    }

    // Universities and Courses
    async getUniversitiesPage(req, res) {
        try {
            const universities = await adminService.getUniversities();
            res.render('admin/universities', {
                title: 'Universities Management',
                activePage: 'admin-universities',
                universities,
                scripts: ['admin-universities']
            });
        } catch (error) {
            console.error('Universities page error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    async getCoursesPage(req, res) {
        try {
            const universityId = req.query.university;
            const page = parseInt(req.query.page) || 1;
            const limit = 50;

            const result = await adminService.getCourses(universityId, page, limit);
            const universities = await adminService.getUniversities();

            res.render('admin/courses', {
                title: 'Courses Management',
                activePage: 'admin-courses',
                courses: result.courses,
                universities,
                selectedUniversity: universityId,
                pagination: {
                    currentPage: result.page,
                    totalPages: result.totalPages,
                    total: result.total,
                    hasNext: result.page < result.totalPages,
                    hasPrev: result.page > 1
                },
                scripts: ['admin-courses']
            });
        } catch (error) {
            console.error('Courses page error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    // Audit Logs
    async getAuditLogsPage(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 50;

            const result = await adminService.getAuditLogs(page, limit);

            res.render('admin/audit-logs', {
                title: 'Audit Logs',
                activePage: 'admin-audit',
                logs: result.logs,
                pagination: {
                    currentPage: result.page,
                    totalPages: result.totalPages,
                    total: result.total,
                    hasNext: result.page < result.totalPages,
                    hasPrev: result.page > 1
                },
                scripts: ['admin-audit']
            });
        } catch (error) {
            console.error('Audit logs page error:', error);
            res.status(500).render('errors/500', { title: 'Server Error' });
        }
    }

    async getAuditLogs(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;

            const result = await adminService.getAuditLogs(page, limit);
            res.json(result);
        } catch (error) {
            console.error('Get audit logs error:', error);
            res.status(500).json({ error: 'Failed to fetch audit logs' });
        }
    }
}

module.exports = new AdminController();