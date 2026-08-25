const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

class CloudinaryService {
    async uploadFile(buffer, options = {}) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Cloudinary upload timed out after 30s'));
            }, 100000);

            const uploadStream = cloudinary.uploader.upload_stream(
                options,
                (error, result) => {
                    clearTimeout(timeout);
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        reject(error);
                    }
                    else resolve(result);
                }
            );

            const stream = require('stream');
            const readable = new stream.PassThrough();
            readable.end(buffer);
            readable.pipe(uploadStream);
            
            // Handle stream errors
            readable.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }


    async deleteFile(publicId) {
        return await cloudinary.uploader.destroy(publicId);
    }
}

module.exports = new CloudinaryService();