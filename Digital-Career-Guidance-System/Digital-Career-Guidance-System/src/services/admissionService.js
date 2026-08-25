const { query } = require('../config/database');
const { ADMISSIONS_OFFICER_PROMPT } = require('../prompts/admissionsOfficer');
const groqService = require('./groqService');

/**
 * Validates UUID format
 */
const isValidUUID = (uuid) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Normalizes subject names for strict comparison
 * Removes spaces, punctuation, and standardizes common variations
 */
function normalizeSubjectName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, '')  // Remove all non-alphanumeric
        .replace(/(1st|first|1add|firstadditional)/g, 'fal')  // Standardize FAL
        .replace(/(2nd|second|2add|secondadditional)/g, 'sal')  // Standardize SAL
        .replace(/(hl|homelanguage|home)/g, 'hl')  // Standardize HL
        .replace(/(fal|firstadd|firstadditional|firstaddlanguage)/g, 'fal')
        .replace(/(maths|mathematics)/g, 'mathematics')  // maths -> mathematics
        .replace(/(mathlit|mathslit|mathematicalliteracy|mathliteracy)/g, 'mathematicalliteracy')
        .replace(/(techmath|technicalmath|technicalmathematics)/g, 'technicalmathematics')
        .replace(/(physics|physicalscience|physicalsciences)/g, 'physicalsciences')
        .replace(/(lifescience|lifesciences|biology)/g, 'lifesciences')
        .replace(/(lifeorientation|lo)/g, 'lifeorientation')
        .replace(/(afrikaans|afs)/g, 'afrikaans')  // Will distinguish HL vs FAL by context
        .replace(/(english|eng)/g, 'english')
        .trim();
}

/**
 * Strict subject classification - returns exact match type
 */
function classifySubject(studentSubjectName) {
    const normalized = normalizeSubjectName(studentSubjectName);
    
    // Core Mathematics (NOT Mathematical Literacy, NOT Technical Mathematics)
    if (normalized === 'mathematics' || normalized === 'coremathematics' || normalized === 'puremathematics') {
        return { type: 'core_math', normalized };
    }
    
    // Mathematical Literacy (distinct from core Mathematics)
    if (normalized === 'mathematicalliteracy' || normalized === 'mathliteracy') {
        return { type: 'math_lit', normalized };
    }
    
    // Technical Mathematics
    if (normalized === 'technicalmathematics' || normalized === 'techmath') {
        return { type: 'tech_math', normalized };
    }
    
    // Physical Sciences
    if (normalized.includes('physicalscience')) {
        return { type: 'physical_sciences', normalized };
    }
    
    // Life Sciences
    if (normalized.includes('lifescience') || normalized === 'biology') {
        return { type: 'life_sciences', normalized };
    }
    
    // Languages - need to distinguish HL vs FAL
    if (normalized.includes('english') || normalized.includes('afrikaans') || normalized.includes('zulu') || 
        normalized.includes('xhosa') || normalized.includes('sotho') || normalized.includes('tswana') ||
        normalized.includes('pedi') || normalized.includes('venda') || normalized.includes('tsonga') ||
        normalized.includes('swati') || normalized.includes('ndebele')) {
        
        if (normalized.includes('hl') || normalized.includes('home')) {
            return { type: 'home_language', normalized };
        }
        if (normalized.includes('fal') || normalized.includes('firstadd') || normalized.includes('firstadditional')) {
            return { type: 'first_additional_language', normalized };
        }
        if (normalized.includes('sal') || normalized.includes('secondadd')) {
            return { type: 'second_additional_language', normalized };
        }
        // Default to home language if can't determine
        return { type: 'language', normalized };
    }
    
    // Accounting
    if (normalized.includes('accounting') || normalized.includes('accountancy')) {
        return { type: 'accounting', normalized };
    }
    
    // Business Studies
    if (normalized.includes('business') && normalized.includes('studies')) {
        return { type: 'business_studies', normalized };
    }
    
    // Economics
    if (normalized === 'economics' || normalized === 'economic') {
        return { type: 'economics', normalized };
    }
    
    // Geography
    if (normalized.includes('geography')) {
        return { type: 'geography', normalized };
    }
    
    // History
    if (normalized.includes('history')) {
        return { type: 'history', normalized };
    }
    
    // Life Orientation
    if (normalized.includes('lifeorientation') || normalized === 'lo') {
        return { type: 'life_orientation', normalized };
    }
    
    // Tourism
    if (normalized.includes('tourism')) {
        return { type: 'tourism', normalized };
    }
    
    // Hospitality
    if (normalized.includes('hospitality')) {
        return { type: 'hospitality', normalized };
    }
    
    // Agricultural Sciences
    if (normalized.includes('agricultural') || normalized.includes('agriculture')) {
        return { type: 'agricultural_sciences', normalized };
    }
    
    // Computer Applications Technology
    if (normalized.includes('cat') || (normalized.includes('computer') && normalized.includes('applications'))) {
        return { type: 'cat', normalized };
    }
    
    // Information Technology
    if (normalized.includes('informationtechnology') || normalized.includes('it')) {
        return { type: 'information_technology', normalized };
    }
    
    // Visual Arts
    if (normalized.includes('visualarts') || normalized.includes('art')) {
        return { type: 'visual_arts', normalized };
    }
    
    // Music
    if (normalized.includes('music')) {
        return { type: 'music', normalized };
    }
    
    // Dramatic Arts
    if (normalized.includes('dramatic') || normalized.includes('drama')) {
        return { type: 'dramatic_arts', normalized };
    }
    
    return { type: 'other', normalized };
}

/**
 * Check if student has a specific subject type with minimum level
 * Returns detailed match information
 */
