
import mongoose from "mongoose";
import Claim from "../models/Claim.js";
import Item from "../models/Item.js";
import Notification from "../models/Notification.js";

// Submit a claim for an item.
export async function createClaim(req, res) {
  try {
    const { id } = req.params;

    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID",
      });
    }

    if (message.length < 10 || message.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Claim explanation must contain 10–1000 characters",
      });
    }

    const item = await Item.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    if (item.status !== "active") {
      return res.status(409).json({
        success: false,
        message: "This item is not available for claims",
      });
    }

    const claimantId = req.user._id;

    // Owners cannot claim their own items.
    if (
      item.owner &&
      item.owner.toString() === claimantId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot claim your own item",
      });
    }

    const existingClaim = await Claim.findOne({
      item: item._id,
      claimant: claimantId,
      status: "pending",
    });

    if (existingClaim) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending claim for this item",
      });
    }

    const claim = await Claim.create({
      item: item._id,
      claimant: claimantId,
      itemOwner: item.owner,
      message,
    });

    // Notification failure must not undo a successful claim.
    if (item.owner) {
      try {
        await Notification.create({
          recipient: item.owner,
          type: "claim_submitted",
          message: `A new claim has been submitted for "${item.title}".`,
          claim: claim._id,
          item: item._id,
        });
      } catch (notificationError) {
        console.error(
          "Claim submitted notification error:",
          notificationError.message
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: "Claim submitted successfully",
      data: claim,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending claim for this item",
      });
    }

    console.error("Create claim error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to submit claim",
    });
  }
}

// Approve or reject a claim.
async function reviewClaim(req, res, nextStatus) {
  try {
    const { id, claimId } = req.params;

    if (
      !mongoose.isValidObjectId(id) ||
      !mongoose.isValidObjectId(claimId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID or claim ID",
      });
    }

    const item = await Item.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    if (
      !item.owner ||
      item.owner.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Only the item owner can review claims",
      });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      item: item._id,
    });

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: "Claim not found for this item",
      });
    }

    if (
      !claim.itemOwner ||
      claim.itemOwner.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to review this claim",
      });
    }

    if (claim.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Only pending claims can be reviewed",
      });
    }

    const updatedClaim = await Claim.findOneAndUpdate(
      {
        _id: claim._id,
        item: item._id,
        itemOwner: req.user._id,
        status: "pending",
      },
      {
        $set: { status: nextStatus },
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!updatedClaim) {
      return res.status(409).json({
        success: false,
        message: "This claim has already been reviewed",
      });
    }

    // Reserve the item when a claim is approved.
    if (nextStatus === "approved") {
      const updatedItem = await Item.findOneAndUpdate(
        {
          _id: item._id,
          status: "active",
        },
        {
          $set: { status: "claimed" },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      );

      if (!updatedItem) {
        // Compensating update; this is not a cross-document transaction.
        await Claim.findOneAndUpdate(
          {
            _id: updatedClaim._id,
            status: "approved",
          },
          {
            $set: { status: "pending" },
          },
          { runValidators: true }
        );

        return res.status(409).json({
          success: false,
          message: "This item is no longer available for approval",
        });
      }
    }

    try {
      const notificationType =
        nextStatus === "approved"
          ? "claim_approved"
          : "claim_rejected";

      await Notification.create({
        recipient: updatedClaim.claimant,
        type: notificationType,
        message: `Your claim for "${item.title}" has been ${nextStatus}.`,
        claim: updatedClaim._id,
        item: item._id,
      });
    } catch (notificationError) {
      console.error(
        "Claim review notification error:",
        notificationError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: `Claim ${nextStatus} successfully`,
      data: updatedClaim,
    });
  } catch (error) {
    console.error("Review claim error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to review claim",
    });
  }
}

export async function approveClaim(req, res) {
  return reviewClaim(req, res, "approved");
}

export async function rejectClaim(req, res) {
  return reviewClaim(req, res, "rejected");
}

