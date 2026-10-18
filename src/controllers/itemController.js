
import mongoose from "mongoose";
import Item from "../models/Item.js";

// Fields clients are allowed to submit when creating an item.
const CREATE_FIELDS = [
  "title",
  "description",
  "type",
  "category",
  "campusLocation",
  "dateOccurred",
  "imageUrl",
  "contactName",
  "contactEmail"
];

// Fields clients are allowed to update.
const UPDATE_FIELDS = [...CREATE_FIELDS, "status"];

// Escape special characters before using user input in a regex.
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Handle validation and unexpected errors consistently.
function handleError(error, res) {
  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  console.error("Item controller error:", error.message);

  return res.status(500).json({
    success: false,
    message: "Internal server error"
  });
}

// Create an item.
export async function createItem(req, res) {
  try {
    const input = req.body ?? {};

    const itemData = Object.fromEntries(
      Object.entries(input).filter(([key]) =>
        CREATE_FIELDS.includes(key)
      )
    );

    const item = await Item.create(itemData);

    return res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: item
    });
  } catch (error) {
    return handleError(error, res);
  }
}

// Get all items with search, filters, sorting and pagination.
export async function getItems(req, res) {
  try {
    const {
      search,
      type,
      category,
      status = "active",
      campusLocation,
      sort = "newest",
      page = "1",
      limit = "10"
    } = req.query;

    // Validate pagination.
    const pageNumber = Number(page);
    const pageSize = Number(limit);

    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Page must be a positive integer and limit must be between 1 and 100"
      });
    }

    // Validate filter values.
    const validTypes = ["lost", "found"];
    const validCategories = [
      "electronics",
      "identification",
      "books",
      "clothing",
      "accessories",
      "stationery",
      "other"
    ];
    const validStatuses = [
      "active",
      "claimed",
      "resolved",
      "all"
    ];

    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be lost or found"
      });
    }

    if (category && !validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item category"
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item status"
      });
    }

    // Build the MongoDB filter.
    const filter = {};

    if (status !== "all") {
      filter.status = status;
    }

    if (type) {
      filter.type = type;
    }

    if (category) {
      filter.category = category;
    }

    if (campusLocation) {
      filter.campusLocation = {
        $regex: escapeRegex(campusLocation),
        $options: "i"
      };
    }

    if (search) {
      const escapedSearch = escapeRegex(search);

      filter.$or = [
        {
          title: {
            $regex: escapedSearch,
            $options: "i"
          }
        },
        {
          description: {
            $regex: escapedSearch,
            $options: "i"
          }
        },
        {
          campusLocation: {
            $regex: escapedSearch,
            $options: "i"
          }
        }
      ];
    }

    // Supported sorting options.
    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      title: { title: 1 }
    };

    if (!Object.hasOwn(sortOptions, sort)) {
      return res.status(400).json({
        success: false,
        message: "Sort must be newest, oldest, or title"
      });
    }

    const skip = (pageNumber - 1) * pageSize;

    // Retrieve the records and total count concurrently.
    const [items, totalItems] = await Promise.all([
      Item.find(filter)
        .sort(sortOptions[sort])
        .skip(skip)
        .limit(pageSize)
        .lean(),

      Item.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize)
      }
    });
  } catch (error) {
    return handleError(error, res);
  }
}

// Get one item by ID.
export async function getItemById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID"
      });
    }

    const item = await Item.findById(req.params.id).lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: item
    });
  } catch (error) {
    return handleError(error, res);
  }
}

// Update an existing item.
export async function updateItem(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID"
      });
    }

    const input = req.body ?? {};

    const updates = Object.fromEntries(
      Object.entries(input).filter(([key]) =>
        UPDATE_FIELDS.includes(key)
      )
    );

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update"
      });
    }

    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      {
        returnDocument: "after",
        runValidators: true
      }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Item updated successfully",
      data: item
    });
  } catch (error) {
    return handleError(error, res);
  }
}

// Delete an existing item.
export async function deleteItem(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID"
      });
    }

    const item = await Item.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Item deleted successfully"
    });
  } catch (error) {
    return handleError(error, res);
  }
}