function findSubjectByType(studentSubjects, targetType, minLevel, alternativeType = null, altMinLevel = null) {
    // Find primary subject
    const primaryMatch = studentSubjects.find(s => {
        const classification = classifySubject(s.subject);
        return classification.type === targetType && s.level >= minLevel;
    });
    
    if (primaryMatch) {
        return {
            found: true,
            subject: primaryMatch,
            matchType: 'primary',
            requirementMet: true
        };
    }
    
    // Check alternative if provided
    if (alternativeType) {
        const altMatch = studentSubjects.find(s => {
            const classification = classifySubject(s.subject);
            return classification.type === alternativeType && s.level >= (altMinLevel || minLevel);
        });
        
        if (altMatch) {
            return {
                found: true,
                subject: altMatch,
                matchType: 'alternative',
                requirementMet: true
            };
        }
    }
    
    // Check if student has subject but insufficient level
    const insufficientMatch = studentSubjects.find(s => {
        const classification = classifySubject(s.subject);
        return classification.type === targetType || (alternativeType && classification.type === alternativeType);
    });
    
    if (insufficientMatch) {
        return {
            found: true,
            subject: insufficientMatch,
            matchType: insufficientMatch.subject.toLowerCase().includes(targetType) ? 'primary' : 'alternative',
            requirementMet: false,
            reason: `Has ${insufficientMatch.subject} Level ${insufficientMatch.level}, but requires Level ${minLevel}${alternativeType ? ` (or ${alternativeType} Level ${altMinLevel || minLevel})` : ''}`
        };
    }
    
    return {
        found: false,
        subject: null,
        matchType: null,
        requirementMet: false,
        reason: `Does not have ${targetType}${alternativeType ? ` or ${alternativeType}` : ''}`
    };
}

/**
 * Check subject requirements against student results with STRICT validation
 * Handles: Core Math vs Math Lit, Technical Math faculty restrictions, level requirements
 */
