const { query } = require('../config/database');
const groqService = require('./groqService');

/**
 * RIASEC Assessment Service
 * Implements Holland Codes psychometric profiling with AI-powered career analysis
 */

class AssessmentService {
    /**
     * Get all active assessment questions grouped by category
     */
    async getQuestions() {
        try {
            const result = await query(`
                SELECT id, category, question_text, riasec_dimension, weight
                FROM assessment_questions
                WHERE active = TRUE
                ORDER BY category, sort_order
            `);

            console.log(`[AssessmentService] Loaded ${result.rows.length} questions from DB`);

            // Group questions by category
            const grouped = result.rows.reduce((acc, q) => {
                if (!acc[q.category]) acc[q.category] = [];
                acc[q.category].push({
                    id: q.id,
                    text: q.question_text,
                    dimension: q.riasec_dimension,
                    weight: parseFloat(q.weight)
                });
                return acc;
            }, {});

            return {
                categories: Object.keys(grouped),
                questions: grouped,
                totalQuestions: result.rows.length
            };
        } catch (error) {
            console.error('[AssessmentService] Error fetching questions:', error);
            throw new Error('Failed to load assessment questions');
        }
    }

    /**
     * Start a new assessment for a user
     */
    async startAssessment(userId) {
        try {
            console.log(`[AssessmentService] Starting assessment for user: ${userId}`);
            
            // Check for existing active assessment
            const existing = await query(`
                SELECT id, responses, status FROM assessments
                WHERE user_id = $1 AND status = 'in_progress'
            `, [userId]);

            if (existing.rows.length > 0) {
                console.log(`[AssessmentService] Found existing assessment: ${existing.rows[0].id}`);
                return this.getAssessment(existing.rows[0].id);
            }

            // Check retake restriction (90 days)
            const lastCompleted = await query(`
                SELECT completed_at FROM assessments
                WHERE user_id = $1 AND status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 1
            `, [userId]);

            if (lastCompleted.rows.length > 0) {
                const daysSince = Math.floor(
                    (Date.now() - new Date(lastCompleted.rows[0].completed_at).getTime()) / (1000 * 60 * 60 * 24)
                );
                console.log(`[AssessmentService] Days since last assessment: ${daysSince}`);
                
                if (daysSince < 90) {
                    const canRetakeAfter = new Date(lastCompleted.rows[0].completed_at);
                    canRetakeAfter.setDate(canRetakeAfter.getDate() + 90);
                    return {
                        restricted: true,
                        daysRemaining: 90 - daysSince,
                        canRetakeAfter: canRetakeAfter.toISOString(),
                        message: `You can retake the assessment in ${90 - daysSince} days.`
                    };
                }
            }

            // Create new assessment
            const result = await query(`
                INSERT INTO assessments (user_id, status, responses, started_at)
                VALUES ($1, 'in_progress', '{}', CURRENT_TIMESTAMP)
                RETURNING id, status, started_at, last_question_index
            `, [userId]);

            console.log(`[AssessmentService] Created new assessment: ${result.rows[0].id}`);

            return {
                assessmentId: result.rows[0].id,
                status: 'in_progress',
                startedAt: result.rows[0].started_at,
                progress: 0
            };
        } catch (error) {
            console.error('[AssessmentService] Error starting assessment:', error);
            throw new Error('Failed to start assessment');
        }
    }

    /**
     * Submit response for a question
     */
    async submitResponse(userId, assessmentId, questionId, answer) {
        try {
            console.log(`[AssessmentService] Submitting response - User: ${userId}, Assessment: ${assessmentId}, Question: ${questionId}, Answer: ${answer}`);

            // Verify assessment belongs to user
            const assessment = await query(`
                SELECT responses, last_question_index FROM assessments
                WHERE id = $1 AND user_id = $2 AND status = 'in_progress'
            `, [assessmentId, userId]);

            if (assessment.rows.length === 0) {
                console.error(`[AssessmentService] Assessment not found or not active: ${assessmentId}`);
                throw new Error('Assessment not found or not active');
            }

            // Get question details
            const question = await query(`
                SELECT riasec_dimension FROM assessment_questions
                WHERE id = $1 AND active = TRUE
            `, [questionId]);

            if (question.rows.length === 0) {
                console.error(`[AssessmentService] Question not found: ${questionId}`);
                throw new Error('Question not found');
            }

            console.log(`[AssessmentService] Question ${questionId} maps to dimension: ${question.rows[0].riasec_dimension}`);

            // Update responses
            const responses = assessment.rows[0].responses || {};
            responses[questionId] = {
                answer: answer, // 1-5 scale
                riasec: question.rows[0].riasec_dimension,
                timestamp: new Date().toISOString()
            };

            // Count answered questions
            const answeredCount = Object.keys(responses).length;
            const totalQuestions = await query('SELECT COUNT(*) FROM assessment_questions WHERE active = TRUE');
            const total = parseInt(totalQuestions.rows[0].count);
            
            console.log(`[AssessmentService] Progress: ${answeredCount}/${total} questions answered`);

            await query(`
                UPDATE assessments
                SET responses = $1,
                    last_question_index = $2,
                    time_spent_minutes = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) / 60
                WHERE id = $3
            `, [JSON.stringify(responses), answeredCount, assessmentId]);

            console.log(`[AssessmentService] Response saved successfully`);

            return {
                progress: Math.round((answeredCount / total) * 100),
                answeredCount,
                totalQuestions: total,
                isComplete: answeredCount >= total
            };
        } catch (error) {
            console.error('[AssessmentService] Error submitting response:', error);
            throw error;
        }
    }

