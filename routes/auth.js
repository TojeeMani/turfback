const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  resendVerification,
  firebaseAuth,
  verifyOTP,
  resendOTP
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phone').matches(/^[0-9+\-\s()]+$/).withMessage('Please provide a valid phone number'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('userType').isIn(['player', 'owner']).withMessage('User type must be either player or owner'),
  body('agreeToTerms').equals('true').withMessage('You must agree to terms and conditions'),
  // Conditional validation based on user type
  body().custom((value, { req }) => {
    if (req.body.userType === 'player') {
      if (!value.preferredSports || value.preferredSports.length === 0) {
        throw new Error('Preferred sports are required for players');
      }
      if (!value.skillLevel) {
        throw new Error('Skill level is required for players');
      }
      if (!value.location) {
        throw new Error('Location is required for players');
      }
    }
    
    if (req.body.userType === 'owner') {
      if (!value.businessName) {
        throw new Error('Business name is required for turf owners');
      }
      if (!value.businessAddress) {
        throw new Error('Business address is required for turf owners');
      }
      if (!value.businessPhone) {
        throw new Error('Business phone is required for turf owners');
      }
      if (!value.turfCount) {
        throw new Error('Number of turfs is required for turf owners');
      }
    }
    
    return true;
  })
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

const firebaseAuthValidation = [
  body('firebaseToken').notEmpty().withMessage('Firebase token is required')
];

const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
];

const resetPasswordValidation = [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
];

// Routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/firebase', firebaseAuthValidation, firebaseAuth);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logout);
router.post('/forgotpassword', forgotPasswordValidation, forgotPassword);
router.put('/resetpassword/:resettoken', resetPasswordValidation, resetPassword);
router.post('/resend-verification', forgotPasswordValidation, resendVerification);

// OTP verification routes
router.post('/verify-otp', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
], verifyOTP);

router.post('/resend-otp', [
  body('userId').notEmpty().withMessage('User ID is required')
], resendOTP);

module.exports = router; 