function checkSubjectRequirements(studentSubjects, requirements, courseData) {
    const analysis = [];
    const missing = [];
    const warnings = [];
    
    // Parse requirements if string
    const reqs = typeof requirements === 'string' ? JSON.parse(requirements) : (requirements || []);
    
    // Determine student's math situation
    const mathClassification = {
        hasCoreMath: studentSubjects.some(s => classifySubject(s.subject).type === 'core_math'),
        hasMathLit: studentSubjects.some(s => classifySubject(s.subject).type === 'math_lit'),
        hasTechMath: studentSubjects.some(s => classifySubject(s.subject).type === 'tech_math'),
        coreMathLevel: studentSubjects.find(s => classifySubject(s.subject).type === 'core_math')?.level || 0,
        mathLitLevel: studentSubjects.find(s => classifySubject(s.subject).type === 'math_lit')?.level || 0,
        techMathLevel: studentSubjects.find(s => classifySubject(s.subject).type === 'tech_math')?.level || 0
    };
    
    for (const req of reqs) {
        // Determine requirement types
        const primaryType = classifySubject(req.subject).type;
        const alternativeType = req.alternative ? classifySubject(req.alternative).type : null;
        
        // SPECIAL HANDLING: Mathematics requirements
        if (primaryType === 'core_math') {
            // Check if student has core Math
            if (mathClassification.hasCoreMath) {
                const mathSubject = studentSubjects.find(s => classifySubject(s.subject).type === 'core_math');
                if (mathSubject.level >= req.min_level) {
                    analysis.push({
                        requirement: `${req.subject} Level ${req.min_level}`,
                        student_has: `${mathSubject.subject} Level ${mathSubject.level} (${mathSubject.mark}%)`,
                        status: 'MET',
                        critical: req.required,
                        matchType: 'primary'
                    });
                } else {
                    const status = req.required ? 'MISSING' : 'NOT_MET';
                    analysis.push({
                        requirement: `${req.subject} Level ${req.min_level}`,
                        student_has: `${mathSubject.subject} Level ${mathSubject.level} (${mathSubject.mark}%) - insufficient level`,
                        status,
                        critical: req.required,
                        matchType: 'primary_insufficient'
                    });
                    if (req.required) missing.push(`${req.subject} (Level ${req.min_level}+ required, has Level ${mathSubject.level})`);
                }
                continue;
            }
            
            // Check Technical Mathematics (if accepted for this faculty)
            if (mathClassification.hasTechMath) {
                const acceptsTechMath = courseData.accepts_technical_math === true;
                const facultyAllowed = courseData.technical_math_faculties?.includes(courseData.faculty);
                
                if (acceptsTechMath && facultyAllowed) {
                    const techMathSubject = studentSubjects.find(s => classifySubject(s.subject).type === 'tech_math');
                    // Technical Math usually requires same level or higher
                    const techMinLevel = req.min_level; // Or adjust if needed
                    
                    if (techMathSubject.level >= techMinLevel) {
                        analysis.push({
                            requirement: `${req.subject} Level ${req.min_level}`,
                            student_has: `${techMathSubject.subject} Level ${techMathSubject.level} (${techMathSubject.mark}%) - ACCEPTED as substitute for ${courseData.faculty}`,
                            status: 'MET',
                            critical: req.required,
                            matchType: 'technical_substitute'
                        });
                    } else {
                        const status = req.required ? 'MISSING' : 'NOT_MET';
                        analysis.push({
                            requirement: `${req.subject} Level ${req.min_level} (or Technical Mathematics Level ${techMinLevel} for ${courseData.faculty})`,
                            student_has: `${techMathSubject.subject} Level ${techMathSubject.level} - insufficient level`,
                            status,
                            critical: req.required,
                            matchType: 'technical_insufficient'
                        });
                        if (req.required) missing.push(`${req.subject} (Technical Mathematics Level ${techMathSubject.level} insufficient)`);
                    }
                    continue;
                } else if (acceptsTechMath && !facultyAllowed) {
                    // Has Tech Math but faculty doesn't allow it
                    const techMathSubject = studentSubjects.find(s => classifySubject(s.subject).type === 'tech_math');
                    analysis.push({
                        requirement: `${req.subject} Level ${req.min_level}`,
                        student_has: `${techMathSubject.subject} Level ${techMathSubject.level} - NOT ACCEPTED for ${courseData.faculty} faculty`,
                        status: req.required ? 'MISSING' : 'NOT_MET',
                        critical: req.required,
                        matchType: 'technical_faculty_rejected',
                        note: `Technical Mathematics accepted at this university, but not for ${courseData.faculty}`
                    });
                    if (req.required) missing.push(`${req.subject} (Technical Mathematics not accepted for ${courseData.faculty})`);
                    continue;
                }
            }
            
            // Check Mathematical Literacy (only if explicitly allowed as alternative)
            if (mathClassification.hasMathLit && alternativeType === 'math_lit') {
                const mathLitSubject = studentSubjects.find(s => classifySubject(s.subject).type === 'math_lit');
                const requiredAltLevel = req.alt_min_level || req.min_level + 1; // Usually higher
                
                if (mathLitSubject.level >= requiredAltLevel) {
                    analysis.push({
                        requirement: `${req.subject} Level ${req.min_level} OR ${req.alternative} Level ${requiredAltLevel}`,
                        student_has: `${mathLitSubject.subject} Level ${mathLitSubject.level} (${mathLitSubject.mark}%)`,
                        status: 'MET',
                        critical: req.required,
                        matchType: 'alternative',
                        note: `Mathematical Literacy accepted with ${courseData.math_lit_aps_penalty || 0} APS penalty`
                    });
                    warnings.push(`Mathematical Literacy will incur +${courseData.math_lit_aps_penalty || 0} APS penalty`);
                } else {
                    const status = req.required ? 'MISSING' : 'NOT_MET';
                    analysis.push({
                        requirement: `${req.subject} Level ${req.min_level} OR ${req.alternative} Level ${requiredAltLevel}`,
                        student_has: `${mathLitSubject.subject} Level ${mathLitSubject.level} - insufficient level (needs Level ${requiredAltLevel})`,
                        status,
                        critical: req.required,
                        matchType: 'alternative_insufficient'
                    });
                    if (req.required) missing.push(`${req.subject} (Math Lit Level ${mathLitSubject.level} < ${requiredAltLevel})`);
                }
                continue;
            }
            
            // No acceptable Math found
            const status = req.required ? 'MISSING' : 'NOT_MET';
            const hasMathLit = mathClassification.hasMathLit;
            analysis.push({
                requirement: `${req.subject} Level ${req.min_level}${req.alternative ? ` OR ${req.alternative} Level ${req.alt_min_level || req.min_level + 1}` : ''}`,
                student_has: hasMathLit ? 'Mathematical Literacy only (not accepted for this course)' : 'No Mathematics subject found',
                status,
                critical: req.required,
                matchType: 'missing',
                note: hasMathLit ? 'This course requires core Mathematics or Technical Mathematics' : undefined
            });
            if (req.required) missing.push(req.subject);
            continue;
        }
        
        // STANDARD HANDLING for non-Math subjects
        const result = findSubjectByType(
            studentSubjects, 
            primaryType, 
            req.min_level, 
            alternativeType, 
            req.alt_min_level
        );
        
        if (result.requirementMet) {
            analysis.push({
                requirement: `${req.subject} Level ${req.min_level}${req.alternative ? ` OR ${req.alternative} Level ${req.alt_min_level || req.min_level}` : ''}`,
                student_has: `${result.subject.subject} Level ${result.subject.level} (${result.subject.mark}%)`,
                status: 'MET',
                critical: req.required,
                matchType: result.matchType
            });
        } else if (result.found) {
            const status = req.required ? 'MISSING' : 'NOT_MET';
            analysis.push({
                requirement: `${req.subject} Level ${req.min_level}${req.alternative ? ` OR ${req.alternative} Level ${req.alt_min_level || req.min_level}` : ''}`,
                student_has: `${result.subject.subject} Level ${result.subject.level} (${result.subject.mark}%) - insufficient`,
                status,
                critical: req.required,
                matchType: 'insufficient_level',
                reason: result.reason
            });
            if (req.required) missing.push(`${req.subject} (insufficient level)`);
        } else {
            const status = req.required ? 'MISSING' : 'NOT_MET';
            analysis.push({
                requirement: `${req.subject} Level ${req.min_level}${req.alternative ? ` OR ${req.alternative} Level ${req.alt_min_level || req.min_level}` : ''}`,
                student_has: 'Not taken',
                status,
                critical: req.required,
                matchType: 'not_taken'
            });
            if (req.required) missing.push(req.subject);
        }
    }
    
    // Check compulsory language requirements (Home Language and First Additional)
    const homeLangReq = courseData.requires_first_language_level || 4;
    const addLangReq = courseData.requires_additional_language_level || 3;
    
    const homeLang = studentSubjects.find(s => {
        const type = classifySubject(s.subject).type;
        return type === 'home_language' && s.level >= homeLangReq;
    });
    
    const addLang = studentSubjects.find(s => {
        const type = classifySubject(s.subject).type;
        return (type === 'first_additional_language' || type === 'second_additional_language') && s.level >= addLangReq;
    });
    
    if (!homeLang) {
        const foundHomeLang = studentSubjects.find(s => classifySubject(s.subject).type === 'home_language');
        if (foundHomeLang) {
            analysis.push({
                requirement: `Home Language Level ${homeLangReq}`,
                student_has: `${foundHomeLang.subject} Level ${foundHomeLang.level} - insufficient`,
                status: 'MISSING',
                critical: true,
                matchType: 'language_insufficient'
            });
            missing.push(`Home Language Level ${homeLangReq}`);
        } else {
            analysis.push({
                requirement: `Home Language Level ${homeLangReq}`,
                student_has: 'Not found',
                status: 'MISSING',
                critical: true,
                matchType: 'language_missing'
            });
            missing.push('Home Language');
        }
    } else {
        analysis.push({
            requirement: `Home Language Level ${homeLangReq}`,
            student_has: `${homeLang.subject} Level ${homeLang.level}`,
            status: 'MET',
            critical: true,
            matchType: 'language_met'
        });
    }
    
    if (!addLang) {
        const foundAddLang = studentSubjects.find(s => {
            const type = classifySubject(s.subject).type;
            return type === 'first_additional_language' || type === 'second_additional_language';
        });
        if (foundAddLang) {
            analysis.push({
                requirement: `First Additional Language Level ${addLangReq}`,
                student_has: `${foundAddLang.subject} Level ${foundAddLang.level} - insufficient`,
                status: 'MISSING',
                critical: true,
                matchType: 'language_insufficient'
            });
            missing.push(`First Additional Language Level ${addLangReq}`);
        } else {
            analysis.push({
                requirement: `First Additional Language Level ${addLangReq}`,
                student_has: 'Not found',
                status: 'MISSING',
                critical: true,
                matchType: 'language_missing'
            });
            missing.push('First Additional Language');
        }
    } else {
        analysis.push({
            requirement: `First Additional Language Level ${addLangReq}`,
            student_has: `${addLang.subject} Level ${addLang.level}`,
            status: 'MET',
            critical: true,
            matchType: 'language_met'
        });
    }
    
    return { 
        analysis, 
        missingRequirements: missing, 
        warnings,
        mathClassification,
        hasCriticalMissing: missing.length > 0
    };
}