    /**
     * Complete assessment and calculate RIASEC profile
     */
    async completeAssessment(userId, assessmentId) {
        console.log(`[AssessmentService] Completing assessment - User: ${userId}, Assessment: ${assessmentId}`);
        
        try {
            const assessment = await query(`
                SELECT responses FROM assessments
                WHERE id = $1 AND user_id = $2 AND status = 'in_progress'
            `, [assessmentId, userId]);

            if (assessment.rows.length === 0) {
                console.error(`[AssessmentService] Assessment not found for completion: ${assessmentId}`);
                throw new Error('Assessment not found');
            }

            const responses = assessment.rows[0].responses || {};
            const answeredCount = Object.keys(responses).length;
            
            console.log(`[AssessmentService] Total responses collected: ${answeredCount}`);
            console.log(`[AssessmentService] Raw responses:`, JSON.stringify(responses, null, 2));

            // Calculate RIASEC scores
            console.log(`[AssessmentService] Calculating RIASEC scores...`);
            const scores = this.calculateRIASECScores(responses);
            console.log(`[AssessmentService] Calculated scores:`, scores);

            // Determine Holland Code (top 2-3 letters)
            const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            console.log(`[AssessmentService] Sorted dimensions:`, sorted);
            
            const dominantCode = sorted[0][0] + sorted[1][0];
            const secondaryCode = sorted[2] ? sorted[2][0] + (sorted[3]?.[0] || '') : '';
            
            console.log(`[AssessmentService] Dominant code: ${dominantCode}, Secondary: ${secondaryCode}`);

            // Get career matches
            console.log(`[AssessmentService] Calculating career matches...`);
            const careerMatches = await this.calculateCareerMatches(scores);
            console.log(`[AssessmentService] Found ${careerMatches.length} career matches`);
            console.log(`[AssessmentService] Top 5 matches:`, careerMatches.slice(0, 5).map(m => ({name: m.name, score: m.matchScore})));

            // Generate AI profile analysis
            console.log(`[AssessmentService] Calling Groq for profile analysis...`);
            let profileAnalysis;
            try {
                profileAnalysis = await groqService.generateCareerProfile({
                    riasecScores: scores,
                    dominantCode,
                    careerMatches: careerMatches.slice(0, 5)
                });
                console.log(`[AssessmentService] Groq analysis received:`, profileAnalysis);
            } catch (groqError) {
                console.error(`[AssessmentService] Groq failed, using fallback:`, groqError);
                profileAnalysis = {
                    summary: `Your assessment reveals a ${dominantCode} profile with strong ${this.getDimensionName(dominantCode[0])} and ${this.getDimensionName(dominantCode[1])} characteristics.`,
                    narrative: 'Profile analysis completed. Explore your top career matches for personalized guidance.',
                    strengths: { primary: 'Self-awareness', secondary: 'Career focus', tertiary: 'Growth mindset' },
                    workStyle: 'You prefer environments that align with your dominant characteristics.',
                    careerRecommendations: careerMatches.slice(0, 3).map(m => ({
                        cluster: m.name,
                        reason: `Strong match based on your ${dominantCode} profile`
                    })),
                    studyAdvice: 'Consider courses that develop your dominant skill areas.',
                    cautions: 'Balance your strengths with development in less dominant areas.'
                };
            }

            // Prepare data for DB update
            const updateData = {
                status: 'completed',
                completed_at: new Date().toISOString(),
                riasec_scores: JSON.stringify(scores),
                dominant_code: dominantCode,
                secondary_code: secondaryCode,
                career_matches: JSON.stringify(careerMatches.slice(0, 5)),
                profile_summary: profileAnalysis.summary,
                personality_narrative: profileAnalysis.narrative,
                strengths_analysis: JSON.stringify(profileAnalysis.strengths),
                work_style_description: profileAnalysis.workStyle,
                can_retake_after: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
            };

            console.log(`[AssessmentService] Updating assessment in DB with data:`, updateData);

            // Update assessment
            const updateResult = await query(`
                UPDATE assessments
                SET status = $1,
                    completed_at = $2,
                    riasec_scores = $3,
                    dominant_code = $4,
                    secondary_code = $5,
                    career_matches = $6,
                    profile_summary = $7,
                    personality_narrative = $8,
                    strengths_analysis = $9,
                    work_style_description = $10,
                    can_retake_after = $11
                WHERE id = $12
                RETURNING id, status, riasec_scores, dominant_code
            `, [
                updateData.status,
                updateData.completed_at,
                updateData.riasec_scores,
                updateData.dominant_code,
                updateData.secondary_code,
                updateData.career_matches,
                updateData.profile_summary,
                updateData.personality_narrative,
                updateData.strengths_analysis,
                updateData.work_style_description,
                updateData.can_retake_after,
                assessmentId
            ]);

            console.log(`[AssessmentService] DB update result:`, updateResult.rows[0]);

            // Link to courses (wrapped in try-catch so it doesn't break completion)
            try {
                console.log(`[AssessmentService] Linking assessment to courses...`);
                await this.linkAssessmentToCourses(assessmentId, careerMatches);
                console.log(`[AssessmentService] Course linking completed`);
            } catch (linkError) {
                console.error(`[AssessmentService] Course linking failed (non-critical):`, linkError);
            }

            // Update profile completion
            console.log(`[AssessmentService] Updating profile completion...`);
            const profileUpdate = await query(`
                UPDATE student_profiles
                SET profile_completion = LEAST(profile_completion + 25, 100)
                WHERE user_id = $1
                RETURNING profile_completion
            `, [userId]);
            
            console.log(`[AssessmentService] Profile completion updated to: ${profileUpdate.rows[0]?.profile_completion}`);

            const result = {
                assessmentId,
                status: 'completed',
                riasecScores: scores,
                dominantCode,
                secondaryCode,
                careerMatches: careerMatches.slice(0, 5),
                profileAnalysis
            };

            console.log(`[AssessmentService] Completion successful. Returning:`, result);

            return result;
        } catch (error) {
            console.error('[AssessmentService] CRITICAL ERROR in completeAssessment:', error);
            console.error('[AssessmentService] Error stack:', error.stack);
            throw error;
        }
    }

