const express = require('express');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Get all turfs
// @route   GET /api/turfs
// @access  Public
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Get all turfs endpoint - to be implemented'
  });
});

// @desc    Get single turf
// @route   GET /api/turfs/:id
// @access  Public
router.get('/:id', (req, res) => {
  res.status(200).json({
    success: true,
    message: `Get turf ${req.params.id} endpoint - to be implemented`
  });
});

// All routes below require authentication
router.use(protect);

// @desc    Create new turf
// @route   POST /api/turfs
// @access  Private/Owner
router.post('/', authorize('owner'), (req, res) => {
  res.status(201).json({
    success: true,
    message: 'Create turf endpoint - to be implemented'
  });
});

// @desc    Update turf
// @route   PUT /api/turfs/:id
// @access  Private/Owner
router.put('/:id', authorize('owner'), (req, res) => {
  res.status(200).json({
    success: true,
    message: `Update turf ${req.params.id} endpoint - to be implemented`
  });
});

// @desc    Delete turf
// @route   DELETE /api/turfs/:id
// @access  Private/Owner
router.delete('/:id', authorize('owner'), (req, res) => {
  res.status(200).json({
    success: true,
    message: `Delete turf ${req.params.id} endpoint - to be implemented`
  });
});

module.exports = router; 