/**
 * Generate a detailed narrative explaining the decision
 */
function generateNarrative(studentAPS, requiredAPS, analysis, courseData, mathClassification, warnings) {
    const buffer = studentAPS - requiredAPS;
    const metReqs = analysis.filter(r => r.status === 'MET').length;
    const totalReqs = analysis.length;
    const criticalMissing = analysis.filter(r => r.critical && r.status === 'MISSING');
    
    let narrative = '';
    
    // Opening: Eligibility summary
    if (criticalMissing.length > 0) {
        narrative = `You do not meet the requirements for ${courseData.name || courseData.course_name}. `;
        narrative += `Missing: ${criticalMissing.map(r => r.requirement.split(' Level')[0]).join(', ')}. `;
    } else if (buffer >= 2) {
        narrative = `You meet all requirements for ${courseData.name || courseData.course_name}. `;
        narrative += `Your APS of ${studentAPS} exceeds the required ${requiredAPS}. `;
    } else if (buffer >= 0) {
        narrative = `You meet the minimum requirements for ${courseData.name || courseData.course_name}. `;
        narrative += `Your APS of ${studentAPS} meets the required ${requiredAPS}, but admission may be competitive. `;
    } else {
        narrative = `Your APS of ${studentAPS} is below the required ${requiredAPS} for ${courseData.name || courseData.course_name}. `;
    }
    
    // Math-specific messaging
    if (mathClassification.hasMathLit && !mathClassification.hasCoreMath && !mathClassification.hasTechMath) {
        const mathReq = analysis.find(r => r.requirement.includes('Mathematics'));
        if (mathReq && mathReq.status !== 'MET') {
            narrative += `You have Mathematical Literacy (Level ${mathClassification.mathLitLevel}) but this course requires core Mathematics. `;
            if (courseData.math_lit_aps_penalty) {
                narrative += `Even if Math Lit were accepted, you would incur a +${courseData.math_lit_aps_penalty} APS penalty. `;
            }
        } else if (mathReq && mathReq.status === 'MET' && mathReq.matchType === 'alternative') {
            narrative += `Your Mathematical Literacy meets the requirement but carries a +${courseData.math_lit_aps_penalty || 0} APS penalty. `;
        }
    }
    
    if (mathClassification.hasTechMath && !mathClassification.hasCoreMath) {
        const techMathAccepted = analysis.find(r => r.matchType === 'technical_substitute');
        if (!techMathAccepted) {
            narrative += `You have Technical Mathematics, but it is not accepted for ${courseData.faculty}. `;
        }
    }
    
    // Add warnings
    if (warnings && warnings.length > 0) {
        narrative += warnings.join(' ');
    }
    
    // Summary stats
    narrative += `Subject requirements: ${metReqs}/${totalReqs} met.`;
    
    return narrative;
}

class AdmissionService {
    /**
     * Evaluate single course eligibility for user
     */
    async evaluateCourse(userId, courseId) {
        if (!isValidUUID(userId) || !isValidUUID(courseId)) {
            throw new Error('Invalid user or course ID format');
        }

        try {
            const studentData = await this.getStudentResults(userId);
            
            if (!studentData.subjects || studentData.subjects.length === 0) {
                return {
                    eligibility_status: 'MISSING_REQUIREMENTS',
                    confidence_score: 0,
                    narrative_reason: 'No results found. Please upload your matric results first.',
                    calculated_aps: null,
                    subject_analysis: []
                };
            }

            const courseData = await this.getCourseRequirements(courseId);
            const preCalculated = this.calculatePreliminaryAPS(studentData, courseData);
            const context = {
                student: { ...studentData, ...preCalculated },
                course: courseData
            };

            const evaluation = await groqService.evaluateAdmission(context);
            await this.storeRecommendation(userId, courseId, evaluation);
            
            return evaluation;

        } catch (error) {
            console.error(`Admission evaluation error for user ${userId}, course ${courseId}:`, error);
            if (error.message === 'Course not found') throw error;
            
            return {
                eligibility_status: 'ERROR',
                confidence_score: 0,
                narrative_reason: 'Unable to complete evaluation. Please try again later.',
                error: error.message,
                calculated_aps: null
            };
        }
    }