    /**
     * Calculate RIASEC scores from responses
     */
    calculateRIASECScores(responses) {
        console.log(`[AssessmentService] Calculating scores from ${Object.keys(responses).length} responses`);
        
        const dimensionScores = { R: [], I: [], A: [], S: [], E: [], C: [] };

        for (const [qId, response] of Object.entries(responses)) {
            if (response.riasec && response.answer) {
                // Answer is 1-5, normalize to 0-100 scale
                const normalized = ((response.answer - 1) / 4) * 100;
                dimensionScores[response.riasec].push(normalized);
                console.log(`[AssessmentService] Q${qId}: ${response.riasec} = ${response.answer} (normalized: ${normalized})`);
            } else {
                console.warn(`[AssessmentService] Invalid response for Q${qId}:`, response);
            }
        }

        // Calculate average for each dimension
        const scores = {};
        for (const [dim, vals] of Object.entries(dimensionScores)) {
            scores[dim] = vals.length > 0
                ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
                : 0;
            console.log(`[AssessmentService] Dimension ${dim}: ${vals.length} responses, avg = ${scores[dim]}`);
        }

        return scores;
    }

    /**
     * Calculate career cluster matches based on RIASEC profile
     */
    async calculateCareerMatches(scores) {
        try {
            console.log(`[AssessmentService] Fetching career clusters from DB...`);
            const clusters = await query(`
                SELECT id, name, code, description, riasec_profile,
                       key_subjects, job_outlook, salary_range, growth_potential
                FROM career_clusters
                WHERE active = TRUE
            `);

            console.log(`[AssessmentService] Found ${clusters.rows.length} career clusters`);

            const matches = clusters.rows.map(cluster => {
                const profile = cluster.riasec_profile || {};

                // Calculate cosine similarity between profiles
                const dotProduct = Object.keys(scores).reduce((sum, dim) => {
                    return sum + (scores[dim] / 100) * (profile[dim] || 0);
                }, 0);

                const magnitude1 = Math.sqrt(Object.values(scores).reduce((sum, v) => sum + Math.pow(v / 100, 2), 0));
                const magnitude2 = Math.sqrt(Object.values(profile).reduce((sum, v) => sum + Math.pow(v, 2), 0));

                const similarity = magnitude1 > 0 && magnitude2 > 0
                    ? dotProduct / (magnitude1 * magnitude2)
                    : 0;

                return {
                    clusterId: cluster.id,
                    name: cluster.name,
                    code: cluster.code,
                    description: cluster.description,
                    matchScore: Math.round(similarity * 100) / 100,
                    keySubjects: cluster.key_subjects || [],
                    jobOutlook: cluster.job_outlook,
                    salaryRange: cluster.salary_range,
                    growthPotential: cluster.growth_potential
                };
            });

            // Sort by match score descending
            const sortedMatches = matches.sort((a, b) => b.matchScore - a.matchScore);
            console.log(`[AssessmentService] Top match: ${sortedMatches[0]?.name} (${sortedMatches[0]?.matchScore})`);

            return sortedMatches;
        } catch (error) {
            console.error('[AssessmentService] Error calculating career matches:', error);
            return [];
        }
    }

