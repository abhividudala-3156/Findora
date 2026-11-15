
import mongoose from "mongoose";
import SavedSearch from "../models/SavedSearch.js";

const FILTER_FIELDS = [
  "search",
  "type",
  "category",
  "campusLocation",
  "dateFrom",
  "dateTo",
  "status",
  "sort",
];

function getUserId(req) {
  return req.user?._id ?? req.user?.id;
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

  console.error("Saved search controller error:", error.message);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

function getFilters(source = {}) {
  const filters = {};

  for (const field of FILTER_FIELDS) {
    if (Object.hasOwn(source, field)) {
      filters[field] = source[field];
    }
  }

  return filters;
}

// Create a saved search.
export async function createSavedSearch(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const savedSearch = await SavedSearch.create({
      user: userId,
      name: req.body?.name,
      filters: getFilters(req.body?.filters),
    });

    return res.status(201).json({
      success: true,
      message: "Search saved successfully",
      data: savedSearch,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

// Get all saved searches belonging to the logged-in user.
export async function getSavedSearches(req, res) {
  try {
    const searches = await SavedSearch.find({
      user: getUserId(req),
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: searches.length,
      data: searches,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

// Get one saved search belonging to the logged-in user.
export async function getSavedSearchById(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid saved search ID",
      });
    }

    const savedSearch = await SavedSearch.findOne({
      _id: req.params.id,
      user: getUserId(req),
    }).lean();

    if (!savedSearch) {
      return res.status(404).json({
        success: false,
        message: "Saved search not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: savedSearch,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

// Update a saved search belonging to the logged-in user.
export async function updateSavedSearch(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid saved search ID",
      });
    }

    const updates = {};

    if (Object.hasOwn(req.body ?? {}, "name")) {
      updates.name = req.body.name;
    }

    if (Object.hasOwn(req.body ?? {}, "filters")) {
      updates.filters = getFilters(req.body.filters);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    const savedSearch = await SavedSearch.findOneAndUpdate(
      {
        _id: req.params.id,
        user: getUserId(req),
      },
      updates,
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!savedSearch) {
      return res.status(404).json({
        success: false,
        message: "Saved search not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Saved search updated successfully",
      data: savedSearch,
    });
  } catch (error) {
    return handleError(error, res);
  }
}

// Delete a saved search belonging to the logged-in user.
export async function deleteSavedSearch(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid saved search ID",
      });
    }

    const savedSearch = await SavedSearch.findOneAndDelete({
      _id: req.params.id,
      user: getUserId(req),
    });

    if (!savedSearch) {
      return res.status(404).json({
        success: false,
        message: "Saved search not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Saved search deleted successfully",
    });
  } catch (error) {
    return handleError(error, res);
  }
}