    /**
     * Evaluate course eligibility using RULES (no AI) - FAST and accurate
     */
    async evaluateCourseRuleBased(userId, courseId, courseData = null) {
        if (!isValidUUID(userId) || !isValidUUID(courseId)) {
            throw new Error('Invalid user or course ID format');
        }

        try {
            const studentData = await this.getStudentResults(userId);

            if (!studentData.subjects || studentData.subjects.length === 0) {
                return {
                    eligibility_status: 'MISSING_REQUIREMENTS',
                    confidence_score: 0,
                    narrative_reason: 'No results found. Please upload your matric results first.',
                    calculated_aps: null,
                    subject_analysis: []
                };
            }

            if (!courseData) {
                courseData = await this.getCourseRequirements(courseId);
            }

            // Ensure courseData has all necessary fields
            const enrichedCourseData = {
                ...courseData,
                faculty: courseData.faculty || courseData.course_faculty,
                accepts_technical_math: courseData.accepts_technical_math === true,
                technical_math_faculties: courseData.technical_math_faculties || [],
                math_lit_aps_penalty: courseData.math_lit_aps_penalty || 0,
                aps_calculation_rules: courseData.aps_calculation_rules || {},
                subject_requirements: courseData.subject_requirements || [],
                requires_first_language_level: courseData.requires_first_language_level || 4,
                requires_additional_language_level: courseData.requires_additional_language_level || 3
            };

            // Calculate APS with all university-specific rules
            const calculated = this.calculatePreliminaryAPS(studentData, enrichedCourseData);

            // Determine required APS (with Math Lit penalty if applicable)
            const requiredAPS = calculated.has_mathematics
                ? enrichedCourseData.base_min_aps
                : enrichedCourseData.base_min_aps + (enrichedCourseData.math_lit_aps_penalty || 0);

            // Check ALL subject requirements with strict validation
            const { analysis, missingRequirements, warnings, mathClassification, hasCriticalMissing } = checkSubjectRequirements(
                studentData.subjects,
                enrichedCourseData.subject_requirements,
                enrichedCourseData
            );

            // Determine eligibility status
            let status = 'INELIGIBLE';
            let confidence = 0;
            let rejectionReason = '';

            const apsBuffer = calculated.final_aps - requiredAPS;
            const hasCriticalMissingReqs = missingRequirements.length > 0 || hasCriticalMissing;

            if (hasCriticalMissingReqs) {
                status = 'MISSING_REQUIREMENTS';
                confidence = 0.2;
                
                // Specific messaging for common scenarios
                const mathMissing = analysis.find(r => 
                    r.requirement.includes('Mathematics') && r.status === 'MISSING'
                );
                if (mathMissing && mathClassification.hasMathLit && !mathClassification.hasCoreMath) {
                    rejectionReason = 'Requires core Mathematics, but student has only Mathematical Literacy';
                } else if (mathMissing && mathClassification.hasTechMath) {
                    rejectionReason = `Technical Mathematics not accepted for ${enrichedCourseData.faculty}`;
                }
            } else if (apsBuffer >= 2) {
                status = 'ELIGIBLE';
                confidence = Math.min(0.95, 0.75 + (apsBuffer * 0.03));
            } else if (apsBuffer >= 0) {
                status = 'CONDITIONAL';
                confidence = 0.65;
                rejectionReason = apsBuffer === 0 ? 'Meets minimum APS exactly' : `Only ${apsBuffer} APS point above minimum`;
            } else {
                status = 'INELIGIBLE';
                confidence = Math.max(0.1, 0.4 + (apsBuffer * 0.02));
                rejectionReason = `APS ${Math.abs(apsBuffer)} points below requirement`;
            }

            // Generate detailed narrative
            const narrative = generateNarrative(
                calculated.final_aps,
                requiredAPS,
                analysis,
                enrichedCourseData,
                mathClassification,
                warnings
            );

            // Build recommendations based on gaps
            const recommendations = [];
            if (apsBuffer < 0) {
                recommendations.push(`Improve your APS by ${Math.abs(apsBuffer)} points to meet requirements`);
            }
            if (mathClassification.hasMathLit && !mathClassification.hasCoreMath) {
                recommendations.push('Consider upgrading to core Mathematics for more course options');
            }

            // Build alternative pathways
            const alternativePathways = [];
            if (status !== 'ELIGIBLE' && mathClassification.hasMathLit && !mathClassification.hasCoreMath) {
                alternativePathways.push({
                    suggestion: 'Courses accepting Mathematical Literacy',
                    reason: 'Search for programs that explicitly accept Math Lit or have lower Math requirements',
                    eligibility: 'EXPLORE'
                });
            }

            // Build result
            const evaluation = {
                eligibility_status: status,
                confidence_score: parseFloat(confidence.toFixed(2)),
                calculated_aps: {
                    base_aps: calculated.base_aps,
                    bonus_points: calculated.bonus_points,
                    math_penalty_applied: calculated.math_lit_penalty,
                    final_aps: calculated.final_aps,
                    required_aps: requiredAPS,
                    subjects_considered: calculated.subjects.map(s => ({
                        name: s.subject,
                        mark: s.mark,
                        aps: s.aps_points,
                        included: true
                    })),
                    excluded_subjects: calculated.excluded_subjects || []
                },
                subject_analysis: analysis,
                missing_requirements: missingRequirements,
                narrative_reason: narrative,
                recommendations_for_student: recommendations,
                alternative_pathways: alternativePathways,
                _meta: {
                    evaluated_at: new Date().toISOString(),
                    rejection_reason: rejectionReason,
                    math_classification: mathClassification
                }
            };

            // Cache result
            await this.storeRecommendation(userId, courseId, evaluation);

            return evaluation;

        } catch (error) {
            console.error(`Rule-based evaluation error:`, error);
            return {
                eligibility_status: 'ERROR',
                confidence_score: 0,
                narrative_reason: 'Evaluation failed. Please try again.',
                calculated_aps: null,
                error: error.message
            };
        }
    }

