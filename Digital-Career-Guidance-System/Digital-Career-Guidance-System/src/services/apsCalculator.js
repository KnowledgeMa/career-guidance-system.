class APSCalculator {
    static LEVEL_POINTS = {
        7: 7, // 80-100%
        6: 6, // 70-79%
        5: 5, // 60-69%
        4: 4, // 50-59%
        3: 3, // 40-49%
        2: 2, // 30-39%
        1: 1  // 0-29%
    };

    static COMPULSORY_SUBJECTS = [
        'Home Language',
        'First Additional Language',
        'Mathematics'
    ];

    // Robust LO detection for OCR garbage (e.g. "Life Orentation", "L.O", "LO")
    static LO_PATTERNS = [
        'life orientation',
        'life orentation',
        'life orientaion',
        'life orienation',
        'orientation'
    ];

    /**
     * Convert percentage to NSC achievement level
     */
    calculateLevel(mark) {
        if (mark >= 80) return 7;
        if (mark >= 70) return 6;
        if (mark >= 60) return 5;
        if (mark >= 50) return 4;
        if (mark >= 40) return 3;
        if (mark >= 30) return 2;
        return 1;
    }

    /**
     * Safe instance getter for points (fixes static access bug in controller)
     */
    getPointsForLevel(level) {
        return APSCalculator.LEVEL_POINTS[level] || 0;
    }

    /**
     * Detect Life Orientation despite OCR typos
     */
    isLifeOrientation(name) {
        if (!name || typeof name !== 'string') return false;
        const normalized = name.toLowerCase().trim();

        // Whole-word exact matches
        if (['lo', 'l.o', 'l.o.'].includes(normalized)) return true;

        // Substring matches
        return APSCalculator.LO_PATTERNS.some(p => normalized.includes(p));
    }

    /**
     * Main APS calculation
     * - total_aps: sum of ALL subjects (including LO)
     * - best_six_aps: sum of top 6 subjects AFTER removing LO
     */
    calculateAPS(subjects) {
        if (!Array.isArray(subjects) || subjects.length === 0) {
            return {
                total_aps: 0,
                best_six_aps: 0,
                subject_count: 0,
                subjects: [],
                best_six_subjects: [],
                university_admission_aps: 0,
                life_orientation: null,
                warnings: ['No subjects provided']
            };
        }

        const subjectBreakdown = [];
        let loSubject = null;
        const warnings = [];
        let totalAPS = 0;

        for (const subject of subjects) {
            if (!subject || typeof subject !== 'object') {
                warnings.push(`Invalid subject entry at index ${subjectBreakdown.length}`);
                continue;
            }

            const subjectName = (subject.subject || 'Unknown Subject').trim();
            let mark = typeof subject.mark === 'number' ? subject.mark : 0;

            // Derive level from mark if missing or garbage
            let level = typeof subject.level === 'number' ? subject.level : null;
            if (level === null || level < 1 || level > 7) {
                level = this.calculateLevel(mark);
            }

            const points = this.getPointsForLevel(level);
            totalAPS += points;

            const entry = {
                subject: subjectName,
                mark: Math.round(mark),
                level,
                aps_points: points
            };

            subjectBreakdown.push(entry);

            if (this.isLifeOrientation(subjectName)) {
                loSubject = entry;
            }
        }

        // Best 6: exclude LO, sort descending, take top 6
        const nonLoSubjects = subjectBreakdown.filter(s => !this.isLifeOrientation(s.subject));
        const bestSix = [...nonLoSubjects]
            .sort((a, b) => b.aps_points - a.aps_points)
            .slice(0, 6);

        const bestSixAPS = bestSix.reduce((sum, s) => sum + s.aps_points, 0);

        // Edge-case warnings
        if (!loSubject) {
            warnings.push('Life Orientation not detected in subject list.');
        }
        if (nonLoSubjects.length < 6) {
            warnings.push(`Only ${nonLoSubjects.length} non-LO subjects found. Best-6 uses all available.`);
        }

        return {
            total_aps: totalAPS,                 // all subjects including LO
            best_six_aps: bestSixAPS,            // university admission score
            subject_count: subjectBreakdown.length,
            subjects: subjectBreakdown,
            best_six_subjects: bestSix,
            university_admission_aps: bestSixAPS,
            life_orientation: loSubject,
            warnings
        };
    }

    validateForUniversity(subjects, requirements = {}) {
        const issues = [];
        const safeSubjects = Array.isArray(subjects) ? subjects : [];

        const hasMath = safeSubjects.some(s => 
            s?.subject?.includes('Mathematics') && !s.subject.includes('Literacy')
        );
        const hasMathLit = safeSubjects.some(s => 
            s?.subject?.includes('Mathematical Literacy')
        );

        if (!hasMath && requirements.require_math) {
            if (!hasMathLit || !requirements.accept_math_lit) {
                issues.push('Mathematics required for this course');
            }
        }

        if (requirements.required_subjects) {
            for (const req of requirements.required_subjects) {
                const hasSubject = safeSubjects.some(s => 
                    s?.subject?.toLowerCase().includes(req.subject.toLowerCase()) &&
                    s.level >= req.min_level
                );
                if (!hasSubject) {
                    issues.push(`${req.subject} (Level ${req.min_level}+) required`);
                }
            }
        }

        return { eligible: issues.length === 0, issues };
    }
}

module.exports = new APSCalculator();