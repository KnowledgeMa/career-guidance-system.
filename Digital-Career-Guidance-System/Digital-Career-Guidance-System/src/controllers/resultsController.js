const { query } = require('../config/database');
const geminiService = require('../services/geminiService');
const groqService = require('../services/groqService');
const apsCalculator = require('../services/apsCalculator');
const cloudinary = require('../services/cloudinaryService');
// const { APSCalculator } = require('../services/apsCalculator');

class ResultsController {
    // POST /api/results/upload
    async upload(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const userId = req.user.id;
            const file = req.file;

            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
            if (!allowedTypes.includes(file.mimetype)) {
                return res.status(400).json({ error: 'Invalid file type. Use JPG, PNG, or PDF' });
            }

            // Upload to Cloudinary
            const cloudinaryResult = await cloudinary.uploadFile(file.buffer, {
                folder: 'dcgs/results',
                public_id: `${userId}_${Date.now()}`,
                resource_type: file.mimetype === 'application/pdf' ? 'raw' : 'image'
            });

            // Create upload record
            const uploadRecord = await query(`
                INSERT INTO result_uploads 
                (user_id, filename, original_name, cloudinary_url, cloudinary_public_id, ocr_status)
                VALUES ($1, $2, $3, $4, $5, 'processing')
                RETURNING id
            `, [userId, file.filename, file.originalname, cloudinaryResult.secure_url, cloudinaryResult.public_id]);

            // Start async OCR processing
            this.processOCR(uploadRecord.rows[0].id, cloudinaryResult.secure_url, file.mimetype);

            res.status(202).json({
                message: 'File uploaded successfully. Processing...',
                uploadId: uploadRecord.rows[0].id,
                status: 'processing',
                url: cloudinaryResult.secure_url
            });

        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Upload failed' });
        }
    }

    // Async OCR processing
    async processOCR(uploadId, imageUrl, mimeType) {
        try {
            // Download image and convert to base64
            const imageBuffer = await this.downloadImage(imageUrl);
            const base64 = imageBuffer.toString('base64');

            // Step 1: Gemini OCR
            const geminiResult = await geminiService.extractTextFromImage(
                base64, 
                mimeType
            );

            if (!geminiResult.success) {
                const errMsg = `Gemini OCR failed: ${geminiResult.error}`;
                await this.failUpload(uploadId, errMsg);
                throw new Error(errMsg);
            }

            // Validate Gemini output quality before proceeding
            if (geminiResult.rawText.trim().length < 20) {
                const errMsg = 'Gemini returned too little text — report card may be unreadable';
                await this.failUpload(uploadId, errMsg);
                throw new Error(errMsg);
            }

            // Update with raw OCR
            await query(`
                UPDATE result_uploads 
                SET ocr_raw_text = $1, gemini_response = $2
                WHERE id = $3
            `, [geminiResult.rawText, JSON.stringify(geminiResult), uploadId]);

            // Step 2: Groq parsing
            const groqResult = await groqService.parseResults(geminiResult.rawText);

            if (!groqResult.success) {
                const errMsg = `Groq parsing failed: ${groqResult.error}`;
                await this.failUpload(uploadId, errMsg);
                throw new Error(errMsg);
            }

            // Final sanity check: require minimum subjects before marking complete
            if (!groqResult.data.subjects || groqResult.data.subjects.length < 5) {
                const errMsg = `Insufficient subjects: only ${groqResult.data.subjects?.length || 0} found`;
                await this.failUpload(uploadId, errMsg);
                throw new Error(errMsg);
            }

            // Calculate APS
            const apsResult = apsCalculator.calculateAPS(groqResult.data.subjects);

            // Update upload record
            await query(`
                UPDATE result_uploads 
                SET groq_parsed = $1, 
                    aps_score = $2,
                    ocr_status = 'completed',
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [JSON.stringify(groqResult.data), apsResult.best_six_aps, uploadId]);

            console.log(`OCR completed for upload ${uploadId}. APS: ${apsResult.best_six_aps}`);

        } catch (error) {
            console.error('OCR Processing error:', error);
            await this.failUpload(uploadId, error.message);
        }
    }

    // Helper to mark upload as failed and store error detail
    async failUpload(uploadId, errorMessage) {
        try {
            await query(`
                UPDATE result_uploads
                SET ocr_status = 'failed',
                    ocr_error = $2
                WHERE id = $1
            `, [uploadId, errorMessage]);
        } catch (err) {
            console.error('failUpload error:', err);
        }
    }

    async downloadImage(url) {
        const https = require('https');
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Image download timed out after 20s')), 20000);
            https.get(url, (res) => {
                const data = [];
                res.on('data', chunk => data.push(chunk));
                res.on('end', () => {
                    clearTimeout(timeout);
                    resolve(Buffer.concat(data));
                });
            }).on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    // GET /api/results/status/:uploadId
    async getStatus(req, res) {
        try {
            const { uploadId } = req.params;
            const userId = req.user.id;

            const result = await query(`
                SELECT id, ocr_status, aps_score, groq_parsed, ocr_error,
                    processed_at, created_at
                FROM result_uploads
                WHERE id = $1 AND user_id = $2
            `, [uploadId, userId]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Upload not found' });
            }

            const upload = result.rows[0];
            
            // Parse groq_parsed if it's a string
            let parsedData = upload.groq_parsed;
            if (typeof parsedData === 'string') {
                try {
                    parsedData = JSON.parse(parsedData);
                } catch (e) {
                    parsedData = null;
                }
            }

            res.json({
                id: upload.id,
                status: upload.ocr_status,
                apsScore: upload.aps_score,
                subjects: parsedData?.subjects || null,
                error: upload.ocr_error,
                processedAt: upload.processed_at,
                createdAt: upload.created_at
            });

        } catch (error) {
            console.error('GetStatus error:', error);
            res.status(500).json({ error: 'Failed to get status' });
        }
    }

    // GET /api/results/latest
    async getLatest(req, res) {
        try {
            const userId = req.user.id;

            // Get latest processed results
            const uploadResult = await query(`
                SELECT groq_parsed, aps_score, processed_at
                FROM result_uploads
                WHERE user_id = $1 AND ocr_status = 'completed'
                ORDER BY processed_at DESC
                LIMIT 1
            `, [userId]);

            if (uploadResult.rows.length === 0) {
                return res.json({ hasResults: false });
            }

            // Get saved results from database
            const resultsResult = await query(`
                SELECT subject, mark, level, aps_points
                FROM results
                WHERE user_id = $1
                ORDER BY aps_points DESC
            `, [userId]);

            res.json({
                hasResults: true,
                apsScore: uploadResult.rows[0].aps_score,
                processedAt: uploadResult.rows[0].processed_at,
                subjects: resultsResult.rows,
                raw: uploadResult.rows[0].groq_parsed
            });

        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch results' });
        }
    }

    // POST /api/results/confirm
    async confirmResults(req, res) {
        try {
            const { subjects, uploadId } = req.body;
            const userId = req.user.id;

            // Validate subjects
            if (!Array.isArray(subjects) || subjects.length === 0) {
                return res.status(400).json({ error: 'No subjects provided' });
            }

            // Calculate APS
            const apsResult = apsCalculator.calculateAPS(subjects);

            // Clear old results
            await query('DELETE FROM results WHERE user_id = $1', [userId]);

            // Insert new results
            for (const subject of apsResult.subjects) {
                await query(`
                    INSERT INTO results (user_id, subject, mark, level, aps_points, year)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    userId,
                    subject.subject,
                    subject.mark,
                    subject.level,
                    subject.aps_points,
                    new Date().getFullYear()
                ]);
            }

            // Update profile completion
            await query(`
                UPDATE student_profiles 
                SET profile_completion = LEAST(profile_completion + 25, 100)
                WHERE user_id = $1
            `, [userId]);

            // Update upload status (only if valid upload ID)
            if (uploadId && uploadId !=='mock-upload-id') {
                try {
                    await query(`
                        UPDATE result_uploads 
                        SET ocr_status = 'confirmed'
                        WHERE id = $1
                    `, [uploadId]);
                } catch (uploadError) {
                    console.log('Note: Could not update upload status (may not exist):', uploadError.message);
                }
            }

            res.json({
                message: 'Results saved successfully',
                apsScore: apsResult.best_six_aps,
                subjects: apsResult.subjects
            });

        } catch (error) {
            console.error('Confirm results error:', error);
            res.status(500).json({ error: 'Failed to save results' });
        }
    }

    // PUT /api/results/:id
    async updateResult(req, res) {
        try {
            const { id } = req.params;
            const { mark } = req.body;
            const userId = req.user.id;

            // Verify ownership
            const check = await query(
                'SELECT id, subject FROM results WHERE id = $1 AND user_id = $2',
                [id, userId]
            );

            if (check.rows.length === 0) {
                return res.status(404).json({ error: 'Result not found' });
            }

            // Validate mark range
            const numericMark = Number(mark);
            if (isNaN(numericMark) || numericMark < 0 || numericMark > 100) {
                return res.status(400).json({ error: 'Mark must be between 0 and 100' });
            }

            // Calculate new level and APS using the fixed calculator
            const level = apsCalculator.calculateLevel(numericMark);
            const apsPoints = apsCalculator.getPointsForLevel(level);

            await query(`
                UPDATE results 
                SET mark = $1, level = $2, aps_points = $3, updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
            `, [numericMark, level, apsPoints, id]);

            res.json({
                message: 'Result updated',
                mark: numericMark,
                level,
                apsPoints
            });

        } catch (error) {
            console.error('Update result error:', error);
            res.status(500).json({ error: 'Update failed' });
        }
    }
}

module.exports = new ResultsController();