    /**
     * FIXED: Link assessment to courses with proper error handling
     */
    async linkAssessmentToCourses(assessmentId, careerMatches) {
        try {
            // Get top 3 career clusters
            const topClusters = careerMatches.slice(0, 3).map(m => m.code);
            
            if (topClusters.length === 0) {
                console.log(`[AssessmentService] No top clusters found, skipping course linking`);
                return;
            }
            
            console.log(`[AssessmentService] Linking to courses for clusters:`, topClusters);
            
            // Find courses matching these clusters via related_courses field
            const courses = await query(`
                SELECT id FROM courses 
                WHERE related_courses && $1
            `, [topClusters]);
            
            console.log(`[AssessmentService] Found ${courses.rows.length} matching courses`);
            
            // Insert into assessment_course_matches
            for (const course of courses.rows) {
                const matchScore = 0.75; // Default match score
                
                await query(`
                    INSERT INTO assessment_course_matches 
                    (assessment_id, course_id, match_score)
                    VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                `, [assessmentId, course.id, matchScore]);
            }
            
            console.log(`[AssessmentService] Successfully linked to ${courses.rows.length} courses`);
        } catch (error) {
            console.error('[AssessmentService] Error in linkAssessmentToCourses:', error);
            // Re-throw so caller knows, but don't break the completion flow
            throw error;
        }
    }
    
    async getAssessment(assessmentId) {
        try {
            console.log(`[AssessmentService] Fetching assessment: ${assessmentId}`);
            const result = await query(`
                SELECT * FROM assessments
                WHERE id = $1
            `, [assessmentId]);

            if (result.rows.length === 0) {
                console.log(`[AssessmentService] Assessment not found: ${assessmentId}`);
                return null;
            }

            const assessment = result.rows[0];
            console.log(`[AssessmentService] Found assessment:`, {
                id: assessment.id,
                status: assessment.status,
                hasScores: !!assessment.riasec_scores,
                dominantCode: assessment.dominant_code
            });

            return {
                id: assessment.id,
                userId: assessment.user_id,
                status: assessment.status,
                responses: assessment.responses || {},
                riasecScores: assessment.riasec_scores || {},
                dominantCode: assessment.dominant_code,
                secondaryCode: assessment.secondary_code,
                careerMatches: assessment.career_matches || [],
                profileSummary: assessment.profile_summary,
                personalityNarrative: assessment.personality_narrative,
                strengthsAnalysis: assessment.strengths_analysis || {},
                workStyleDescription: assessment.work_style_description,
                startedAt: assessment.started_at,
                completedAt: assessment.completed_at,
                progress: this.calculateProgress(assessment.responses)
            };
        } catch (error) {
            console.error('[AssessmentService] Error fetching assessment:', error);
            throw error;
        }
    }

