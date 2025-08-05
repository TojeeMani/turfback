const User = require('../models/User');
const crypto = require('crypto');
const admin = require('../config/firebase');
const { validationResult } = require('express-validator');
const { sendOTPEmail, sendResendOTPEmail, sendEmail } = require('../utils/emailService');

// In-memory OTP storage (temporary, will be cleared on server restart)
const otpStorage = new Map(); // userId -> { otp, email, firstName, userType, expiresAt }

// @desc    Register user (Step 1: Create user and send OTP)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      userType,
      preferredSports,
      skillLevel,
      location,
      businessName,
      businessAddress,
      businessPhone,
      turfCount,
      agreeToTerms,
      agreeToMarketing
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ Backend: User already exists:', email);
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Prepare user data based on user type
    const userData = {
      firstName,
      lastName,
      email,
      phone,
      password,
      userType,
      agreeToTerms,
      agreeToMarketing,
      isEmailVerified: false, // Will be set to true after OTP verification
      isOtpVerified: false
    };

    // Add player-specific fields
    if (userType === 'player') {
      userData.preferredSports = preferredSports || [];
      userData.skillLevel = skillLevel;
      userData.location = location;
    }

    // Add owner-specific fields
    if (userType === 'owner') {
      userData.businessName = businessName;
      userData.businessAddress = businessAddress;
      userData.businessPhone = businessPhone;
      userData.turfCount = turfCount;
      userData.isApprovedByAdmin = false;
      userData.adminApprovalStatus = 'pending';
    }

    // Create user
    const user = await User.create(userData);

    // Generate OTP (6 digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in memory with expiration (10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const userIdString = user._id.toString();

    otpStorage.set(userIdString, {
      otp,
      email,
      firstName,
      userType,
      expiresAt
    });



    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp, firstName);
    
    if (!emailResult.success) {
      // If email fails, delete the user and return error
      await User.findByIdAndDelete(user._id);
      otpStorage.delete(user._id.toString()); // Clean up OTP storage
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again.'
      });
    }

    const responseData = {
      success: true,
      message: 'Registration successful! Please check your email for verification OTP.',
      userType: user.userType,
      userId: user._id,
      email: user.email,
      requiresOtpVerification: true
    };

    res.status(201).json(responseData);
  } catch (error) {
    console.log('❌ Backend: Registration error:', error);
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    // Validate input
    if (!email && !username) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email or username',
        type: 'VALIDATION_ERROR'
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide password',
        type: 'VALIDATION_ERROR'
      });
    }

    // Find user by email or username
    const query = email
      ? { email: email.toLowerCase() }
      : { username: username.toLowerCase() };

    // Check for user
    const user = await User.findOne(query).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials and try again.',
        type: 'INVALID_CREDENTIALS'
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials and try again.',
        type: 'INVALID_CREDENTIALS'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return res.status(401).json({
        success: false,
        message: 'Account is blocked'
      });
    }

    // Check admin approval for owners
    if (user.userType === 'owner') {
      if (user.adminApprovalStatus === 'rejected') {
        return res.status(401).json({
          success: false,
          message: 'Your account has been rejected by the admin. Please contact support for more information.',
          type: 'ACCOUNT_REJECTED'
        });
      }

      if (user.adminApprovalStatus === 'pending' || !user.isApprovedByAdmin) {
        return res.status(401).json({
          success: false,
          message: 'Your account is pending admin approval. You will be notified once approved.',
          type: 'PENDING_APPROVAL'
        });
      }
    }

    // Generate token
    const token = user.getSignedJwtToken();

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        isApprovedByAdmin: user.isApprovedByAdmin,
        adminApprovalStatus: user.adminApprovalStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Firebase Authentication (Players Only)
