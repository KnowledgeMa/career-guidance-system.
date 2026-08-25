const { query } = require('../config/database');
const groqService = require('./groqService');

/**
 * System prompt for DCGS AI Counsellor
 * Injects student context dynamically
 */
const buildSystemPrompt = (context) => {
    const { profile, results, assessment, recentRecommendations } = context;
    
    let prompt = `You are a compassionate, knowledgeable Career Guidance Counsellor for the Digital Career Guidance System (DCGS) in South Africa. You specialize in helping South African high school students with university admissions, career planning, and subject choices.

CRITICAL RULES:
- Always consider the student's specific context (results, location, interests) when answering
- For APS/admission questions, reference specific South African university requirements
- If the student expresses distress, crisis, or mental health concerns, immediately provide South African helpline resources
- Keep responses concise (2-4 paragraphs) but informative
- Use South African context (universities like UJ, Wits, UP, UCT, UKZN, etc.)
- If unsure about specific admission requirements, advise checking the latest prospectus`;

    // Inject student context if available
    if (profile) {
        prompt += `\n\nSTUDENT PROFILE:
Name: ${profile.first_name || 'Student'}
Grade: ${profile.grade || 'Unknown'}
School: ${profile.school || 'Unknown'}
Province: ${profile.province || 'Unknown'}`;
    }

    if (results?.subjects?.length > 0) {
        const subjectList = Array.isArray(results.subjects) 
            ? results.subjects.map(s => `${s.subject} (${s.mark}%, Level ${s.level}, ${s.aps_points} APS)`).join(', ')
            : 'Data available';
            
        prompt += `\n\nACADEMIC RESULTS:
APS Score (Best 6): ${results.aps_score || 'Not calculated'}
Subjects: ${subjectList}`;
    }

    if (assessment) {
        const careerMatches = Array.isArray(assessment.career_matches) 
            ? assessment.career_matches.map(c => c.name || c).join(', ')
            : assessment.career_matches;
            
        prompt += `\n\nCAREER ASSESSMENT:
RIASEC Profile: ${assessment.dominant_code || 'Not completed'}
Top Career Matches: ${careerMatches || 'None'}`;
    }

    if (recentRecommendations?.length > 0) {
        prompt += `\n\nRECENT COURSE RECOMMENDATIONS:
${recentRecommendations.slice(0, 3).map(r => 
  `- ${r.course_name} at ${r.university_name} (${r.eligibility_status}, APS: ${r.calculated_aps?.final_aps || 'N/A'})`
).join('\n')}`;
    }

    prompt += `\n\nSAFETY PROTOCOL:
If the student mentions suicide, self-harm, abuse, or severe distress, immediately include this exact text:
"**If you are in crisis, please contact:**
- Suicide Crisis Line: 0800 567 567
- SADAG Mental Health: 011 234 4837
- Childline SA: 116
- Emergency Services: 10111"`;

    return prompt;
};

/**
 * Safety keyword detection for South African context
 */
