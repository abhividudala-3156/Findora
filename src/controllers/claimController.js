
import mongoose from "mongoose";
import Claim from "../models/Claim.js";
import Item from "../models/Item.js";

export async function createClaim(req, res) {
  try {
    const { id } = req.params;
    const message =
      typeof req.body?.message === "string"
        ? req.body.message.trim()
        : "";

    // Validate the item ID before querying MongoDB.
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID",
      });
    }

    // Validate the explanation.
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

    // Owners cannot submit claims for their own items.
    if (item.owner && item.owner.toString() === claimantId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You cannot claim your own item",
      });
    }

    // Prevent duplicate pending claims by the same claimant.
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

    return res.status(201).json({
      success: true,
      message: "Claim submitted successfully",
      data: claim,
    });

  } catch (error) {
    // The unique index protects against simultaneous duplicate requests.
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


async function reviewClaim(req, res, nextStatus) {
  try {
    const { id, claimId } = req.params;

    // Validate both IDs before querying MongoDB.
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

    // Only the actual item owner may review claims.
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

    // The recorded claim owner must also match.
    if (claim.itemOwner.toString() !== req.user._id.toString()) {
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

    // Conditional update prevents two simultaneous reviews
    // from both successfully changing the same pending claim.
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
      { returnDocument: "after", runValidators: true }
    );

    if (!updatedClaim) {
      return res.status(409).json({
        success: false,
        message: "This claim has already been reviewed",
      });
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