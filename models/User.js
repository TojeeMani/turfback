const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[0-9+\-\s()]+$/, 'Please enter a valid phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  
  // User Type and Role
  userType: {
    type: String,
    required: [true, 'User type is required'],
    enum: ['player', 'owner', 'admin'],
    default: 'player'
  },
  
  // Authentication
  isEmailVerified: {
    type: Boolean,
    default: false // Will be set to true after OTP verification
  },
  isOtpVerified: {
    type: Boolean,
    default: false
  },
  
  // Admin Approval for Owners
  isApprovedByAdmin: {
    type: Boolean,
    default: function() {
      return this.userType !== 'owner'; // Only owners need admin approval
    }
  },
  adminApprovalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: function() {
      return this.userType === 'owner' ? 'pending' : 'approved';
    }
  },
  adminApprovalDate: Date,
  adminApprovalNotes: String,
  
  // Google OAuth
  googleId: {
    type: String,
    sparse: true
  },
  isGoogleUser: {
    type: Boolean,
    default: false
  },
  
  // Firebase Authentication
  firebaseUid: {
    type: String,
    sparse: true,
    unique: true
  },
  
  // Profile Information
  avatar: {
    type: String,
    default: ''
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say']
  },
  
  // Player Specific Fields
  preferredSports: [{
    type: String,
    enum: ['Football', 'Cricket', 'Basketball', 'Tennis', 'Badminton', 'Volleyball']
  }],
  skillLevel: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced', 'Professional'],
    required: false
  },
  location: {
    type: String,
    trim: true
  },
  
  // Turf Owner Specific Fields
  businessName: {
    type: String,
    trim: true,
    maxlength: [100, 'Business name cannot exceed 100 characters']
  },
  businessAddress: {
    type: String,
    trim: true
  },
  businessPhone: {
    type: String,
    match: [/^[0-9+\-\s()]+$/, 'Please enter a valid business phone number']
  },
  turfCount: {
    type: String,
    enum: ['1', '2-5', '6-10', '10+'],
    required: function() {
      return this.userType === 'owner';
    }
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  
  // Preferences
  agreeToTerms: {
    type: Boolean,
    required: [true, 'You must agree to terms and conditions']
  },
  agreeToMarketing: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  lastLogin: {
    type: Date
  },

  // Password Reset Fields
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpire: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ userType: 1 });

// Encrypt password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT token
userSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      userType: this.userType,
      email: this.email
    },
    process.env.JWT_SECRET || 'your_super_secret_jwt_key_here_make_it_long_and_secure_123456789',
    {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    }
  );
};

// Generate email verification token
userSchema.methods.getEmailVerificationToken = function() {
  // Generate token
  const verificationToken = crypto.randomBytes(20).toString('hex');
  
  // Hash token and set to emailVerificationToken field
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  // Set expire
  this.emailVerificationExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return verificationToken;
};



// Generate password reset token
userSchema.methods.getResetPasswordToken = function() {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes

  return resetToken;
};

module.exports = mongoose.model('User', userSchema); 