// @route   POST /api/auth/firebase
// @access  Public
exports.firebaseAuth = async (req, res, next) => {
  try {
    const { firebaseToken } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({
        success: false,
        message: 'Firebase token is required'
      });
    }

    console.log('🔧 Backend: Firebase authentication request received');
    console.log('🔧 Backend: Firebase token received:', firebaseToken.substring(0, 50) + '...');

    // Verify Firebase token
    let decodedToken;
    try {
      console.log('🔧 Backend: Starting token verification...');
      decodedToken = await admin.auth().verifyIdToken(firebaseToken);
      console.log('🔧 Backend: Firebase token verified successfully');
      console.log('🔧 Backend: Decoded token data:', {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture
      });
    } catch (verifyError) {
      console.error('❌ Backend: Firebase token verification failed:', verifyError);
      console.error('❌ Backend: Error details:', verifyError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid Firebase token: ' + verifyError.message
      });
    }

    const { uid, email, name, picture } = decodedToken;
    const [firstName, ...lastNameParts] = (name || '').split(' ');
    const lastName = lastNameParts.join(' ');

    // Check if user already exists in database
    let user = await User.findOne({ 
      $or: [
        { email: email },
        { firebaseUid: uid }
      ]
    });

    if (user) {
      console.log('🔧 Backend: Existing user found:', user.email);
      
      // Update Firebase UID if not set
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
        await user.save();
      }

      // Update profile picture if available and not set
      if (picture && !user.avatar) {
        user.avatar = picture;
        await user.save();
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Check if user is blocked
      if (user.isBlocked) {
        return res.status(401).json({
          success: false,
          message: 'Account is blocked'
        });
      }

      // Check admin approval for owners
      if (user.userType === 'owner') {
        if (user.adminApprovalStatus === 'rejected') {
          return res.status(401).json({
            success: false,
            message: 'Your account has been rejected by the admin. Please contact support for more information.',
            type: 'ACCOUNT_REJECTED'
          });
        }

        if (user.adminApprovalStatus === 'pending' || !user.isApprovedByAdmin) {
          return res.status(401).json({
            success: false,
            message: 'Your account is pending admin approval. You will be notified once approved.',
            type: 'PENDING_APPROVAL'
          });
        }
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = user.getSignedJwtToken();

      res.status(200).json({
        success: true,
        message: 'Firebase authentication successful',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          isEmailVerified: user.isEmailVerified,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          avatar: user.avatar,
          phone: user.phone,
          preferredSports: user.preferredSports,
          skillLevel: user.skillLevel,
          location: user.location,
          needsProfileCompletion: !user.phone || user.phone === '0000000000' || !user.preferredSports || user.preferredSports.length === 0
        }
      });
    } else {
      console.log('🔧 Backend: Creating new user from Firebase');
      
      // Create new user (always as player for Firebase users)
      const userData = {
        firstName: firstName || '',
        lastName: lastName || '',
        email: email,
        phone: '0000000000', // Default phone for Firebase users - they'll need to update this
        firebaseUid: uid,
        password: crypto.randomBytes(32).toString('hex'), // Random password for Firebase users
        userType: 'player', // Always create as player
        isEmailVerified: true, // Firebase emails are verified
        agreeToTerms: true,
        isActive: true,
        avatar: picture || '',
        preferredSports: [], // Empty array - user needs to fill this
        location: '' // User needs to fill this
      };

      console.log('🔧 Backend: Creating user with data:', userData);
      user = await User.create(userData);
      console.log('🔧 Backend: New user created successfully:', {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        firebaseUid: user.firebaseUid
      });

      // Generate JWT token
      const token = user.getSignedJwtToken();

      res.status(201).json({
        success: true,
        message: 'Firebase authentication successful - new user created. Please complete your profile.',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          isEmailVerified: user.isEmailVerified,
          isApprovedByAdmin: user.isApprovedByAdmin,
          adminApprovalStatus: user.adminApprovalStatus,
          avatar: user.avatar,
          phone: user.phone,
          preferredSports: user.preferredSports,
          skillLevel: user.skillLevel,
          location: user.location,
          needsProfileCompletion: true
        }
      });
    }
  } catch (error) {
    console.error('❌ Backend: Firebase auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Firebase authentication failed'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      preferredSports,
      skillLevel,
      location,
      avatar
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (preferredSports) user.preferredSports = preferredSports;
    if (skillLevel) user.skillLevel = skillLevel;
    if (location) user.location = location;
    if (avatar) user.avatar = avatar;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        isApprovedByAdmin: user.isApprovedByAdmin,
        adminApprovalStatus: user.adminApprovalStatus,
        avatar: user.avatar,
        phone: user.phone,
        preferredSports: user.preferredSports,
        skillLevel: user.skillLevel,
        location: user.location,
        needsProfileCompletion: !user.phone || user.phone === '0000000000' || !user.preferredSports || user.preferredSports.length === 0
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'There is no user with that email'
      });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();

    try {
      await user.save({ validateBeforeSave: false });
    } catch (saveError) {
      console.error('Failed to save user with reset token:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate reset token. Please try again.'
      });
    }

    // Create reset url
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send email with reset link
    try {
      await sendEmail({
        email: user.email,
        subject: 'TurfEase - Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">TurfEase</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Sports Turf Booking Platform</p>
            </div>

            <div style="padding: 40px 30px; background: #ffffff;">
              <h2 style="color: #1f2937; margin: 0 0 20px 0;">Password Reset Request</h2>

              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                Hello ${user.firstName},
              </p>

              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                We received a request to reset your password for your TurfEase account. If you didn't make this request, you can safely ignore this email.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}"
                   style="background: #22c55e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Reset Your Password
                </a>
              </div>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                This link will expire in 10 minutes for security reasons. If you need to reset your password after this time, please request a new reset link.
              </p>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 10px 0 0 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <span style="word-break: break-all;">${resetUrl}</span>
              </p>
            </div>

            <div style="background: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                © 2024 TurfEase. All rights reserved.
              </p>
            </div>
          </div>
        `
      });

      res.status(200).json({
        success: true,
        message: 'Password reset email sent successfully'
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);

      // Clear the reset token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent. Please try again later.'
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Email verification is not required in this version'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      // Check if token exists but expired
      const expiredUser = await User.findOne({ resetPasswordToken });
      if (expiredUser) {
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired. Please request a new password reset.'
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Generate token
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      token
    });
  } catch (error) {
    next(error);
  }
}; 

// @desc    Verify OTP (Step 2: Verify OTP and complete registration)
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res, next) => {
  try {
    console.log('🔧 Backend: OTP verification request received:', req.body);
    
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: 'User ID and OTP are required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP is already verified
    if (user.isOtpVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Get stored OTP data
    console.log('🔧 Backend: Looking for OTP with userId:', userId);
    console.log('🔧 Backend: OTP storage keys:', Array.from(otpStorage.keys()));
    console.log('🔧 Backend: OTP storage contents:', Array.from(otpStorage.entries()));

    const storedOtpData = otpStorage.get(userId);
    if (!storedOtpData) {
      console.log('❌ Backend: OTP not found for userId:', userId);
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired. Please request a new OTP.'
      });
    }

    console.log('🔧 Backend: Found OTP data:', storedOtpData);

    // Check if OTP is expired
    if (new Date() > storedOtpData.expiresAt) {
      otpStorage.delete(userId); // Clean up expired OTP
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.'
      });
    }

    // Verify OTP
    console.log('🔧 Backend: Comparing OTPs - Stored:', storedOtpData.otp, 'Received:', otp);
    console.log('🔧 Backend: OTP types - Stored:', typeof storedOtpData.otp, 'Received:', typeof otp);

    if (storedOtpData.otp !== otp) {
      console.log('❌ Backend: OTP mismatch');
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    console.log('✅ Backend: OTP match successful');

    // Mark user as verified
    user.isOtpVerified = true;
    user.isEmailVerified = true;
    await user.save();

    // Clean up OTP storage
    otpStorage.delete(userId);

    console.log('🔧 Backend: OTP verified successfully');

    const responseData = {
      success: true,
      message: user.userType === 'owner' 
        ? 'Email verified successfully! Your account is pending admin approval. You will be notified once approved.'
        : 'Email verified successfully! You can now login to your account.',
      userType: user.userType,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        isEmailVerified: user.isEmailVerified,
        isApprovedByAdmin: user.isApprovedByAdmin,
        adminApprovalStatus: user.adminApprovalStatus
      }
    };

    console.log('🔧 Backend: Sending OTP verification response:', responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.log('❌ Backend: OTP verification error:', error);
    next(error);
  }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
// @access  Public
exports.resendOTP = async (req, res, next) => {
  try {
    console.log('🔧 Backend: Resend OTP request received:', req.body);
    
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP is already verified
    if (user.isOtpVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new OTP (6 digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store new OTP in memory with expiration (10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    otpStorage.set(userId, {
      otp,
      email: user.email,
      firstName: user.firstName,
      userType: user.userType,
      expiresAt
    });

    console.log('🔧 Backend: New OTP generated');

    // Send new OTP email
    const emailResult = await sendResendOTPEmail(user.email, otp, user.firstName);
    
    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send new OTP. Please try again.'
      });
    }

    const responseData = {
      success: true,
      message: 'New OTP sent to your email successfully.',
      userId: user._id,
      email: user.email
    };

    console.log('🔧 Backend: Sending resend OTP response:', responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.log('❌ Backend: Resend OTP error:', error);
    next(error);
  }
}; 