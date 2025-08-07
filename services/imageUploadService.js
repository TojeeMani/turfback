const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

class ImageUploadService {
  /**
   * Upload a single image to Cloudinary
   * @param {Buffer|string} imageData - Image buffer or base64 string
   * @param {string} folder - Cloudinary folder (e.g., 'turfs')
   * @param {string} publicId - Optional public ID for the image
   * @returns {Promise<Object>} Upload result with URL and public ID
   */
  async uploadImage(imageData, folder = 'turfs', publicId = null) {
    try {
      // In development mode, use mock response
      if (process.env.NODE_ENV === 'development') {
        console.log('📸 Development mode - Mock image upload');
        return {
          success: true,
          url: `https://picsum.photos/800/600?random=${Date.now()}`,
          publicId: publicId || `dev_${Date.now()}`,
          width: 800,
          height: 600,
          format: 'jpg',
          size: Math.floor(Math.random() * 100000) + 50000,
          folder: folder,
          devMode: true
        };
      }

      // ORIGINAL CODE (commented out for now):
      /*
      const uploadOptions = {
        folder: folder,
        resource_type: 'image',
        transformation: [
          { width: 800, height: 600, crop: 'limit' }, // Resize to reasonable size
          { quality: 'auto', fetch_format: 'auto' } // Optimize quality and format
        ]
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      let uploadResult;
      
      if (Buffer.isBuffer(imageData)) {
        // Convert buffer to stream for Cloudinary
        const stream = Readable.from(imageData);
        uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.pipe(uploadStream);
        });
      } else if (typeof imageData === 'string') {
        // Handle base64 or URL
        uploadResult = await cloudinary.uploader.upload(imageData, uploadOptions);
      } else {
        throw new Error('Invalid image data format');
      }

      return {
        success: true,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        size: uploadResult.bytes
      };
      */
    } catch (error) {
      console.error('❌ Image upload failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload image'
      };
    }
  }

  /**
   * Upload multiple images to Cloudinary
   * @param {Array} images - Array of image buffers or base64 strings
   * @param {string} folder - Cloudinary folder
   * @returns {Promise<Array>} Array of upload results
   */
  async uploadMultipleImages(images, folder = 'turfs') {
    try {
      const uploadPromises = images.map((image, index) => 
        this.uploadImage(image, folder, `turf_${Date.now()}_${index}`)
      );

      const results = await Promise.all(uploadPromises);
      
      // Filter successful uploads
      const successfulUploads = results.filter(result => result.success);
      const failedUploads = results.filter(result => !result.success);

      if (failedUploads.length > 0) {
        console.warn('⚠️ Some images failed to upload:', failedUploads);
      }

      return {
        success: successfulUploads.length > 0,
        images: successfulUploads,
        failed: failedUploads,
        totalUploaded: successfulUploads.length,
        totalFailed: failedUploads.length
      };
    } catch (error) {
      console.error('❌ Multiple image upload failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload images',
        images: [],
        failed: [],
        totalUploaded: 0,
        totalFailed: images.length
      };
    }
  }

  /**
   * Delete an image from Cloudinary
   * @param {string} publicId - Cloudinary public ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteImage(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return {
        success: true,
        message: 'Image deleted successfully'
      };
    } catch (error) {
      console.error('❌ Image deletion failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete image'
      };
    }
  }

  /**
   * Generate optimized URL for an image
   * @param {string} publicId - Cloudinary public ID
   * @param {Object} options - Transformation options
   * @returns {string} Optimized URL
   */
  generateOptimizedUrl(publicId, options = {}) {
    const defaultOptions = {
      fetch_format: 'auto',
      quality: 'auto',
      ...options
    };

    return cloudinary.url(publicId, defaultOptions);
  }

  /**
   * Generate thumbnail URL
   * @param {string} publicId - Cloudinary public ID
   * @param {number} width - Thumbnail width
   * @param {number} height - Thumbnail height
   * @returns {string} Thumbnail URL
   */
  generateThumbnailUrl(publicId, width = 300, height = 200) {
    return cloudinary.url(publicId, {
      width: width,
      height: height,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto'
    });
  }
}

module.exports = new ImageUploadService();
