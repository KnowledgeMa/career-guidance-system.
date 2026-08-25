const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class GeminiService {
    async extractTextFromImage(base64Image, mimeType = 'image/jpeg') {
        try {
            const model = genAI.getGenerativeModel({ 
                model: 'gemini-2.5-flash-lite',
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 4096
                }
            });

            const prompt = `
    Extract all subject names and marks from this South African matric report card.
    IMPORTANT: Extract marks from the "Learner" column (the percentage % column), NOT the "Grade" column.

    Return the data in this exact JSON format:
    {
    "subjects": [
        {"subject": "English Home Language", "mark": 75, "level": 6},
        {"subject": "Mathematics", "mark": 82, "level": 7}
    ],
    "year": 2024,
    "exam_type": "NSC"
    }

    CRITICAL RULES:
    - Subject names must match official NSC subject names
    - Marks are the PERCENTAGE values from the LEARNER column (not the Grade column)
    - The Learner column shows Level (1-7) and % (0-100) - extract the % value
    - Ignore any values in columns labeled "Grade" - these are not the learner's marks
    - Include all subjects shown
    - If a mark has a level (1-7), include it as "level": 6
    `;

            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        mimeType,
                        data: base64Image
                    }
                }
            ]);

            const response = result.response.text();

            // Reject empty or gibberish responses
            if (!response || response.trim().length < 20) {
                console.warn('Gemini returned empty or too-short response:', response?.slice(0, 100));
                return {
                    success: false,
                    rawText: response || '',
                    error: 'Gemini returned insufficient content (likely unreadable image)'
                };
            }

            return {
                success: true,
                rawText: response,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Gemini OCR Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async extractTextFromPDF(pdfBase64) {
        // Gemini can process PDFs directly
        return this.extractTextFromImage(pdfBase64, 'application/pdf');
    }
}

module.exports = new GeminiService();