    /**
     * Pre-calculate APS with university-specific rules
     * Handles: UP-style exclusions, Wits-style bonuses, Math Lit penalties, Level 1 exclusions
     */
    calculatePreliminaryAPS(studentData, courseReq) {
        const rules = courseReq.aps_calculation_rules || {};
        let subjects = [...studentData.subjects];
        const excludedSubjects = [];
        
        // UP/TUT-style: Exclude Life Orientation
        if (rules.exclude_lo) {
            const loSubjects = subjects.filter(s => 
                classifySubject(s.subject).type === 'life_orientation'
            );
            excludedSubjects.push(...loSubjects.map(s => s.subject));
            subjects = subjects.filter(s => 
                classifySubject(s.subject).type !== 'life_orientation'
            );
        }
        
        // Wits-style: Calculate bonuses for high achievement
        let bonusPoints = 0;
        if (rules.bonus_subjects && rules.bonus_threshold) {
            subjects.forEach(subj => {
                const matchesBonus = rules.bonus_subjects.some(bs => {
                    const subjType = classifySubject(subj.subject).type;
                    const bonusType = classifySubject(bs).type;
                    return subjType === bonusType || 
                           subj.subject.toLowerCase().includes(bs.toLowerCase());
                });
                if (matchesBonus && subj.mark >= rules.bonus_threshold) {
                    bonusPoints += (rules.bonus_points || 2);
                }
            });
            // Cap bonus at maximum allowed
            if (rules.max_bonus_points && bonusPoints > rules.max_bonus_points) {
                bonusPoints = rules.max_bonus_points;
            }
        }
        
        // Sort by APS points and take best 6
        const bestSix = subjects
            .sort((a, b) => b.aps_points - a.aps_points)
            .slice(0, 6);
            
        const baseAPS = bestSix.reduce((sum, s) => sum + (s.aps_points || 0), 0);
        
        // Determine math status with strict classification
        const mathSubjects = studentData.subjects.map(s => ({
            ...s,
            classification: classifySubject(s.subject)
        }));
        
        const hasCoreMath = mathSubjects.some(s => 
            s.classification.type === 'core_math'
        );
        const hasMathLit = mathSubjects.some(s => 
            s.classification.type === 'math_lit'
        );
        const hasTechMath = mathSubjects.some(s => 
            s.classification.type === 'tech_math'
        );
        
        // Math Lit penalty: Applied when student has Math Lit instead of core Math
        let mathLitPenalty = 0;
        if (!hasCoreMath && hasMathLit && courseReq.math_lit_aps_penalty) {
            mathLitPenalty = courseReq.math_lit_aps_penalty;
        }
        
        // Technical Math note: Doesn't give penalty, but may not be accepted
        // (handled in subject requirements check)
        
        return {
            subjects: bestSix,
            base_aps: baseAPS,
            bonus_points: bonusPoints,
            math_lit_penalty: mathLitPenalty,
            final_aps: baseAPS + bonusPoints - mathLitPenalty,
            has_mathematics: hasCoreMath,
            has_math_literacy: hasMathLit,
            has_technical_math: hasTechMath,
            subject_count: studentData.subjects.length,
            excluded_subjects: excludedSubjects,
            total_subjects_considered: subjects.length
        };
    }

    /**
     * Fetch student's confirmed results from database
     */
    async getStudentResults(userId) {
        try {
            const result = await query(`
                SELECT subject, mark, level, aps_points 
                FROM results 
                WHERE user_id = $1 
                ORDER BY aps_points DESC, subject ASC
            `, [userId]);
            
            return {
                subjects: result.rows,
                total_subjects: result.rows.length
            };
        } catch (error) {
            console.error(`Error fetching results for user ${userId}:`, error);
            throw new Error('Failed to retrieve student results');
        }
    }

    /**
     * Get detailed course information for modal display
     */
    async getDetailedCourseInfo(courseId) {
        try {
            const result = await query(`
                SELECT
                    c.id as course_id,
                    c.name as course_name,
                    c.code as course_code,
                    c.faculty,
                    c.duration_years,
                    c.nqf_level,
                    c.description,
                    c.career_outcomes,
                    u.id as university_id,
                    u.name as university_name,
                    u.acronym as university_acronym,
                    u.province,
                    u.website,
                    u.aps_calculation_method,
                    cr.base_min_aps,
                    cr.math_lit_aps_penalty,
                    cr.subject_requirements,
                    cr.accepts_technical_math,
                    cr.technical_math_faculties,
                    cr.aps_calculation_rules,
                    cr.requires_first_language_level,
                    cr.requires_additional_language_level
                FROM courses c
                JOIN universities u ON c.university_id = u.id
                JOIN course_requirements cr ON c.id = cr.course_id
                WHERE c.id = $1 AND c.active = TRUE
            `, [courseId]);

            if (result.rows.length === 0) {
                throw new Error('Course not found or inactive');
            }

            const data = result.rows[0];

            return {
                course: {
                    id: data.course_id,
                    name: data.course_name,
                    code: data.course_code,
                    faculty: data.faculty,
                    duration_years: data.duration_years,
                    nqf_level: data.nqf_level,
                    description: data.description,
                    career_outcomes: this.parseJSONB(data.career_outcomes) || []
                },
                university: {
                    id: data.university_id,
                    name: data.university_name,
                    acronym: data.university_acronym,
                    province: data.province,
                    website: data.website,
                    aps_calculation_method: data.aps_calculation_method
                },
                requirements: {
                    base_min_aps: data.base_min_aps,
                    math_lit_aps_penalty: data.math_lit_aps_penalty,
                    subject_requirements: this.parseJSONB(data.subject_requirements) || [],
                    accepts_technical_math: data.accepts_technical_math,
                    technical_math_faculties: this.parseJSONB(data.technical_math_faculties) || [],
                    aps_calculation_rules: this.parseJSONB(data.aps_calculation_rules) || {},
                    requires_first_language_level: data.requires_first_language_level,
                    requires_additional_language_level: data.requires_additional_language_level
                }
            };
        } catch (error) {
            console.error(`Error fetching detailed course info for ${courseId}:`, error);
            throw new Error('Failed to retrieve course details');
        }
    }

