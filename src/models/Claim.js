
import mongoose from "mongoose";

const claimSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: [true, "Claimed item is required"],
      index: true,
    },

    claimant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Claimant is required"],
    },

    itemOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Item owner is required"],
    },

    message: {
      type: String,
      required: [true, "Claim explanation is required"],
      trim: true,
      minlength: [10, "Claim explanation must contain at least 10 characters"],
      maxlength: [1000, "Claim explanation cannot exceed 1000 characters"],
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },

    returnConfirmedByClaimant: {
      type: Boolean,
      default: false,
    },

    returnConfirmedByOwner: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);


  // Efficiently retrieve claims for an item or a student's account.
  claimSchema.index({ item: 1, claimant: 1, status: 1 });
  claimSchema.index({ itemOwner: 1, status: 1, createdAt: -1 });
  claimSchema.index({ claimant: 1, createdAt: -1 });

  // Allow only one pending claim per claimant for each item.
  claimSchema.index(
    { item: 1, claimant: 1 },
    {
      unique: true,
      partialFilterExpression: { status: "pending" },
      name: "unique_pending_claim_per_claimant_item",
    }
  );

const Claim = mongoose.model("Claim", claimSchema);

export default Claim;
