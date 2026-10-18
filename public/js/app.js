
"use strict";

// ==========================================
// 1. HTML ELEMENT REFERENCES
// ==========================================

const itemGrid = document.getElementById("item-grid");
const itemCount = document.getElementById("item-count");
const searchInput = document.getElementById("search-input");
const typeFilter = document.getElementById("type-filter");
const categoryFilter = document.getElementById("category-filter");
const sortFilter = document.getElementById("sort-filter");
const errorMessage = document.getElementById("error-message");

const previousPageButton = document.getElementById("previous-page");
const nextPageButton = document.getElementById("next-page");
const pageInfo = document.getElementById("page-info");

const reportForm = document.getElementById("report-form");
const formMessage = document.getElementById("form-message");
const submitButton = document.getElementById("submit-report");
const dateInput = document.getElementById("item-date");

// ==========================================
// 2. APPLICATION STATE
// ==========================================

let currentPage = 1;
const pageLimit = 9;
let totalPages = 0;
let searchTimer;
let currentRequest = null;

// Prevent choosing a future date in the browser.
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

dateInput.max = getLocalDateString();

// ==========================================
// 3. SAFE HTML ELEMENT CREATION
// ==========================================

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);

  element.className = className;
  element.textContent = text;

  return element;
}

// ==========================================
// 4. DATE FORMATTING
// ==========================================

function formatDate(dateValue) {
  if (!dateValue) {
    return "Date unavailable";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

// ==========================================
// 5. CREATE AN ITEM CARD
// ==========================================

function createItemCard(item) {
  const article = document.createElement("article");
  article.className = "item-card";

  const content = document.createElement("div");
  content.className = "item-card-content";

  const top = document.createElement("div");
  top.className = "item-card-top";

  const itemType = item.type === "found" ? "found" : "lost";

  const badge = createTextElement(
    "span",
    `item-badge ${itemType}`,
    itemType
  );

  const categoryName = String(item.category || "other")
    .replaceAll("-", " ");

  const category = createTextElement(
    "span",
    "item-category",
    categoryName
  );

  top.append(badge, category);

  const title = createTextElement(
    "h3",
    "",
    item.title || "Untitled item"
  );

  const description = createTextElement(
    "p",
    "item-description",
    item.description || "No description provided."
  );

  const meta = document.createElement("div");
  meta.className = "item-meta";

  const location = createTextElement(
    "span",
    "",
    `📍 ${item.campusLocation || "Location unavailable"}`
  );

  const date = createTextElement(
    "span",
    "",
    `📅 ${formatDate(item.dateOccurred)}`
  );

  meta.append(location, date);
  content.append(top, title, description, meta);
  article.append(content);

  return article;
}

// ==========================================
// 6. DISPLAY ITEMS AND TOTAL COUNT
// ==========================================

function displayItems(items, totalItems) {
  itemGrid.replaceChildren();

  itemCount.textContent =
    `${totalItems} item${totalItems === 1 ? "" : "s"}`;

  if (items.length === 0) {
    itemGrid.append(
      createTextElement(
        "p",
        "empty-message",
        "No items found. Try changing your search or filters."
      )
    );

    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    fragment.append(createItemCard(item));
  });

  itemGrid.append(fragment);
}

// ==========================================
// 7. UPDATE PAGINATION CONTROLS
// ==========================================

function updatePagination(pagination) {
  currentPage = pagination.page;
  totalPages = pagination.totalPages;

  if (totalPages > 0) {
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  } else {
    pageInfo.textContent = "No pages";
  }

  previousPageButton.disabled = currentPage <= 1;
  nextPageButton.disabled =
    totalPages === 0 || currentPage >= totalPages;
}

// ==========================================
// 8. LOAD ITEMS FROM THE BACKEND
// ==========================================

async function loadItems() {
  // Cancel an earlier request if a newer one starts.
  if (currentRequest) {
    currentRequest.abort();
  }

  const controller = new AbortController();
  currentRequest = controller;

  const params = new URLSearchParams();

  const search = searchInput.value.trim();
  const type = typeFilter.value;
  const category = categoryFilter.value;
  const sort = sortFilter.value;

  if (search) {
    params.set("search", search);
  }

  if (type) {
    params.set("type", type);
  }

  if (category) {
    params.set("category", category);
  }

  if (sort) {
    params.set("sort", sort);
  }

  params.set("page", String(currentPage));
  params.set("limit", String(pageLimit));

  errorMessage.hidden = true;

  itemGrid.replaceChildren(
    createTextElement(
      "p",
      "loading-message",
      "Loading campus items..."
    )
  );

  try {
    const response = await fetch(`/api/items?${params.toString()}`, {
      signal: controller.signal
    });

    const result = await response.json();

    if (!response.ok || result.success !== true) {
      throw new Error(
        result.message || "Unable to load campus items."
      );
    }

    if (!Array.isArray(result.data) || !result.pagination) {
      throw new Error("The server returned an unexpected response.");
    }

    // Ignore stale responses from cancelled requests.
    if (currentRequest !== controller) {
      return;
    }

    const pagination = result.pagination;

    displayItems(
      result.data,
      pagination.totalItems
    );

    updatePagination(pagination);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    if (currentRequest !== controller) {
      return;
    }

    itemGrid.replaceChildren();
    itemCount.textContent = "Unavailable";
    pageInfo.textContent = "Unavailable";
    previousPageButton.disabled = true;
    nextPageButton.disabled = true;

    errorMessage.textContent =
      "Could not load items. Please check that the server and database are running.";

    errorMessage.hidden = false;

    console.error("Failed to load items:", error);
  } finally {
    if (currentRequest === controller) {
      currentRequest = null;
    }
  }
}

// ==========================================
// 9. SEARCH AND FILTER EVENTS
// ==========================================

function resetPageAndLoadItems() {
  currentPage = 1;
  loadItems();
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    resetPageAndLoadItems();
  }, 300);
});