    /**
     * Safely parse JSONB data
     */
    parseJSONB(data) {
        if (!data) return null;
        if (typeof data === 'object') return data;
        try {
            return JSON.parse(data);
        } catch (e) {
            console.warn('Failed to parse JSONB:', data);
            return null;
        }
    }

    /**
     * Store or update recommendation in database
     */
    async storeRecommendation(userId, courseId, evaluation) {
        try {
            await query(`
                INSERT INTO recommendations 
                (user_id, course_id, eligibility_status, confidence_score, 
                 aps_breakdown, subject_analysis, narrative_reason, alternative_pathways, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '7 days')
                ON CONFLICT (user_id, course_id) 
                DO UPDATE SET
                    eligibility_status = EXCLUDED.eligibility_status,
                    confidence_score = EXCLUDED.confidence_score,
                    aps_breakdown = EXCLUDED.aps_breakdown,
                    subject_analysis = EXCLUDED.subject_analysis,
                    narrative_reason = EXCLUDED.narrative_reason,
                    alternative_pathways = EXCLUDED.alternative_pathways,
                    generated_at = CURRENT_TIMESTAMP,
                    expires_at = EXCLUDED.expires_at,
                    viewed_by_user = FALSE
            `, [
                userId,
                courseId,
                evaluation.eligibility_status,
                evaluation.confidence_score,
                JSON.stringify(evaluation.calculated_aps),
                JSON.stringify(evaluation.subject_analysis),
                evaluation.narrative_reason,
                JSON.stringify(evaluation.alternative_pathways || [])
            ]);
        } catch (error) {
            console.error(`Error storing recommendation for user ${userId}, course ${courseId}:`, error);
            // Non-critical error - don't throw, just log
        }
    }

