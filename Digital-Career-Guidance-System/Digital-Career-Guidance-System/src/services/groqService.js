const Groq = require('groq-sdk');
const { ADMISSIONS_OFFICER_PROMPT } = require('../prompts/admissionsOfficer');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

class GroqService {
    async parseResults(rawOcrText) {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: `You are a data extraction specialist for South African matric results.
                        
    CRITICAL COLUMN INSTRUCTIONS:
    - Extract marks from the "Learner" column ONLY (specifically the "%" sub-column)
    - IGNORE the "Grade" column completely - this is not the learner's mark
    - The "Learner" column is split into "Level" (1-7) and "%" (0-100)
    - Use the percentage (%) values from the Learner column, NOT the Grade column
    - For "End of Year" or "Final" results, use the Learner % from that column

    Return ONLY valid JSON in this exact format:
    {
    "subjects": [
        {
        "subject": "exact subject name",
        "mark": 75,
        "level": 6
        }
    ],
    "year": 2024,
    "exam_type": "NSC"
    }

    Rules:
    - Marks must be integers 0-100 from the Learner % column only
    - Levels are 1-7 (7=80-100%, 6=70-79%, 5=60-69%, 4=50-59%, 3=40-49%, 2=30-39%, 1=0-29%)
    - Calculate level from mark if not provided
    - Standardize subject names to official NSC names
    - Return ONLY the JSON, no markdown, no explanation`
                    },
                    {
                        role: 'user',
                        content: `Parse this OCR text and extract ONLY the Learner column percentages:\n\n${rawOcrText}`
                    }
                ],
                model: 'llama-3.3-70b-versatile',  // Updated model
                temperature: 0.1,
                max_tokens: 2048,
                response_format: { type: 'json_object' }
            });

            const parsed = JSON.parse(completion.choices[0].message.content);

            // Validate and clean
            const cleaned = this.validateAndClean(parsed);

            // Treat empty or critically few subjects as parsing failure
            if (cleaned.subjects.length === 0) {
                console.error('Groq parseResults: no valid subjects after cleaning');
                return {
                    success: false,
                    error: 'Groq returned no valid subjects — possibly unreadable or misformatted report'
                };
            }

            if (cleaned.subjects.length < 5) {
                console.error(`Groq parseResults: only ${cleaned.subjects.length} valid subjects (need 5+)`);
                return {
                    success: false,
                    error: `Groq returned only ${cleaned.subjects.length} subjects, expected 7+ for NSC`
                };
            }

            return {
                success: true,
                data: cleaned
            };

        } catch (error) {
            console.error('Groq Parsing Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    validateAndClean(data) {
        const validSubjects = [];
        let skippedCount = 0;

        for (const subj of data.subjects || []) {
            if (!subj.subject || typeof subj.mark !== 'number') {
                skippedCount++;
                continue;
            }

            // Clean mark
            let mark = Math.round(Math.max(0, Math.min(100, subj.mark)));

            // Calculate level if missing
            let level = subj.level || this.calculateLevel(mark);

            validSubjects.push({
                subject: this.standardizeSubjectName(subj.subject),
                mark,
                level
            });
        }

        if (skippedCount > 0) {
            console.warn(`Groq validateAndClean: skipped ${skippedCount} invalid subjects`);
        }

        // NSC requires at least 7 subjects — flag if fewer survived
        if (validSubjects.length < 5) {
            console.warn(`Groq validateAndClean: only ${validSubjects.length} valid subjects (expected 7+)`);
        }

        return {
            subjects: validSubjects,
            year: data.year || new Date().getFullYear(),
            exam_type: data.exam_type || 'NSC',
            _meta: {
                validCount: validSubjects.length,
                skippedCount
            }
        };
    }

    calculateLevel(mark) {
        if (mark >= 80) return 7;
        if (mark >= 70) return 6;
        if (mark >= 60) return 5;
        if (mark >= 50) return 4;
        if (mark >= 40) return 3;
        if (mark >= 30) return 2;
        return 1;
    }

    standardizeSubjectName(name) {
        // Common normalizations
        const mappings = {
            'maths': 'Mathematics',
            'math': 'Mathematics',
            'math lit': 'Mathematical Literacy',
            'maths lit': 'Mathematical Literacy',
            'english hl': 'English Home Language',
            'english fal': 'English First Additional Language',
            'afrikaans hl': 'Afrikaans Home Language',
            'afrikaans fal': 'Afrikaans First Additional Language',
            'physics': 'Physical Sciences',
            'bio': 'Life Sciences',
            'biology': 'Life Sciences',
            'lo': 'Life Orientation'
        };

        const lower = name.toLowerCase().trim();
        return mappings[lower] || name;
    }

    async generateRecommendationPrompt(studentData) {
        // For Phase 2
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'Generate personalized university recommendations...'
                }
            ],
            model: 'llama3-70b-8192'
        });
        return completion.choices[0].message.content;
    }

    async evaluateAdmission(context) {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: ADMISSIONS_OFFICER_PROMPT },
                    { role: 'user', content: JSON.stringify(context, null, 2) }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1,
                max_tokens: 2000,
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(completion.choices[0].message.content);
            
            // Validate required fields
            if (!result.eligibility_status || !result.calculated_aps) {
                throw new Error('Invalid response format from Groq');
            }
            
            return result;

        } catch (error) {
            console.error('Groq evaluation error:', error);
            throw error;
        }
    }

    async *streamChatCompletion(messages) {
        try {
            const stream = await groq.chat.completions.create({
                messages: messages,
                model: 'llama-3.3-70b-versatile', // or 'mixtral-8x7b-32768' for faster responses
                temperature: 0.7,
                max_tokens: 1024,
                top_p: 0.9,
                stream: true, // Enable streaming
            });

            for await (const chunk of stream) {
                yield chunk;
            }
        } catch (error) {
            console.error('[GroqService] Streaming error:', error);
            throw error;
        }
    }

    /**
     * Generate comprehensive career profile analysis based on RIASEC scores
     */
    async generateCareerProfile({ riasecScores, dominantCode, careerMatches }) {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert career counselor specializing in Holland Codes (RIASEC).
                        CRITICAL: Return ONLY valid JSON. All text values must be single-line strings using \\n for newlines.
                        
                        EXACT FORMAT:
                        {
                            "summary": "2-3 sentences overview",
                            "narrative": "Detailed analysis paragraph 1\\n\\nParagraph 2\\n\\nParagraph 3",
                            "strengths": {
                                "primary": "strength 1",
                                "secondary": "strength 2", 
                                "tertiary": "strength 3"
                            },
                            "workStyle": "work environment description",
                            "careerRecommendations": [
                                {"cluster": "Name", "reason": "Why it matches"}
                            ],
                            "studyAdvice": "study tips",
                            "cautions": "watch outs"
                        }`
                    },
                    {
                        role: 'user',
                        content: `RIASEC: ${JSON.stringify(riasecScores)}, Code: ${dominantCode}`
                    }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.3, // Lower temperature for stricter formatting
                max_tokens: 2048,
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(completion.choices[0].message.content);
            // Validate required fields exist
            if (!result.summary || !result.narrative) {
                throw new Error('Missing required fields in AI response');
            }
            return result;

        } catch (error) {
            console.error('Groq career profile generation error:', error);
            // Your fallback is working - keep it
            return {
                summary: `Your assessment reveals a ${dominantCode} profile...`,
                narrative: 'Profile analysis completed...',
                strengths: { primary: 'Self-awareness', secondary: 'Career focus', tertiary: 'Growth mindset' },
                workStyle: 'You prefer environments aligned with your characteristics.',
                careerRecommendations: careerMatches.slice(0, 3).map(m => ({
                    cluster: m.name,
                    reason: `Strong match based on your ${dominantCode} profile`
                })),
                studyAdvice: 'Consider courses that develop your dominant skill areas.',
                cautions: 'Balance your strengths with development in less dominant areas.'
            };
        }
    }

    getDimensionName(code) {
        const names = {
            R: 'Realistic',
            I: 'Investigative',
            A: 'Artistic',
            S: 'Social',
            E: 'Enterprising',
            C: 'Conventional'
        };
        return names[code] || code;
    }
}

module.exports = new GroqService();