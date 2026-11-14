import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";

// Get audit logs for administrators.
export async function getAuditLogs(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const filter = {};

    if (req.query.action) {
      filter.action = req.query.action;
    }

    if (req.query.entityType) {
      filter.entityType = req.query.entityType;
    }

    const [logs, totalLogs] = await Promise.all([
      AuditLog.find(filter)
        .populate("actor", "name email role")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: logs.length,
      totalLogs,
      currentPage: page,
      totalPages: Math.ceil(totalLogs / limit),
      data: logs,
    });
  } catch (error) {
    console.error("Get audit logs error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve audit logs",
    });
  }
}