    /**
     * Batch evaluate matching courses for a student
     * Returns categorized results with detailed explanations
     */
    async findMatches(userId, filters = {}) {
        if (!isValidUUID(userId)) {
            throw new Error('Invalid user ID format');
        }

        try {
            console.log(`\n[Matching] 🔍 Starting match scan for User: ${userId}`);
            
            // 1. Get student's results ONCE
            const studentResults = await this.getStudentResults(userId);
            
            if (studentResults.subjects.length === 0) {
                return {
                    eligible: [],
                    conditional: [],
                    ineligible: [],
                    missing_requirements: [],
                    total_evaluated: 0,
                    message: 'No results found. Please upload your matric results first.'
                };
            }

            // Calculate rough APS for initial filtering (with penalty assumption)
            const tempCalc = this.calculatePreliminaryAPS(
                studentResults, 
                { aps_calculation_rules: {}, math_lit_aps_penalty: 2 }
            );
            
            // 2. Build parameterized query with expanded range
            const params = [tempCalc.final_aps + 8]; // Wide buffer for penalties/bonuses
            const conditions = [
                'c.active = TRUE',
                '(cr.base_min_aps <= $1 OR (cr.base_min_aps + COALESCE(cr.math_lit_aps_penalty, 0)) <= $1)'
            ];
            
            let paramIndex = 2;
            
            if (filters.faculty) {
                // Validate faculty against whitelist to prevent injection
                const validFaculties = [
                    'Science', 'Engineering and Built Environment', 'Humanities',
                    'Economics and Finance', 'Information and Communication Technology',
                    'Management Sciences', 'Arts', 'Health Sciences', 'Law'
                ];
                if (validFaculties.includes(filters.faculty)) {
                    conditions.push(`c.faculty = $${paramIndex}`);
                    params.push(filters.faculty);
                    paramIndex++;
                }
            }
            
            if (filters.university_id && isValidUUID(filters.university_id)) {
                conditions.push(`c.university_id = $${paramIndex}`);
                params.push(filters.university_id);
                paramIndex++;
            }
            
            const limit = Math.min(parseInt(filters.limit) || 50, 200);
            const offset = parseInt(filters.offset) || 0; 
            
            const queryStr = `
                SELECT
                    c.id,
                    c.name,
                    c.faculty,
                    u.name as university_name,
                    u.acronym as university_acronym,
                    cr.base_min_aps,
                    cr.math_lit_aps_penalty,
                    cr.subject_requirements,
                    cr.aps_calculation_rules,
                    cr.accepts_technical_math,
                    cr.technical_math_faculties,
                    cr.requires_first_language_level,
                    cr.requires_additional_language_level
                FROM courses c
                JOIN universities u ON c.university_id = u.id
                JOIN course_requirements cr ON c.id = cr.course_id
                WHERE ${conditions.join(' AND ')}
                ORDER BY cr.base_min_aps ASC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
            
            params.push(limit, offset);
            
            const potentialMatches = await query(queryStr, params);
            console.log(`[Matching] Found ${potentialMatches.rows.length} potential courses (Offset: ${offset})`);
            
            if (potentialMatches.rows.length === 0) {
                return {
                    eligible: [],
                    conditional: [],
                    ineligible: [],
                    missing_requirements: [],
                    total_evaluated: 0,
                    hasMore: false
                };
            }
            
            // 3. Evaluate all courses with FULL validation
            const categorized = {
                eligible: [],
                conditional: [],
                ineligible: [],
                missing_requirements: [],
                specific_reasons: {
                    missing_math: [],
                    insufficient_aps: [],
                    wrong_faculty_for_tech_math: [],
                    missing_languages: []
                }
            };
            
            const evaluations = await Promise.all(
                potentialMatches.rows.map(course => 
                    this.evaluateCourseRuleBased(userId, course.id, {
                        id: course.id,
                        name: course.name,
                        faculty: course.faculty,
                        university_name: course.university_name,
                        university_acronym: course.university_acronym,
                        base_min_aps: course.base_min_aps,
                        math_lit_aps_penalty: course.math_lit_aps_penalty,
                        subject_requirements: course.subject_requirements,
                        aps_calculation_rules: course.aps_calculation_rules,
                        accepts_technical_math: course.accepts_technical_math,
                        technical_math_faculties: course.technical_math_faculties,
                        requires_first_language_level: course.requires_first_language_level,
                        requires_additional_language_level: course.requires_additional_language_level
                    }).then(evaluation => ({
                        ...evaluation,
                        course_id: course.id,
                        course_name: course.name,
                        faculty: course.faculty,
                        university_name: course.university_name,
                        university_acronym: course.university_acronym
                    })).catch(err => {
                        console.error(`Failed to evaluate course ${course.id}:`, err.message);
                        return null;
                    })
                )
            );

            // 4. Categorize with detailed reasoning
            evaluations.forEach(evaluation => {
                if (!evaluation) return;
                
                const meta = evaluation._meta || {};
                const mathClass = meta.math_classification || {};
                
                if (evaluation.eligibility_status === 'ELIGIBLE') {
                    categorized.eligible.push(evaluation);
                } else if (evaluation.eligibility_status === 'CONDITIONAL') {
                    categorized.conditional.push(evaluation);
                } else if (evaluation.eligibility_status === 'MISSING_REQUIREMENTS') {
                    categorized.missing_requirements.push(evaluation);
                    
                    // Detailed categorization for UI
                    const missing = evaluation.missing_requirements || [];
                    
                    if (missing.some(m => m.includes('Mathematics'))) {
                        if (mathClass.hasMathLit && !mathClass.hasCoreMath) {
                            categorized.specific_reasons.missing_math.push({
                                ...evaluation,
                                specific_reason: 'Has Mathematical Literacy, requires core Mathematics'
                            });
                        } else if (mathClass.hasTechMath) {
                            categorized.specific_reasons.wrong_faculty_for_tech_math.push({
                                ...evaluation,
                                specific_reason: `Technical Mathematics not accepted for ${evaluation.faculty}`
                            });
                        } else {
                            categorized.specific_reasons.missing_math.push({
                                ...evaluation,
                                specific_reason: 'No Mathematics subject found'
                            });
                        }
                    }
                    
                    if (missing.some(m => m.includes('Language'))) {
                        categorized.specific_reasons.missing_languages.push(evaluation);
                    }
                } else {
                    categorized.ineligible.push(evaluation);
                    if (evaluation.calculated_aps?.final_aps < evaluation.calculated_aps?.required_aps) {
                        categorized.specific_reasons.insufficient_aps.push(evaluation);
                    }
                }
            });
            
            // Sort by confidence
            const sortByConfidence = (a, b) => (b.confidence_score || 0) - (a.confidence_score || 0);
            categorized.eligible.sort(sortByConfidence);
            categorized.conditional.sort(sortByConfidence);
            
            // 5. Check if there are more courses
            const hasMore = evaluations.length === limit;
            
            console.log(`[Matching] ✅ Complete: ${categorized.eligible.length} eligible, ${categorized.conditional.length} conditional, ${categorized.missing_requirements.length} missing requirements`);
            
            return {
                matches: [...categorized.eligible, ...categorized.conditional],
                categorized,
                count: categorized.eligible.length + categorized.conditional.length,
                total_evaluated: evaluations.filter(e => e !== null).length,
                hasMore,
                filters: { faculty: filters.faculty, university: filters.university_id },
                nextOffset: hasMore ? offset + limit : null,
                student_summary: {
                    aps_range: `${tempCalc.final_aps - 2} - ${tempCalc.final_aps + 2}`,
                    has_core_math: tempCalc.has_mathematics,
                    has_math_lit: tempCalc.has_math_literacy,
                    has_tech_math: tempCalc.has_technical_math,
                    best_six_subjects: tempCalc.subjects.map(s => s.subject)
                }
            };

        } catch (error) {
            console.error(`Error finding matches for user ${userId}:`, error);
            throw new Error('Failed to generate recommendations');
        }
    }

    /**
     * Get cached recommendations for user dashboard
     */
    async getCachedRecommendations(userId) {
        if (!isValidUUID(userId)) {
            throw new Error('Invalid user ID format');
        }

        try {
            const result = await query(`
                SELECT 
                    r.id,
                    r.course_id,
                    r.eligibility_status,
                    r.confidence_score,
                    r.aps_breakdown,
                    r.narrative_reason,
                    r.generated_at,
                    r.viewed_by_user,
                    c.name as course_name,
                    c.faculty,
                    c.duration_years,
                    c.nqf_level,
                    u.name as university_name,
                    u.acronym as university_acronym
                FROM recommendations r
                JOIN courses c ON r.course_id = c.id
                JOIN universities u ON c.university_id = u.id
                WHERE r.user_id = $1
                AND r.expires_at > CURRENT_TIMESTAMP
                AND c.active = TRUE
                ORDER BY 
                    CASE r.eligibility_status 
                        WHEN 'ELIGIBLE' THEN 1 
                        WHEN 'CONDITIONAL' THEN 2 
                        ELSE 3 
                    END,
                    r.confidence_score DESC,
                    r.generated_at DESC
            `, [userId]);
            
            return result.rows;
        } catch (error) {
            console.error(`Error fetching cached recommendations for ${userId}:`, error);
            throw new Error('Failed to retrieve recommendations');
        }
    }

    /**
     * Mark recommendation as viewed by user
     */
    async markAsViewed(userId, courseId) {
        if (!isValidUUID(userId) || !isValidUUID(courseId)) {
            return false;
        }

        try {
            await query(`
                UPDATE recommendations 
                SET viewed_by_user = TRUE 
                WHERE user_id = $1 AND course_id = $2
            `, [userId, courseId]);
            return true;
        } catch (error) {
            console.error(`Error marking recommendation as viewed:`, error);
            return false;
        }
    }
}

module.exports = new AdmissionService();