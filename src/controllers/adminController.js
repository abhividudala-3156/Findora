
import mongoose from "mongoose";
import Item from "../models/Item.js";
import Notification from "../models/Notification.js";
import { createAuditLog } from "../services/auditLogService.js";

// Get all reports waiting for admin review.
export async function getPendingReports(req, res) {
  try {
    const reports = await Item.find({
      moderationStatus: "pending",
    })
      .populate("owner", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    console.error("Get pending reports error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve pending reports",
    });
  }
}

// Approve a pending report.
export async function approveReport(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID",
      });
    }

    const item = await Item.findOne({
      _id: id,
      moderationStatus: "pending",
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Pending report not found",
      });
    }

    item.moderationStatus = "approved";
    item.reviewedBy = req.user._id;
    item.reviewedAt = new Date();
    item.moderationReason = "";

    await item.save();

    // Record the approval in the audit log.
try {
  await createAuditLog({
    actor: req.user._id,
    action: "report_approved",
    entityType: "item",
    entityId: item._id,
    details: {
      title: item.title,
      previousStatus: "pending",
      newStatus: "approved",
    },
  });
} catch (auditError) {
  console.error("Audit log creation failed:", auditError.message);
}

    if (item.owner) {
      await Notification.create({
        recipient: item.owner,
        type: "report_approved",
        message: `Your report "${item.title}" has been approved.`,
        item: item._id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Report approved successfully",
      data: item,
    });
  } catch (error) {
    console.error("Approve report error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to approve report",
    });
  }
}

// Reject a pending report with a reason.
export async function rejectReport(req, res) {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason ?? "").trim();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "A rejection reason is required",
      });
    }

    if (reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason cannot exceed 500 characters",
      });
    }

    const item = await Item.findOne({
      _id: id,
      moderationStatus: "pending",
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Pending report not found",
      });
    }

    item.moderationStatus = "rejected";
    item.reviewedBy = req.user._id;
    item.reviewedAt = new Date();
    item.moderationReason = reason;

    await item.save();

    // Record the rejection in the audit log.
try {
  await createAuditLog({
    actor: req.user._id,
    action: "report_rejected",
    entityType: "item",
    entityId: item._id,
    details: {
      title: item.title,
      previousStatus: "pending",
      newStatus: "rejected",
      reason: reason,
    },
  });
} catch (auditError) {
  console.error("Audit log creation failed:", auditError.message);
}

    if (item.owner) {
      await Notification.create({
        recipient: item.owner,
        type: "report_rejected",
        message: `Your report "${item.title}" was rejected. Reason: ${reason}`,
        item: item._id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Report rejected successfully",
      data: item,
    });
  } catch (error) {
    console.error("Reject report error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to reject report",
    });
  }
}
