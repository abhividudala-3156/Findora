
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
