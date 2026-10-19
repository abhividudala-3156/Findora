
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

// Authentication elements
const authSection = document.getElementById("auth-section");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authDescription = document.getElementById("auth-description");
const authNameGroup = document.getElementById("auth-name-group");
const authNameInput = document.getElementById("auth-name");
const authEmailInput = document.getElementById("auth-email");
const authPasswordInput = document.getElementById("auth-password");
const authSubmitButton = document.getElementById("auth-submit");
const authMessage = document.getElementById("auth-message");
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const openAuthButton = document.getElementById("open-auth");
const closeAuthButton = document.getElementById("close-auth");
const userPanel = document.getElementById("user-panel");
const currentUserName = document.getElementById("current-user-name");
const logoutButton = document.getElementById("logout-button");

// ==========================================
// 2. APPLICATION STATE
// ==========================================

let currentPage = 1;
const pageLimit = 9;
let totalPages = 0;
let searchTimer;
let currentRequest = null;

let currentUser = null;
let authMode = "login";

// ==========================================
// 3. DATE INPUT
// ==========================================

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

if (dateInput) {
  dateInput.max = getLocalDateString();
}

// ==========================================
// 4. SAFE HTML ELEMENT CREATION
// ==========================================

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// ==========================================
// 5. API RESPONSE HELPERS
// ==========================================

async function readJsonResponse(response) {
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok || result.success !== true) {
    const error = new Error(
      result.message || `Request failed (${response.status}).`
    );

    error.status = response.status;
    throw error;
  }

  return result;
}

async function getCsrfToken() {
  const response = await fetch("/api/auth/csrf-token", {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const result = await readJsonResponse(response);

  if (
    typeof result.csrfToken !== "string" ||
    result.csrfToken.length === 0
  ) {
    throw new Error("The server did not provide a CSRF token.");
  }

  return result.csrfToken;
}

async function postJson(url, data) {
  // Fetch a fresh token for every state-changing request.
  const csrfToken = await getCsrfToken();

  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify(data)
  });

  return readJsonResponse(response);
}

// ==========================================
// 6. MESSAGE HELPERS
// ==========================================

function showMessage(element, message, type = "") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = "form-message";

  if (type) {
    element.classList.add(type);
  }

  element.hidden = false;
}

function hideMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.hidden = true;
  element.className = "form-message";
}

// ==========================================
// 7. AUTHENTICATION INTERFACE
// ==========================================

function updateAuthenticationUI() {
  if (currentUser) {
    openAuthButton.hidden = true;
    userPanel.hidden = false;

    currentUserName.textContent =
      `Welcome, ${currentUser.name}`;

    // Only authenticated users can submit reports.
    submitButton.disabled = false;
  } else {
    openAuthButton.hidden = false;
    userPanel.hidden = true;

    currentUserName.textContent = "";

    // Do not permanently disable the report button:
    // clicking it will open the login interface.
    submitButton.disabled = false;
  }
}

function showAuthSection() {
  authSection.hidden = false;

  authSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function hideAuthSection() {
  authSection.hidden = true;
  hideMessage(authMessage);
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  const registering = authMode === "register";

  authTitle.textContent = registering
    ? "Create your Findora account"
    : "Welcome to Findora";

  authDescription.textContent = registering
    ? "Register to report lost and found campus items."
    : "Sign in to report lost or found items.";

  authNameGroup.hidden = !registering;
  authNameInput.required = registering;

  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);

  loginTab.setAttribute("aria-pressed", String(!registering));
  registerTab.setAttribute("aria-pressed", String(registering));

  authSubmitButton.textContent = registering
    ? "Create Account"
    : "Login";

  authPasswordInput.autocomplete = registering
    ? "new-password"
    : "current-password";

  hideMessage(authMessage);
}

openAuthButton.addEventListener("click", () => {
  setAuthMode("login");
  showAuthSection();
});

closeAuthButton.addEventListener("click", hideAuthSection);

loginTab.addEventListener("click", () => {
  setAuthMode("login");
});

registerTab.addEventListener("click", () => {
  setAuthMode("register");
});

// ==========================================
// 8. LOGIN AND REGISTRATION
// ==========================================

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!authForm.checkValidity()) {
    authForm.reportValidity();
    return;
  }

  const registering = authMode === "register";

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  const payload = {
    email,
    password
  };

  if (registering) {
    payload.name = authNameInput.value.trim();
  }

  authSubmitButton.disabled = true;
  authSubmitButton.textContent = registering
    ? "Creating account..."
    : "Signing in...";

  hideMessage(authMessage);

  try {
    if (registering) {
      await postJson("/api/auth/register", payload);

      // Registration does not automatically sign the user in.
      authPasswordInput.value = "";

      setAuthMode("login");
      authEmailInput.value = email;

      showMessage(
        authMessage,
        "Account created successfully. Please log in.",
        "success"
      );

      return;
    }

    const result = await postJson("/api/auth/login", payload);

    currentUser = result.user;

    updateAuthenticationUI();
    hideAuthSection();

    authForm.reset();
    setAuthMode("login");

    showMessage(
      formMessage,
      "You are now logged in and can report an item.",
      "success"
    );

    // The login endpoint regenerates the session.
    // postJson fetches a fresh CSRF token for the next POST.
  } catch (error) {
    const message = error.status === 429
      ? "Too many attempts. Please wait before trying again."
      : error.message || "Authentication failed. Please try again.";

    showMessage(authMessage, message, "error");

    console.error("Authentication failed:", error);
  } finally {
    authSubmitButton.disabled = false;

    authSubmitButton.textContent =
      authMode === "register" ? "Create Account" : "Login";
  }
});

