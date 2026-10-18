
import mongoose from "mongoose";
import Item from "../models/Item.js";

const CREATE_FIELDS = [
  "title",
  "description",
  "type",
  "category",
  "campusLocation",
  "dateOccurred",
  "imageUrl",
  "contactName",
  "contactEmail",
];

const UPDATE_FIELDS = [...CREATE_FIELDS, "status"];

function pickFields(source, allowedFields) {
  const result = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }

  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ownsItem(item, user) {
  const ownerId = item?.owner?._id ?? item?.owner;
  const userId = user?._id ?? user?.id;

  return Boolean(
    ownerId &&
    userId &&
    ownerId.toString() === userId.toString()
  );
}

function handleError(error, res) {
  if (
    error instanceof mongoose.Error.ValidationError ||
    error instanceof mongoose.Error.CastError
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A record with this value already exists",
    });
  }

  console.error("Item controller error:", error.message);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

export async function createItem(req, res) {
  try {
    const userId = req.user?._id ?? req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const itemData = pickFields(req.body ?? {}, CREATE_FIELDS);

    // The owner is always assigned from the authenticated session.
    itemData.owner = userId;

    const item = await Item.create(itemData);

    return res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: item,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

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
      limit = "10",
    } = req.query;

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
          "Page must be a positive integer and limit must be between 1 and 100",
      });
    }

    const validTypes = ["lost", "found"];
    const validCategories = [
      "electronics",
      "identification",
      "books",
      "clothing",
      "accessories",
      "stationery",
      "other",
    ];
    const validStatuses = [
      "active",
      "claimed",
      "resolved",
      "all",
    ];

    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be lost or found",
      });
    }

    if (category && !validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item category",
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item status",
      });
    }

    const filter = {};

    if (status !== "all") {
      filter.status = status;
    }

    if (type) filter.type = type;
    if (category) filter.category = category;

    if (campusLocation) {
      filter.campusLocation = {
        $regex: escapeRegex(String(campusLocation)),
        $options: "i",
      };
    }

    if (search) {
      const escapedSearch = escapeRegex(String(search));

      filter.$or = [
        { title: { $regex: escapedSearch, $options: "i" } },
        {
          description: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          campusLocation: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
      ];
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      title: { title: 1 },
    };

    if (!Object.hasOwn(sortOptions, sort)) {
      return res.status(400).json({
        success: false,
        message: "Sort must be newest, oldest, or title",
      });
    }

    const skip = (pageNumber - 1) * pageSize;

    const [items, totalItems] = await Promise.all([
      Item.find(filter)
        .sort(sortOptions[sort])
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Item.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function getItemById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID",
      });
    }

    const item = await Item.findById(req.params.id).lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function updateItem(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID",
      });
    }

    const updates = pickFields(req.body ?? {}, UPDATE_FIELDS);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    if (!ownsItem(item, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this item",
      });
    }

    // owner is intentionally excluded from UPDATE_FIELDS.
    item.set(updates);
    await item.save();

    return res.status(200).json({
      success: true,
      message: "Item updated successfully",
      data: item,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

export async function deleteItem(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item ID",
      });
    }

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    if (!ownsItem(item, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this item",
      });
    }

    await item.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Item deleted successfully",
    });
  } catch (error) {
    return handleError(error, res);
  }
}
