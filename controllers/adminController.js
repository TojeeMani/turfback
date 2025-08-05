const User = require('../models/User');

// @desc    Get all pending owner approvals
// @route   GET /api/admin/pending-owners
// @access  Private (Admin only)
exports.getPendingOwners = async (req, res, next) => {
  try {
    const pendingOwners = await User.find({
      userType: 'owner',
      adminApprovalStatus: 'pending'
    }).select('-password -otp -emailVerificationToken -resetPasswordToken');

    res.status(200).json({
      success: true,
      count: pendingOwners.length,
      data: pendingOwners
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve or reject owner
// @route   PUT /api/admin/owners/:id/approval
// @access  Private (Admin only)
exports.updateOwnerApproval = async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const { id } = req.params;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "rejected"'
      });
    }

    const owner = await User.findById(id);

    if (!owner) {
      return res.status(404).json({
        success: false,
        message: 'Owner not found'
      });
    }

    if (owner.userType !== 'owner') {
      return res.status(400).json({
        success: false,
        message: 'User is not an owner'
      });
    }

    // Update approval status
    owner.adminApprovalStatus = status;
    owner.isApprovedByAdmin = status === 'approved';
    owner.adminApprovalDate = new Date();
    owner.adminApprovalNotes = notes || '';

    await owner.save();

    res.status(200).json({
      success: true,
      message: `Owner ${status} successfully`,
      data: {
        id: owner._id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        businessName: owner.businessName,
        adminApprovalStatus: owner.adminApprovalStatus,
        isApprovedByAdmin: owner.isApprovedByAdmin,
        adminApprovalDate: owner.adminApprovalDate,
        adminApprovalNotes: owner.adminApprovalNotes
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all owners with approval status
// @route   GET /api/admin/owners
// @access  Private (Admin only)
exports.getAllOwners = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { userType: 'owner' };
    if (status) {
      query.adminApprovalStatus = status;
    }

    const owners = await User.find(query)
      .select('-password -otp -emailVerificationToken -resetPasswordToken')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count: owners.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: owners
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get owner details
// @route   GET /api/admin/owners/:id
// @access  Private (Admin only)
exports.getOwnerDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const owner = await User.findById(id).select('-password -otp -emailVerificationToken -resetPasswordToken');

    if (!owner) {
      return res.status(404).json({
        success: false,
        message: 'Owner not found'
      });
    }

    if (owner.userType !== 'owner') {
      return res.status(400).json({
        success: false,
        message: 'User is not an owner'
      });
    }

    res.status(200).json({
      success: true,
      data: owner
    });
  } catch (error) {
    next(error);
  }
}; 