// Confirm that an approved item has been returned.
export async function confirmRecovery(req, res) {
  try {
    const { id, claimId } = req.params;

    if (
      !mongoose.isValidObjectId(id) ||
      !mongoose.isValidObjectId(claimId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID or claim ID",
      });
    }

    const item = await Item.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    const claim = await Claim.findOne({
      _id: claimId,
      item: item._id,
    });

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: "Claim not found for this item",
      });
    }

    const userId = req.user._id.toString();
    const isClaimant = userId === claim.claimant.toString();
    const isOwner = userId === claim.itemOwner.toString();

    if (!isClaimant && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Only the claimant or item owner can confirm recovery",
      });
    }

    if (claim.status !== "approved") {
      return res.status(409).json({
        success: false,
        message: "Only approved claims can be confirmed",
      });
    }

    if (item.status === "resolved") {
      return res.status(409).json({
        success: false,
        message: "This item has already been resolved",
      });
    }

    if (item.status !== "claimed") {
      return res.status(409).json({
        success: false,
        message: "The item must be claimed before recovery confirmation",
      });
    }

    const confirmationField = isClaimant
      ? "returnConfirmedByClaimant"
      : "returnConfirmedByOwner";

    const alreadyConfirmed = claim[confirmationField];

    // Reject duplicate confirmations unless both parties have
    // confirmed and the item still needs its final status update.
    if (
      alreadyConfirmed &&
      !(claim.returnConfirmedByClaimant && claim.returnConfirmedByOwner)
    ) {
      return res.status(409).json({
        success: false,
        message: "You have already confirmed this recovery",
      });
    }

    if (!alreadyConfirmed) {
      const updatedClaim = await Claim.findOneAndUpdate(
        {
          _id: claim._id,
          status: "approved",
          [confirmationField]: false,
        },
        {
          $set: { [confirmationField]: true },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      );

      if (updatedClaim) {
        claim.set(updatedClaim.toObject());
      } else {
        // Reload the claim in case another request recorded the flag.
        const latestClaim = await Claim.findById(claim._id);

        if (!latestClaim || !latestClaim[confirmationField]) {
          return res.status(409).json({
            success: false,
            message: "Unable to record confirmation; please retry",
          });
        }

        claim.set(latestClaim.toObject());

        // A concurrent request may have recorded this same confirmation.
        const bothConfirmed =
          claim.returnConfirmedByClaimant &&
          claim.returnConfirmedByOwner;

        if (!bothConfirmed) {
          return res.status(409).json({
            success: false,
            message: "You have already confirmed this recovery",
          });
        }
      }
    }

    const recoveryComplete =
      claim.returnConfirmedByClaimant &&
      claim.returnConfirmedByOwner;

    if (recoveryComplete) {
      const updatedItem = await Item.findOneAndUpdate(
        {
          _id: item._id,
          status: "claimed",
        },
        {
          $set: { status: "resolved" },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      );

      if (!updatedItem) {
        const currentItem = await Item.findById(item._id);

        if (!currentItem || currentItem.status !== "resolved") {
          return res.status(409).json({
            success: false,
            message:
              "Both parties have confirmed, but recovery completion could not be finalized. Retry the request.",
          });
        }

        item.status = currentItem.status;
      } else {
        item.status = updatedItem.status;
      }
    }

    // Notify both parties when the item is resolved.
    if (recoveryComplete && item.status === "resolved") {
      try {
        await Notification.create([
          {
            recipient: claim.claimant,
            type: "recovery_confirmed",
            message: `Recovery of "${item.title}" has been confirmed by both parties.`,
            claim: claim._id,
            item: item._id,
          },
          {
            recipient: claim.itemOwner,
            type: "recovery_confirmed",
            message: `Recovery of "${item.title}" has been confirmed by both parties.`,
            claim: claim._id,
            item: item._id,
          },
        ]);
      } catch (notificationError) {
        console.error(
          "Recovery notification error:",
          notificationError.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: recoveryComplete
        ? "Recovery confirmed by both parties; item resolved"
        : "Your recovery confirmation has been recorded",
      data: {
        claim,
        itemStatus: item.status,
        recoveryComplete,
      },
    });
  } catch (error) {
    console.error("Confirm recovery error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to confirm recovery",
    });
  }
}