    /**
     * Get user's latest assessment
     */
    async getUserAssessment(userId) {
        try {
            console.log(`[AssessmentService] Fetching latest assessment for user: ${userId}`);
            const result = await query(`
                SELECT * FROM assessments
                WHERE user_id = $1
                ORDER BY CASE status
                    WHEN 'in_progress' THEN 0
                    WHEN 'completed' THEN 1
                    ELSE 2
                END,
                COALESCE(completed_at, started_at) DESC
                LIMIT 1
            `, [userId]);

            if (result.rows.length === 0) {
                console.log(`[AssessmentService] No assessment found for user: ${userId}`);
                return null;
            }

            const assessment = result.rows[0];
            console.log(`[AssessmentService] Latest assessment found:`, {
                id: assessment.id,
                status: assessment.status,
                hasScores: !!assessment.riasec_scores,
                dominantCode: assessment.dominant_code,
                completedAt: assessment.completed_at
            });

            return {
                id: assessment.id,
                status: assessment.status,
                riasecScores: assessment.riasec_scores || {},
                dominantCode: assessment.dominant_code,
                secondaryCode: assessment.secondary_code,
                careerMatches: assessment.career_matches || [],
                profileSummary: assessment.profile_summary,
                personalityNarrative: assessment.personality_narrative,
                strengthsAnalysis: assessment.strengths_analysis || {},
                workStyleDescription: assessment.work_style_description,
                startedAt: assessment.started_at,
                completedAt: assessment.completed_at,
                canRetakeAfter: assessment.can_retake_after,
                progress: this.calculateProgress(assessment.responses)
            };
        } catch (error) {
            console.error('[AssessmentService] Error fetching user assessment:', error);
            return null;
        }
    }

    /**
     * Calculate progress percentage
     */
    calculateProgress(responses) {
        if (!responses) return 0;
        const answered = Object.keys(responses).length;
        const total = 36; // Total questions
        const progress = Math.round((answered / total) * 100);
        console.log(`[AssessmentService] Calculated progress: ${answered}/${total} = ${progress}%`);
        return progress;
    }

    /**
     * Get RIASEC dimension descriptions
     */
    getDimensionInfo() {
        return {
            R: {
                name: 'Realistic',
                description: 'Hands-on, practical, concrete',
                traits: ['Practical', 'Mechanical', 'Athletic', 'Straightforward'],
                workStyles: ['Work with tools/machinery', 'Outdoor work', 'Build/repair things', 'Physical activity'],
                careers: ['Engineer', 'Technician', 'Farmer', 'Pilot', 'Architect', 'Chef']
            },
            I: {
                name: 'Investigative',
                description: 'Analytical, intellectual, scientific',
                traits: ['Intellectual', 'Analytical', 'Curious', 'Independent'],
                workStyles: ['Research and analysis', 'Solve complex problems', 'Work independently', 'Theoretical thinking'],
                careers: ['Scientist', 'Software Developer', 'Data Analyst', 'Doctor', 'Pharmacist', 'Engineer']
            },
            A: {
                name: 'Artistic',
                description: 'Creative, expressive, original',
                traits: ['Creative', 'Imaginative', 'Expressive', 'Unconventional'],
                workStyles: ['Creative expression', 'Design and innovation', 'Flexible schedules', 'Original ideas'],
                careers: ['Designer', 'Writer', 'Musician', 'Actor', 'Photographer', 'Marketer']
            },
            S: {
                name: 'Social',
                description: 'Helping, teaching, healing',
                traits: ['Helpful', 'Understanding', 'Cooperative', 'Friendly'],
                workStyles: ['Help others', 'Teach and guide', 'Work in teams', 'Communication focused'],
                careers: ['Teacher', 'Nurse', 'Counselor', 'Social Worker', 'HR Manager', 'Therapist']
            },
            E: {
                name: 'Enterprising',
                description: 'Leadership, persuasion, business',
                traits: ['Ambitious', 'Energetic', 'Confident', 'Risk-taker'],
                workStyles: ['Leadership roles', 'Persuade and influence', 'Business activities', 'Competitive environments'],
                careers: ['Manager', 'Sales Executive', 'Entrepreneur', 'Lawyer', 'Politician', 'Consultant']
            },
            C: {
                name: 'Conventional',
                description: 'Organized, detail-oriented, systematic',
                traits: ['Organized', 'Detail-oriented', 'Reliable', 'Efficient'],
                workStyles: ['Structured tasks', 'Data and records', 'Clear procedures', 'Accuracy focused'],
                careers: ['Accountant', 'Banker', 'Administrator', 'Librarian', 'Data Entry', 'Quality Control']
            }
        };
    }

    getDimensionName(code) {
        const names = { R: 'Realistic', I: 'Investigative', A: 'Artistic', S: 'Social', E: 'Enterprising', C: 'Conventional' };
        return names[code] || code;
    }
}

module.exports = new AssessmentService();