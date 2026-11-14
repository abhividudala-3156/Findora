
import AuditLog from "../models/AuditLog.js";

// Record an action performed by a user.
export async function createAuditLog({
  actor,
  action,
  entityType,
  entityId,
  details = {},
}) {
  const auditLog = await AuditLog.create({
    actor,
    action,
    entityType,
    entityId,
    details,
  });

  return auditLog;
}
