
import Item from "../models/Item.js";
import Claim from "../models/Claim.js";
import User from "../models/User.js";

// Get dashboard statistics for administrators.
export async function getAnalytics(req, res) {
  try {
    const { from, to } = req.query;

    const dateFilter = {};

    // Validate the start date.
    if (from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        return res.status(400).json({
          success: false,
          message: "Invalid start date. Use YYYY-MM-DD",
        });
      }

      const startDate = new Date(`${from}T00:00:00.000Z`);

      if (
        Number.isNaN(startDate.getTime()) ||
        startDate.toISOString().slice(0, 10) !== from
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid start date",
        });
      }

      dateFilter.$gte = startDate;
    }

    // Validate the end date.
    if (to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({
          success: false,
          message: "Invalid end date. Use YYYY-MM-DD",
        });
      }

      const endDate = new Date(`${to}T00:00:00.000Z`);

      if (
        Number.isNaN(endDate.getTime()) ||
        endDate.toISOString().slice(0, 10) !== to
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid end date",
        });
      }

      // Include the entire end date.
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      dateFilter.$lt = endDate;
    }

    // Check that the start date is not after the end date.
    if (from && to && from > to) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    const itemFilter = Object.keys(dateFilter).length
      ? { createdAt: dateFilter }
      : {};

    const claimFilter = Object.keys(dateFilter).length
      ? { createdAt: dateFilter }
      : {};

    const userFilter = Object.keys(dateFilter).length
      ? { createdAt: dateFilter }
      : {};

    const [
      totalReports,
      lostReports,
      foundReports,
      pendingReports,
      approvedReports,
      rejectedReports,
      activeReports,
      claimedReports,
      resolvedReports,
      duplicateReports,
      suspiciousReports,
      totalClaims,
      pendingClaims,
      approvedClaims,
      rejectedClaims,
      cancelledClaims,
      recoveredClaims,
      totalUsers,
      adminUsers,
      regularUsers,
      categories,
      locations,
      monthlyReports,
    ] = await Promise.all([
      // Report statistics
      Item.countDocuments(itemFilter),
      Item.countDocuments({ ...itemFilter, type: "lost" }),
      Item.countDocuments({ ...itemFilter, type: "found" }),
      Item.countDocuments({ ...itemFilter, moderationStatus: "pending" }),
      Item.countDocuments({ ...itemFilter, moderationStatus: "approved" }),
      Item.countDocuments({ ...itemFilter, moderationStatus: "rejected" }),
      Item.countDocuments({ ...itemFilter, status: "active" }),
      Item.countDocuments({ ...itemFilter, status: "claimed" }),
      Item.countDocuments({ ...itemFilter, status: "resolved" }),

      // Duplicate and suspicious reports
      Item.countDocuments({
        ...itemFilter,
        "duplicateCheck.status": "flagged",
      }),
      Item.countDocuments({
        ...itemFilter,
        "suspiciousCheck.status": "flagged",
      }),

      // Claim statistics
      Claim.countDocuments(claimFilter),
      Claim.countDocuments({ ...claimFilter, status: "pending" }),
      Claim.countDocuments({ ...claimFilter, status: "approved" }),
      Claim.countDocuments({ ...claimFilter, status: "rejected" }),
      Claim.countDocuments({ ...claimFilter, status: "cancelled" }),

      // Completed recoveries require both confirmations.
      Claim.countDocuments({
        ...claimFilter,
        status: "approved",
        returnConfirmedByClaimant: true,
        returnConfirmedByOwner: true,
      }),

      // User statistics
      User.countDocuments(userFilter),
      User.countDocuments({ ...userFilter, role: "admin" }),
      User.countDocuments({ ...userFilter, role: "user" }),

      // Category distribution
      Item.aggregate([
        { $match: itemFilter },
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Top 10 campus locations
      Item.aggregate([
        { $match: itemFilter },
        {
          $group: {
            _id: "$campusLocation",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Monthly report trends
      Item.aggregate([
        { $match: itemFilter },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m",
                date: "$createdAt",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Calculate recovery percentage.
    const recoveryRate = approvedClaims
      ? Number(((recoveredClaims / approvedClaims) * 100).toFixed(2))
      : 0;

    return res.status(200).json({
      success: true,

      filters: {
        from: from || null,
        to: to || null,
      },

      data: {
        reports: {
          total: totalReports,
          lost: lostReports,
          found: foundReports,
          pending: pendingReports,
          approved: approvedReports,
          rejected: rejectedReports,
          active: activeReports,
          claimed: claimedReports,
          resolved: resolvedReports,
          duplicates: duplicateReports,
          suspicious: suspiciousReports,
        },

        claims: {
          total: totalClaims,
          pending: pendingClaims,
          approved: approvedClaims,
          rejected: rejectedClaims,
          cancelled: cancelledClaims,
          recovered: recoveredClaims,
          recoveryRate,
        },

        users: {
          total: totalUsers,
          admins: adminUsers,
          regularUsers,
        },

        categories,
        locations,
        monthlyReports,
      },
    });
  } catch (error) {
    console.error("Get analytics error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve analytics",
    });
  }
}