// ==========================================
// 9. LOGOUT
// ==========================================

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = "Logging out...";

  try {
    await postJson("/api/auth/logout", {});

    currentUser = null;
    updateAuthenticationUI();

    showMessage(
      formMessage,
      "You have been logged out.",
      "success"
    );
  } catch (error) {
    showMessage(
      formMessage,
      error.message || "Logout failed. Please try again.",
      "error"
    );

    console.error("Logout failed:", error);
  } finally {
    logoutButton.disabled = false;
    logoutButton.textContent = "Logout";
  }
});

// ==========================================
// 10. RESTORE THE CURRENT SESSION
// ==========================================

async function restoreSession() {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (response.status === 401) {
      currentUser = null;
      updateAuthenticationUI();
      return;
    }

    const result = await readJsonResponse(response);

    currentUser = result.user;
    updateAuthenticationUI();
  } catch (error) {
    // A temporary session-check failure should not prevent
    // public listings from loading.
    console.error("Could not restore the session:", error);
  }
}

// ==========================================
// 11. DATE FORMATTING
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
// 12. CREATE AN ITEM CARD
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
// 13. DISPLAY ITEMS
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
// 14. PAGINATION
// ==========================================

function updatePagination(pagination) {
  currentPage = pagination.page;
  totalPages = pagination.totalPages;

  pageInfo.textContent = totalPages > 0
    ? `Page ${currentPage} of ${totalPages}`
    : "No pages";

  previousPageButton.disabled = currentPage <= 1;
  nextPageButton.disabled =
    totalPages === 0 || currentPage >= totalPages;
}

// ==========================================
// 15. LOAD ITEMS
// ==========================================

async function loadItems() {
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

  if (search) params.set("search", search);
  if (type) params.set("type", type);
  if (category) params.set("category", category);
  if (sort) params.set("sort", sort);

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
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });

    const result = await readJsonResponse(response);

    if (!Array.isArray(result.data) || !result.pagination) {
      throw new Error("The server returned an unexpected response.");
    }

    if (currentRequest !== controller) {
      return;
    }

    displayItems(result.data, result.pagination.totalItems);
    updatePagination(result.pagination);
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
// 16. SEARCH AND FILTER EVENTS
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
// 17. PAGINATION EVENTS
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
// 18. REPORT FORM SUBMISSION
// ==========================================

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    setAuthMode("login");
    showAuthSection();

    showMessage(
      authMessage,
      "Please log in before submitting an item report.",
      "error"
    );

    return;
  }

  if (!reportForm.checkValidity()) {
    reportForm.reportValidity();
    return;
  }

  const formData = new FormData(reportForm);
  const itemData = Object.fromEntries(formData.entries());

  // Normalize the optional image URL.
  itemData.imageUrl = (itemData.imageUrl || "").trim();

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  hideMessage(formMessage);

  try {
    await postJson("/api/items", itemData);

    showMessage(
      formMessage,
      "Your report was submitted successfully!",
      "success"
    );

    reportForm.reset();

    // Preserve the current date restriction after reset.
    if (dateInput) {
      dateInput.max = getLocalDateString();
    }

    searchInput.value = "";
    typeFilter.value = "";
    categoryFilter.value = "";
    sortFilter.value = "newest";
    currentPage = 1;

    await loadItems();
  } catch (error) {
    if (error.status === 401) {
      currentUser = null;
      updateAuthenticationUI();

      setAuthMode("login");
      showAuthSection();

      showMessage(
        authMessage,
        "Your session may have expired. Please log in again.",
        "error"
      );
    } else {
      showMessage(
        formMessage,
        error.message || "Something went wrong. Please try again.",
        "error"
      );
    }

    console.error("Report submission failed:", error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Report";
  }
});

// ==========================================
// 19. INITIALIZE THE PAGE
// ==========================================

async function initializePage() {
  updateAuthenticationUI();

  // Load public listings immediately; session restoration
  // happens alongside it.
  const sessionCheck = restoreSession();
  const itemLoad = loadItems();

  await Promise.allSettled([sessionCheck, itemLoad]);
}

initializePage();
