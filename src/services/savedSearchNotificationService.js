
import SavedSearch from "../models/SavedSearch.js";
import Notification from "../models/Notification.js";

// Escape special characters before using a search value in regex.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Find saved searches matching the newly approved report.

export async function notifySavedSearchMatches(item) {
  const searches = await SavedSearch.find({
    user: { $ne: item.owner },
  }).lean();

  const recipients = new Set();

  const itemDate = new Date(item.dateOccurred)
    .toISOString()
    .slice(0, 10);

  for (const savedSearch of searches) {
    const filters = savedSearch.filters ?? {};

    if (filters.type && filters.type !== item.type) continue;
    if (filters.category && filters.category !== item.category) continue;

    if (
      filters.status &&
      filters.status !== "all" &&
      filters.status !== item.status
    ) {
      continue;
    }

    if (
      filters.campusLocation &&
      !new RegExp(
        escapeRegex(filters.campusLocation),
        "i"
      ).test(item.campusLocation)
    ) {
      continue;
    }

    if (filters.search) {
      const searchPattern = new RegExp(
        escapeRegex(filters.search),
        "i"
      );

      const matchesSearch =
        searchPattern.test(item.title) ||
        searchPattern.test(item.description) ||
        searchPattern.test(item.campusLocation);

      if (!matchesSearch) continue;
    }

    // Apply saved-search date filters.
    if (filters.dateFrom && itemDate < filters.dateFrom) {
      continue;
    }

    if (filters.dateTo && itemDate > filters.dateTo) {
      continue;
    }

    recipients.add(savedSearch.user.toString());
  }

  for (const recipient of recipients) {
    const existingNotification = await Notification.findOne({
      recipient,
      type: "saved_search_match",
      item: item._id,
    });

    if (existingNotification) continue;

    await Notification.create({
      recipient,
      type: "saved_search_match",
      message: `A new item "${item.title}" matches your saved search.`,
      item: item._id,
    });
  }
}

