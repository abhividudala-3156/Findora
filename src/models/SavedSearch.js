
import mongoose from "mongoose";

const savedSearchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, "Search name is required"],
      trim: true,
      minlength: [2, "Name must contain at least 2 characters"],
      maxlength: [60, "Name cannot exceed 60 characters"],
    },

    filters: {
      search: {
        type: String,
        trim: true,
        maxlength: 100,
        default: "",
      },

      type: {
        type: String,
        enum: ["", "lost", "found"],
        default: "",
      },

      category: {
        type: String,
        enum: [
          "",
          "electronics",
          "identification",
          "books",
          "clothing",
          "accessories",
          "stationery",
          "other",
        ],
        default: "",
      },

      campusLocation: {
        type: String,
        trim: true,
        maxlength: 150,
        default: "",
      },

      dateFrom: {
        type: String,
        default: "",
        validate: {
          validator(value) {
            if (!value) return true;

            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              return false;
            }

            const date = new Date(`${value}T00:00:00.000Z`);

            return (
              !Number.isNaN(date.getTime()) &&
              date.toISOString().slice(0, 10) === value
            );
          },
          message: "Invalid start date",
        },
      },

      dateTo: {
        type: String,
        default: "",
        validate: {
          validator(value) {
            if (!value) return true;

            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              return false;
            }

            const date = new Date(`${value}T00:00:00.000Z`);

            return (
              !Number.isNaN(date.getTime()) &&
              date.toISOString().slice(0, 10) === value
            );
          },
          message: "Invalid end date",
        },
      },

      status: {
        type: String,
        enum: ["active", "claimed", "resolved", "all"],
        default: "active",
      },

      sort: {
        type: String,
        enum: [
          "newest",
          "oldest",
          "title",
          "title_asc",
          "title_desc",
        ],
        default: "newest",
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Validate that the start date is not later than the end date.
savedSearchSchema.pre("validate", function () {
  const dateFrom = this.filters?.dateFrom;
  const dateTo = this.filters?.dateTo;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    this.invalidate(
      "filters.dateTo",
      "End date cannot be before start date"
    );
  }
});

// Compile the model after registering middleware.
const SavedSearch = mongoose.model("SavedSearch", savedSearchSchema);

export default SavedSearch;
