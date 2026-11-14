
import Item from "../models/Item.js";

// Normalize text before comparing reports.
function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Convert text into individual words.
function getWords(value) {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

// Calculate word similarity using Jaccard similarity.
function calculateSimilarity(first, second) {
  const firstWords = getWords(first);
  const secondWords = getWords(second);

  if (firstWords.size === 0 || secondWords.size === 0) {
    return 0;
  }

  const commonWords = [...firstWords].filter((word) =>
    secondWords.has(word)
  );

  const totalWords = new Set([...firstWords, ...secondWords]);

  return commonWords.length / totalWords.size;
}

// Calculate how close two report dates are.
function calculateDateScore(firstDate, secondDate) {
  const difference = Math.abs(
    new Date(firstDate).getTime() - new Date(secondDate).getTime()
  );

  const days = difference / (1000 * 60 * 60 * 24);

  if (days <= 1) return 10;
  if (days <= 3) return 7;
  if (days <= 7) return 4;

  return 0;
}

// Compare two reports and return an explainable score.
function compareReports(newReport, existingReport) {
  let score = 0;
  const reasons = [];

  const titleSimilarity = calculateSimilarity(
    newReport.title,
    existingReport.title
  );

  if (titleSimilarity >= 0.5) {
    score += 30 * titleSimilarity;
    reasons.push("Similar item titles");
  }

  if (newReport.category === existingReport.category) {
    score += 20;
    reasons.push("Same item category");
  }

  const descriptionSimilarity = calculateSimilarity(
    newReport.description,
    existingReport.description
  );

  if (descriptionSimilarity >= 0.3) {
    score += 20 * descriptionSimilarity;
    reasons.push("Similar descriptions");
  }

  const newLocation = normalizeText(newReport.campusLocation);
  const oldLocation = normalizeText(existingReport.campusLocation);

  if (newLocation === oldLocation) {
    score += 20;
    reasons.push("Same campus location");
  } else if (
    newLocation &&
    oldLocation &&
    (newLocation.includes(oldLocation) ||
      oldLocation.includes(newLocation))
  ) {
    score += 10;
    reasons.push("Similar campus locations");
  }

  const dateScore = calculateDateScore(
    newReport.dateOccurred,
    existingReport.dateOccurred
  );

  if (dateScore > 0) {
    score += dateScore;
    reasons.push("Nearby occurrence dates");
  }

  return {
    score: Math.round(score),
    reasons
  };
}

// Find existing reports that may be related to a new report.
export async function detectReportPatterns(report, excludeItemId = null) {
  const startDate = new Date(report.dateOccurred);
  startDate.setDate(startDate.getDate() - 14);

  const endDate = new Date(report.dateOccurred);
  endDate.setDate(endDate.getDate() + 14);

  const filter = {
    moderationStatus: { $in: ["pending", "approved"] },
    status: { $ne: "resolved" },
    dateOccurred: {
      $gte: startDate,
      $lte: endDate
    }
  };

  if (excludeItemId) {
    filter._id = { $ne: excludeItemId };
  }

  // Retrieve recent reports within the date range.
  const existingReports = await Item.find(filter)
    .select(
      "title description type category campusLocation dateOccurred owner"
    )
    .limit(100)
    .lean();

  const matches = [];
  const suspiciousFlags = [];

  let repeatedSubmission = false;

  for (const existingReport of existingReports) {
    const result = compareReports(report, existingReport);

    const sameType = report.type === existingReport.type;
    const sameOwner =
      report.owner &&
      existingReport.owner &&
      report.owner.toString() === existingReport.owner.toString();

    // Same-type reports may be duplicate submissions.
    if (sameType && result.score >= 65) {
      matches.push({
        matchedItem: existingReport._id,
        matchType: "same_type_duplicate",
        score: result.score,
        reasons: result.reasons
      });

      // Flag repeated near-identical submissions by one account.
      if (sameOwner && result.score >= 90) {
        repeatedSubmission = true;
      }
    }

    // Lost and found reports may describe the same physical item.
    if (!sameType && result.score >= 60) {
      matches.push({
        matchedItem: existingReport._id,
        matchType: "lost_found_match",
        score: result.score,
        reasons: result.reasons
      });
    }
  }

  if (repeatedSubmission) {
    suspiciousFlags.push(
      "A highly similar report was previously submitted by the same account"
    );
  }

  const duplicateMatches = matches.filter(
    (match) => match.matchType === "same_type_duplicate"
  );

  const duplicateCheck = {
    status: duplicateMatches.length > 0 ? "flagged" : "clear",
    checkedAt: new Date(),
    matches
  };

  const suspiciousCheck = {
    status: suspiciousFlags.length > 0 ? "flagged" : "clear",
    checkedAt: new Date(),
    flags: suspiciousFlags,
    riskScore: suspiciousFlags.length > 0 ? 60 : 0
  };

  return {
    duplicateCheck,
    suspiciousCheck
  };
}
