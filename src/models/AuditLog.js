
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    // User who performed the action.
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Audit log actor is required"],
      index: true,
    },

    // Action performed by the user.
    action: {
      type: String,
      required: [true, "Audit action is required"],
      enum: [
        "item_created",
        "item_updated",
        "item_deleted",
        "report_approved",
        "report_rejected",
        "claim_submitted",
        "claim_approved",
        "claim_rejected",
        "recovery_confirmed",
        "user_role_changed",
      ],
    },

    // Type of record affected by the action.
    entityType: {
      type: String,
      required: [true, "Entity type is required"],
      enum: ["item", "claim", "user"],
    },

    // ID of the affected record.
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Entity ID is required"],
    },

    // Additional information about the action.
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Improve audit-log search performance.
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