typeFilter.addEventListener("change", resetPageAndLoadItems);

categoryFilter.addEventListener("change", resetPageAndLoadItems);

sortFilter.addEventListener("change", resetPageAndLoadItems);

// ==========================================
// 10. PAGINATION EVENTS
// ==========================================

previousPageButton.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    loadItems();
  }
});

nextPageButton.addEventListener("click", () => {
  if (currentPage < totalPages) {
    currentPage++;
    loadItems();
  }
});

// ==========================================
// 11. REPORT FORM SUBMISSION
// ==========================================

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!reportForm.checkValidity()) {
    reportForm.reportValidity();
    return;
  }

  const formData = new FormData(reportForm);
  const itemData = Object.fromEntries(formData.entries());

  // Normalize the optional image URL.
  itemData.imageUrl = itemData.imageUrl.trim();

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  formMessage.hidden = true;
  formMessage.className = "form-message";

  try {
    const response = await fetch("/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(itemData)
    });

    const result = await response.json();

    if (!response.ok || result.success !== true) {
      throw new Error(
        result.message || "Unable to submit your report."
      );
    }

    formMessage.textContent =
      "Your report was submitted successfully!";

    formMessage.classList.add("success");
    formMessage.hidden = false;

    reportForm.reset();

    // Restore the default sort and clear filters so the new
    // report can appear in the refreshed listing.
    searchInput.value = "";
    typeFilter.value = "";
    categoryFilter.value = "";
    sortFilter.value = "newest";
    currentPage = 1;

    await loadItems();
  } catch (error) {
    formMessage.textContent =
      error.message || "Something went wrong. Please try again.";

    formMessage.classList.add("error");
    formMessage.hidden = false;

    console.error("Report submission failed:", error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Report";
  }
});

// ==========================================
// 12. INITIALIZE THE PAGE
// ==========================================

loadItems();
