
import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [2, "Title must contain at least 2 characters"],
      maxlength: [100, "Title cannot exceed 100 characters"],
    },

    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [10, "Description must contain at least 10 characters"],
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },

    type: {
      type: String,
      required: [true, "Item type is required"],
      enum: {
        values: ["lost", "found"],
        message: "Type must be either lost or found",
      },
    },

    category: {
      type: String,
      required: [true, "Category is required"],
      enum: {
        values: [
          "electronics",
          "identification",
          "books",
          "clothing",
          "accessories",
          "stationery",
          "other",
        ],
        message: "Please select a valid category",
      },
    },

    campusLocation: {
      type: String,
      required: [true, "Campus location is required"],
      trim: true,
      maxlength: [
        150,
        "Campus location cannot exceed 150 characters",
      ],
    },

    dateOccurred: {
      type: Date,
      required: [true, "Date is required"],
      validate: {
        validator: function (value) {
          return value <= new Date();
        },
        message: "Date cannot be in the future",
      },
    },

    imageUrl: {
      type: String,
      trim: true,
      maxlength: [2048, "Image URL cannot exceed 2048 characters"],
      default: "",
    },

    contactName: {
      type: String,
      required: [true, "Contact name is required"],
      trim: true,
      maxlength: [100, "Contact name cannot exceed 100 characters"],
    },

    contactEmail: {
      type: String,
      required: [true, "Contact email is required"],
      trim: true,
      lowercase: true,
      maxlength: [254, "Contact email cannot exceed 254 characters"],
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },

    // User who created the item.
    // Existing records can remain ownerless (owner: null).
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: {
        values: ["active", "claimed", "resolved"],
        message: "Status must be active, claimed, or resolved",
      },
      default: "active",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for item filtering and sorting.
itemSchema.index({ type: 1, status: 1, createdAt: -1 });
itemSchema.index({ category: 1, campusLocation: 1 });

const Item = mongoose.model("Item", itemSchema);

export default Item;