const checkSafetyFlags = (message) => {
    const lowerMsg = message.toLowerCase();
    
    const distressPatterns = [
        { pattern: /\b(suicide|kill myself|end it all|want to die)\b/, type: 'crisis', score: 0.95 },
        { pattern: /\b(self.?harm|cutting myself|hurting myself)\b/, type: 'self_harm', score: 0.90 },
        { pattern: /\b(abused|abuse|molested|raped|assaulted)\b/, type: 'distress', score: 0.85 },
        { pattern: /\b(depressed|depression|hopeless|no point living)\b/, type: 'distress', score: 0.80 },
        { pattern: /\b(anxiety|anxious|panic attack|can't cope)\b/, type: 'distress', score: 0.70 },
        { pattern: /\b(hungry|no food|poverty|can't afford fees)\b/, type: 'socioeconomic', score: 0.60 }
    ];

    const flags = [];
    for (const { pattern, type, score } of distressPatterns) {
        if (pattern.test(lowerMsg)) {
            flags.push({ type, confidence: score, matched: pattern.toString() });
        }
    }
    
    return flags;
};

class ChatService {
    /**
     * Get or create active session for user
     */
    async getOrCreateSession(userId, contextData) {
        try {
            // Check for existing active session (within last 2 hours)
            const existing = await query(`
                SELECT id, context_json, created_at 
                FROM chat_sessions 
                WHERE user_id = $1 
                AND is_active = TRUE 
                AND last_message_at > NOW() - INTERVAL '2 hours'
                ORDER BY last_message_at DESC
                LIMIT 1
            `, [userId]);

            if (existing.rows.length > 0) {
                return existing.rows[0];
            }

            // Create new session with context snapshot
            const newSession = await query(`
                INSERT INTO chat_sessions (user_id, title, context_json)
                VALUES ($1, $2, $3)
                RETURNING id, context_json, created_at
            `, [
                userId, 
                `Chat ${new Date().toLocaleDateString()}`,
                JSON.stringify(contextData)
            ]);

            return newSession.rows[0];
        } catch (error) {
            console.error('[ChatService] Session error:', error);
            throw error;
        }
    }

    /**
     * Fetch student context for injection
     */
    async buildStudentContext(userId) {
        try {
            // Get profile
            const profileRes = await query(`
                SELECT first_name, grade, school, province
                FROM student_profiles 
                WHERE user_id = $1
            `, [userId]);
            
            // Get latest processed results from result_uploads + individual subjects
            const resultsRes = await query(`
                SELECT 
                    ru.aps_score,
                    ru.groq_parsed->'subjects' as subjects,
                    ru.processed_at
                FROM result_uploads ru
                WHERE ru.user_id = $1 
                AND ru.ocr_status = 'completed'
                ORDER BY ru.processed_at DESC
                LIMIT 1
            `, [userId]);

            // Also get confirmed results from results table as backup
            const confirmedRes = await query(`
                SELECT subject, mark, level, aps_points
                FROM results
                WHERE user_id = $1
                ORDER BY aps_points DESC, subject ASC
            `, [userId]);

            // Get latest assessment
            const assessRes = await query(`
                SELECT dominant_code, career_matches, profile_summary
                FROM assessments
                WHERE user_id = $1 AND status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 1
            `, [userId]);

            // Get recent recommendations
            const recRes = await query(`
                SELECT c.name as course_name, 
                    u.name as university_name, 
                    r.eligibility_status, 
                    r.aps_breakdown as calculated_aps
                FROM recommendations r
                JOIN courses c ON r.course_id = c.id
                JOIN universities u ON c.university_id = u.id
                WHERE r.user_id = $1
                ORDER BY r.generated_at DESC
                LIMIT 5
            `, [userId]);

            // Format results - prefer confirmed results, fallback to upload
            let resultsData = null;
            if (confirmedRes.rows.length > 0) {
                resultsData = {
                    subjects: confirmedRes.rows,
                    aps_score: confirmedRes.rows.reduce((sum, r) => sum + (r.aps_points || 0), 0)
                };
            } else if (resultsRes.rows.length > 0) {
                const upload = resultsRes.rows[0];
                resultsData = {
                    subjects: upload.subjects || [],
                    aps_score: upload.aps_score,
                    from_upload: true
                };
            }

            return {
                profile: profileRes.rows[0] || null,
                results: resultsData,
                assessment: assessRes.rows[0] || null,
                recentRecommendations: recRes.rows || []
            };
        } catch (error) {
            console.error('[ChatService] Context build error:', error);
            return {};
        }
    }

    /**
     * Get recent chat history for context window
     */
    async getRecentHistory(sessionId, limit = 10) {
        try {
            const result = await query(`
                SELECT role, content, created_at
                FROM chat_messages
                WHERE session_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            `, [sessionId, limit]);
            
            return result.rows.reverse(); // Oldest first
        } catch (error) {
            console.error('[ChatService] History error:', error);
            return [];
        }
    }

    /**
     * Stream chat completion with Groq
     */
    async *streamChat(userId, message, sessionId = null) {
        const startTime = Date.now();
        
        try {
            // 1. Build context
            const context = await this.buildStudentContext(userId);
            
            // 2. Get/create session
            let session;
            if (!sessionId) {
                session = await this.getOrCreateSession(userId, context);
                sessionId = session.id;
            } else {
                // Verify session belongs to user
                const check = await query(
                    'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
                    [sessionId, userId]
                );
                if (check.rows.length === 0) throw new Error('Invalid session');
            }

            // 3. Safety check
            const safetyFlags = checkSafetyFlags(message);
            if (safetyFlags.length > 0) {
                await this.logSafetyFlags(userId, sessionId, null, safetyFlags);
                // Don't block message, but system will see flags in context
            }

            // 4. Save user message
            await query(`
                INSERT INTO chat_messages (session_id, role, content)
                VALUES ($1, 'user', $2)
            `, [sessionId, message]);

            // 5. Update session timestamp
            await query(`
                UPDATE chat_sessions 
                SET last_message_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [sessionId]);

            // FIXED: Emit start event so frontend knows the real session ID immediately
            yield {
                type: 'start',
                sessionId: sessionId,
                messageId: 'msg_' + Date.now()
            };

            // FIXED: Stream safety flags to frontend if detected so the UI banner can trigger
            if (safetyFlags.length > 0) {
                yield {
                    type: 'safetyFlag',
                    confidence: Math.max(...safetyFlags.map(f => f.confidence)),
                    flags: safetyFlags
                };
            }

            // 6. Build messages array with history
            const history = await this.getRecentHistory(sessionId, 6);
            const messages = [
                { role: 'system', content: buildSystemPrompt(context) },
                ...history.map(h => ({ role: h.role, content: h.content })),
                { role: 'user', content: message }
            ];

            // 7. Stream from Groq
            const stream = await groqService.streamChatCompletion(messages);
            let fullResponse = '';
            let tokenCount = 0;

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                fullResponse += content;
                tokenCount++;
                yield {
                    type: 'content',
                    content: content,
                    sessionId: sessionId
                };
            }

            // 8. Save assistant response
            const latency = Date.now() - startTime;
            await query(`
                INSERT INTO chat_messages (session_id, role, content, metadata)
                VALUES ($1, 'assistant', $2, $3)
            `, [
                sessionId, 
                fullResponse, 
                JSON.stringify({ latency_ms: latency, tokens: tokenCount, safety_flags: safetyFlags })
            ]);

            // 9. Send completion signal with metadata
            yield {
                type: 'done',
                sessionId: sessionId,
                metadata: {
                    latency: latency,
                    hasSafetyFlags: safetyFlags.length > 0,
                    flags: safetyFlags
                }
            };

        } catch (error) {
            console.error('[ChatService] Stream error:', error);
            yield {
                type: 'error',
                error: 'Unable to process message. Please try again.',
                sessionId: sessionId
            };
        }
    }

    /**
     * Get suggested prompts based on user state
     */
    async getSuggestedPrompts(userId) {
        try {
            // Check user state
            const hasResults = await query('SELECT 1 FROM results WHERE user_id = $1 LIMIT 1', [userId]);
            const hasAssessment = await query('SELECT 1 FROM assessments WHERE user_id = $1 AND status = $2 LIMIT 1', 
                [userId, 'completed']);

            const conditions = [];
            if (hasResults.rows.length > 0) conditions.push('has_results');
            if (hasAssessment.rows.length > 0) conditions.push('has_assessment');

            // Get matching prompts
            const result = await query(`
                SELECT prompt_text, category
                FROM suggested_prompts
                WHERE active = TRUE
                AND (
                    context_conditions = '{}'::jsonb 
                    OR context_conditions ?| $1
                )
                ORDER BY priority DESC, RANDOM()
                LIMIT 4
            `, [conditions]);

            return result.rows;
        } catch (error) {
            console.error('[ChatService] Prompts error:', error);
            return [];
        }
    }

    /**
     * Get chat history for a session
     */
    async getSessionHistory(sessionId, userId) {
        try {
            // Verify ownership
            const sessionCheck = await query(
                'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
                [sessionId, userId]
            );
            
            if (sessionCheck.rows.length === 0) {
                throw new Error('Session not found');
            }

            const result = await query(`
                SELECT id, role, content, metadata, created_at
                FROM chat_messages
                WHERE session_id = $1
                ORDER BY created_at ASC
            `, [sessionId]);

            return result.rows;
        } catch (error) {
            console.error('[ChatService] History fetch error:', error);
            throw error;
        }
    }

    /**
     * Get all sessions for user
     */
    async getUserSessions(userId) {
        try {
            const result = await query(`
                SELECT 
                    s.id, 
                    s.title, 
                    s.created_at, 
                    s.last_message_at,
                    (SELECT content FROM chat_messages 
                     WHERE session_id = s.id AND role = 'user' 
                     ORDER BY created_at DESC LIMIT 1) as last_message_preview,
                    (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) as message_count
                FROM chat_sessions s
                WHERE s.user_id = $1
                ORDER BY s.last_message_at DESC
                LIMIT 20
            `, [userId]);
            
            return result.rows;
        } catch (error) {
            console.error('[ChatService] Sessions error:', error);
            return [];
        }
    }

    /**
     * Log safety flags for admin review
     */
    async logSafetyFlags(userId, sessionId, messageId, flags) {
        try {
            for (const flag of flags) {
                await query(`
                    INSERT INTO safety_flags (user_id, session_id, message_id, flag_type, confidence_score)
                    VALUES ($1, $2, $3, $4, $5)
                `, [userId, sessionId, messageId, flag.type, flag.confidence]);
            }
            
            // If high confidence crisis, could trigger immediate notification here
            if (flags.some(f => f.type === 'crisis' && f.confidence > 0.9)) {
                console.warn(`[SAFETY ALERT] High confidence crisis detected for user ${userId}`);
                // TODO: Send email to admin/counsellor
            }
        } catch (error) {
            console.error('[ChatService] Safety logging error:', error);
        }
    }

    /**
     * End session (soft close)
     */
    async endSession(sessionId, userId) {
        await query(`
            UPDATE chat_sessions 
            SET is_active = FALSE 
            WHERE id = $1 AND user_id = $2
        `, [sessionId, userId]);
    }
}

module.exports = new ChatService();