
"use strict";

// ==========================================
// 1. HTML ELEMENT REFERENCEarticle
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
// Notification elements
const notificationsNav = document.getElementById("notifications-nav");
const notificationsSection = document.getElementById("notifications");
const notificationCount = document.getElementById("notification-count");
const notificationList = document.getElementById("notification-list");

// My Claims elements
const myClaimsNav = document.getElementById("my-claims-nav");
const myClaimsSection = document.getElementById("my-claims");
const myClaimsList = document.getElementById("my-claims-list");

const refreshMyClaimsButton = document.getElementById(
  "refresh-my-claims"
);

const myClaimsMessage = document.getElementById("my-claims-message");

const refreshNotificationsButton = document.getElementById(
  "refresh-notifications"
);

const notificationMessage = document.getElementById("notification-message");

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
async function patchJson(url, data = {}) {
  const csrfToken = await getCsrfToken();

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    credentials: "same-origin",
    body: JSON.stringify(data),
  });

  return readJsonResponse(response);
}


async function postForm(url, formData) {
  // Fetch a fresh CSRF token for this state-changing request.
  const csrfToken = await getCsrfToken();

  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "x-csrf-token": csrfToken
    },
    body: formData
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
    updateNotificationsVisibility();
    updateMyClaimsVisibility();
}

function updateNotificationsVisibility() {
  const isLoggedIn = Boolean(currentUser);

  if (notificationsNav) {
    notificationsNav.hidden = !isLoggedIn;
  }

  if (notificationsSection) {
    notificationsSection.hidden = !isLoggedIn;
  }
}

function updateMyClaimsVisibility() {
  const isLoggedIn = Boolean(currentUser);

  if (myClaimsNav) {
    myClaimsNav.hidden = !isLoggedIn;
  }

  if (myClaimsSection) {
    myClaimsSection.hidden = !isLoggedIn;
  }
}

function updateNotificationCount(notifications) {
  if (!notificationCount) return;

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  notificationCount.textContent = unreadCount;

  notificationCount.hidden = unreadCount === 0;
}

function createNotificationCard(notification) {
  const card = document.createElement("article");
  card.className = "notification-card";

  if (!notification.isRead) {
    card.classList.add("unread");
  }

  const message = document.createElement("p");
  message.textContent = notification.message;

  const date = document.createElement("small");
  date.textContent = formatDate(notification.createdAt);

  card.append(message, date);

  if (!notification.isRead) {
    const markReadButton = document.createElement("button");

    markReadButton.type = "button";
    markReadButton.textContent = "Mark as read";
    markReadButton.className = "button button-secondary";

    markReadButton.addEventListener("click", async () => {
      markReadButton.disabled = true;

      try {
        await patchJson(
          `/api/notifications/${encodeURIComponent(notification._id)}/read`
        );

        notification.isRead = true;
        await loadNotifications();
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
        markReadButton.disabled = false;
      }
    });

    card.appendChild(markReadButton);
  }

  return card;
}

async function loadNotifications() {
  if (!currentUser || !notificationList) return;

  notificationList.textContent = "Loading notifications...";

  try {
    const response = await fetch("/api/notifications", {
      method: "GET",
      credentials: "same-origin",
    });

    const result = await readJsonResponse(response);

    if (!result.success) {
      throw new Error(result.message || "Unable to load notifications.");
    }

    const notifications = result.data || [];

    notificationList.replaceChildren();

    if (notifications.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.textContent = "You have no notifications.";
      notificationList.appendChild(emptyMessage);
    } else {
      notifications.forEach((notification) => {
        notificationList.appendChild(
          createNotificationCard(notification)
        );
      });
    }

    updateNotificationCount(notifications);
  } catch (error) {
    console.error("Failed to load notifications:", error);
    notificationList.textContent =
      "Unable to load notifications. Please try again.";
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

    await loadNotifications();
    await loadItems();

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
    await loadItems();

      if (notificationList) {
      notificationList.replaceChildren();
    }

    if (notificationCount) {
      notificationCount.textContent = "0";
      notificationCount.hidden = true;
    }

    if (notificationMessage) {
      notificationMessage.textContent = "";
      notificationMessage.hidden = true;
    }

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
    await loadNotifications();
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

  // Display the uploaded image when available.
  if (
    typeof item.imageUrl === "string" &&
    item.imageUrl.startsWith("https://")
  ) {
    const image = document.createElement("img");

    image.className = "item-card-image";
    image.src = item.imageUrl;
    image.alt = item.title
      ? `Image of ${item.title}`
      : "Reported item image";
    image.loading = "lazy";

    image.addEventListener("error", () => {
      image.remove();
    });

    article.append(image);
  }

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

  // Identify the item owner and current user.
  const currentUserId = String(
    currentUser?.id || currentUser?._id || ""
  );

  const itemOwnerId = String(
    item.owner?._id || item.owner || ""
  );

  // Allow claims only on active found items
  // that do not belong to the logged-in user.
  const canClaim =
    item.type === "found" &&
    item.status === "active" &&
    (!currentUser || itemOwnerId !== currentUserId);

  if (canClaim) {
    const claimButton = createTextElement(
      "button",
      "claim-button",
      "Claim This Item"
    );

    claimButton.type = "button";

    claimButton.addEventListener("click", () => {
      if (!currentUser) {
        showAuthSection();

        showMessage(
          authMessage,
          "Please log in to submit an item claim.",
          "error"
        );

        return;
      }

      if (content.querySelector(".claim-form")) {
        return;
      }

      const claimForm = document.createElement("form");
      claimForm.className = "claim-form";

      const claimLabel = createTextElement(
        "label",
        "",
        "Explain why this item belongs to you"
      );

      const claimInput = document.createElement("textarea");
      claimInput.name = "message";
      claimInput.placeholder =
        "Describe identifying details or proof of ownership...";
      claimInput.minLength = 10;
      claimInput.maxLength = 1000;
      claimInput.required = true;
      claimInput.rows = 4;

      const claimMessage = createTextElement(
        "p",
        "form-message",
        ""
      );

      claimMessage.hidden = true;
      claimMessage.setAttribute("role", "status");

      const actions = document.createElement("div");
      actions.className = "claim-actions";

      const submitClaimButton = createTextElement(
        "button",
        "claim-submit-button",
        "Submit Claim"
      );

      submitClaimButton.type = "submit";

      const cancelButton = createTextElement(
        "button",
        "claim-cancel-button",
        "Cancel"
      );

      cancelButton.type = "button";

      cancelButton.addEventListener("click", () => {
        claimForm.remove();
        claimButton.hidden = false;
      });

      actions.append(submitClaimButton, cancelButton);

      claimForm.append(
        claimLabel,
        claimInput,
        claimMessage,
        actions
      );

      claimButton.hidden = true;
      content.append(claimForm);

      claimInput.focus();

      claimForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const message = claimInput.value.trim();

        if (message.length < 10 || message.length > 1000) {
          showMessage(
            claimMessage,
            "Your explanation must contain 10–1000 characters.",
            "error"
          );

          return;
        }

        submitClaimButton.disabled = true;
        submitClaimButton.textContent = "Submitting...";

        hideMessage(claimMessage);

        try {
          const result = await postJson(
            `/api/items/${encodeURIComponent(item._id)}/claims`,
            { message }
          );

          showMessage(
            claimMessage,
            result.message || "Claim submitted successfully.",
            "success"
          );

          claimInput.disabled = true;
          submitClaimButton.remove();
          cancelButton.textContent = "Close";
          cancelButton.onclick = () => claimForm.remove();

        } catch (error) {
          showMessage(
            claimMessage,
            error.message || "Unable to submit your claim.",
            "error"
          );

          submitClaimButton.disabled = false;
          submitClaimButton.textContent = "Submit Claim";
        }
      });
    });

    content.append(claimButton);
  }

  // Only the owner of a found item can review its claims.
  const canReviewClaims =
    Boolean(currentUser) &&
    item.type === "found" &&
    itemOwnerId === currentUserId;

  if (canReviewClaims) {
    const reviewClaimsButton = createTextElement(
      "button",
      "button button-secondary review-claims-button",
      "Review Claims"
    );

    reviewClaimsButton.type = "button";

    reviewClaimsButton.addEventListener("click", () => {
      loadItemClaims(item._id, content);
    });

    content.append(reviewClaimsButton);
  }

  article.append(content);

  return article;
}


// Load claims submitted for an item.

// Load claims submitted by the logged-in user.
async function loadMyClaims() {
  if (!currentUser || !myClaimsList) {
    return;
  }

  myClaimsList.textContent = "Loading your claims...";

  try {
    const response = await fetch("/api/items/my-claims", {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    });

    const result = await readJsonResponse(response);

    myClaimsList.textContent = "";

    if (!result.data || result.data.length === 0) {
      myClaimsList.append(
        createTextElement("p", "", "You have not submitted any claims yet.")
      );
      return;
    }

    result.data.forEach((claim) => {
      const card = document.createElement("div");
      card.className = "claim-review-card";

      const item = claim.item;

      const title = createTextElement(
        "h3",
        "",
        item?.title || "Item details unavailable"
      );

      const itemType = createTextElement(
        "p",
        "",
        `Type: ${item?.type || "Unknown"}`
      );

      const itemStatus = createTextElement(
        "p",
        "",
        `Item status: ${item?.status || "Unavailable"}`
      );

      const owner = createTextElement(
        "p",
        "",
        `Item owner: ${claim.itemOwner?.name || "Unknown"}`
      );

      const claimStatus = createTextElement(
        "p",
        "claim-status",
        `Claim status: ${claim.status}`
      );

      card.append(title, itemType, itemStatus, owner, claimStatus);

      // Show recovery confirmation only for approved claims.
      if (claim.status === "approved") {
        const claimantStatus = createTextElement(
          "p",
          "",
          `Your confirmation: ${
            claim.returnConfirmedByClaimant ? "Confirmed" : "Pending"
          }`
        );

        const ownerStatus = createTextElement(
          "p",
          "",
          `Owner confirmation: ${
            claim.returnConfirmedByOwner ? "Confirmed" : "Pending"
          }`
        );

        card.append(claimantStatus, ownerStatus);

        if (
          claim.returnConfirmedByClaimant &&
          claim.returnConfirmedByOwner
        ) {
          card.append(
            createTextElement(
              "p",
              "claim-status",
              "Recovery completed successfully."
            )
          );
        } else if (
          item &&
          item.status === "claimed" &&
          !claim.returnConfirmedByClaimant
        ) {
          const confirmButton = createTextElement(
            "button",
            "button button-primary",
            "Confirm Item Received"
          );

          confirmButton.type = "button";

          confirmButton.addEventListener("click", async () => {
            if (
              !window.confirm(
                "Confirm that you have received the item from its owner?"
              )
            ) {
              return;
            }

            confirmButton.disabled = true;
            confirmButton.textContent = "Confirming...";

            try {
              const confirmation = await patchJson(
                `/api/items/${encodeURIComponent(item._id)}/claims/${encodeURIComponent(claim._id)}/confirm-recovery`,
                {}
              );

              showMessage(
                myClaimsMessage,
                confirmation.message ||
                  "Your recovery confirmation was recorded.",
                "success"
              );

              await loadMyClaims();
              await loadItems();
            } catch (error) {
              showMessage(
                myClaimsMessage,
                error.message || "Could not confirm recovery.",
                "error"
              );

              confirmButton.disabled = false;
              confirmButton.textContent = "Confirm Item Received";
            }
          });

          card.append(confirmButton);
        }
      }

      myClaimsList.append(card);
    });
  } catch (error) {
    myClaimsList.textContent = "";

    myClaimsList.append(
      createTextElement(
        "p",
        "form-message error",
        error.message || "Unable to load your claims."
      )
    );

    console.error("Load my claims error:", error);
  }
}

// Load claims submitted for an item.
async function loadItemClaims(itemId, content) {
  try {
    const result = await readJsonResponse(
      await fetch(
        `/api/items/${encodeURIComponent(itemId)}/claims`,
        {
          method: "GET",
          credentials: "same-origin",
        }
      )
    );

    // Avoid displaying the claims section more than once.
    const existingClaims = content.querySelector(".item-claims");

    if (existingClaims) {
      existingClaims.remove();
      return;
    }

    const claimsSection = document.createElement("div");
    claimsSection.className = "item-claims";

    const heading = createTextElement(
      "h4",
      "",
      `Claims (${result.count})`
    );

    claimsSection.append(heading);

    if (result.data.length === 0) {
      claimsSection.append(
        createTextElement("p", "", "No claims submitted yet.")
      );
    } else {
      result.data.forEach((claim) => {
        const claimCard = document.createElement("div");
        claimCard.className = "claim-review-card";

        const claimant = createTextElement(
          "p",
          "",
          `Claimant: ${claim.claimant?.name || "Unknown"}`
        );

        const message = createTextElement(
          "p",
          "",
          `Message: ${claim.message}`
        );

        const status = createTextElement(
          "p",
          "claim-status",
          `Status: ${claim.status}`
        );

        claimCard.append(claimant, message, status);


        // Show recovery confirmation details for approved claims.
        if (claim.status === "approved") {
          const claimantConfirmation = createTextElement(
            "p",
            "",
            `Claimant confirmation: ${
              claim.returnConfirmedByClaimant ? "Confirmed" : "Pending"
            }`
          );

          const ownerConfirmation = createTextElement(
            "p",
            "",
            `Your confirmation: ${
              claim.returnConfirmedByOwner ? "Confirmed" : "Pending"
            }`
          );

          claimCard.append(
            claimantConfirmation,
            ownerConfirmation
          );

          if (
            claim.returnConfirmedByClaimant &&
            claim.returnConfirmedByOwner
          ) {
            claimCard.append(
              createTextElement(
                "p",
                "claim-status",
                "Recovery completed successfully."
              )
            );
          } else if (!claim.returnConfirmedByOwner) {
            const confirmHandoverButton = createTextElement(
              "button",
              "button button-primary",
              "Confirm Handover"
            );

            confirmHandoverButton.type = "button";

            const recoveryMessage = createTextElement(
              "p",
              "form-message",
              ""
            );

            recoveryMessage.hidden = true;
            recoveryMessage.setAttribute("role", "status");

            confirmHandoverButton.addEventListener(
              "click",
              async () => {
                if (
                  !window.confirm(
                    "Confirm that you have handed over the item to the claimant?"
                  )
                ) {
                  return;
                }

                confirmHandoverButton.disabled = true;
                confirmHandoverButton.textContent = "Confirming...";

                try {
                  const response = await patchJson(
                    `/api/items/${encodeURIComponent(itemId)}/claims/${encodeURIComponent(claim._id)}/confirm-recovery`,
                    {}
                  );

                  showMessage(
                    recoveryMessage,
                    response.message ||
                      "Your handover confirmation was recorded.",
                    "success"
                  );

                  await loadItems();

                  // Refresh the claims section with updated confirmation status.
                  claimsSection.remove();
                  await loadItemClaims(itemId, content);
                } catch (error) {
                  showMessage(
                    recoveryMessage,
                    error.message || "Unable to confirm handover.",
                    "error"
                  );

                  confirmHandoverButton.disabled = false;
                  confirmHandoverButton.textContent = "Confirm Handover";
                }
              }
            );

            claimCard.append(
              confirmHandoverButton,
              recoveryMessage
            );
          }
        }


        // Only pending claims can be approved or rejected.
        if (claim.status === "pending") {
          const actions = document.createElement("div");
          actions.className = "claim-actions";

          const approveButton = createTextElement(
            "button",
            "button button-primary",
            "Approve"
          );

          approveButton.type = "button";

          const rejectButton = createTextElement(
            "button",
            "button button-secondary",
            "Reject"
          );

          rejectButton.type = "button";

          const reviewMessage = createTextElement(
            "p",
            "form-message",
            ""
          );

          reviewMessage.hidden = true;
          reviewMessage.setAttribute("role", "status");

          async function reviewClaim(action) {
            const actionText =
              action === "approve" ? "approve" : "reject";

            if (
              !window.confirm(
                `Are you sure you want to ${actionText} this claim?`
              )
            ) {
              return;
            }

            approveButton.disabled = true;
            rejectButton.disabled = true;

            try {
              const response = await patchJson(
                `/api/items/${encodeURIComponent(itemId)}/claims/${encodeURIComponent(claim._id)}/${action}`,
                {}
              );

              showMessage(
                reviewMessage,
                response.message || `Claim ${actionText}d successfully.`,
                "success"
              );

              // Refresh the claim list to display the updated status.
              const refreshButton = createTextElement(
                "button",
                "button button-secondary",
                "Refresh Claims"
              );

              refreshButton.type = "button";

              refreshButton.addEventListener("click", () => {
                claimsSection.remove();
                loadItemClaims(itemId, content);
              });

              actions.replaceChildren(refreshButton);
            } catch (error) {
              showMessage(
                reviewMessage,
                error.message || `Unable to ${actionText} claim.`,
                "error"
              );

              approveButton.disabled = false;
              rejectButton.disabled = false;
            }
          }

          approveButton.addEventListener("click", () => {
            reviewClaim("approve");
          });

          rejectButton.addEventListener("click", () => {
            reviewClaim("reject");
          });

          actions.append(approveButton, rejectButton);

          claimCard.append(actions, reviewMessage);
        }

        claimsSection.append(claimCard);
      });
    }

    content.append(claimsSection);
  } catch (error) {
    showMessage(
      authMessage,
      error.message || "Unable to load item claims.",
      "error"
    );
  }
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
  const imageFile = formData.get("image");

  if (!(imageFile instanceof File) || imageFile.size === 0) {
    showMessage(
      formMessage,
      "Please select an image to upload.",
      "error"
    );
    return;
  }

  // Keep the image out of the JSON item-creation request.
  const itemData = Object.fromEntries(formData.entries());
  delete itemData.image;

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  hideMessage(formMessage);

  let itemCreated = false;

  try {
    // Step 1: Create the item and obtain its database ID.
    const createResult = await postJson("/api/items", itemData);
    itemCreated = true;

    const itemId = createResult.data?._id;

    if (!itemId) {
      throw new Error(
        "Your report was created, but the item ID was not returned. Do not submit it again."
      );
    }

    // Step 2: Upload the image to the item's image endpoint.
    const imageFormData = new FormData();
    imageFormData.append("image", imageFile);

    await postForm(
      `/api/items/${encodeURIComponent(itemId)}/image`,
      imageFormData
    );

    showMessage(
      formMessage,
      "Your report and image were submitted successfully!",
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
    } else if (itemCreated) {
      showMessage(
        formMessage,
        `Your report was created, but the image upload may have failed: ${error.message} Do not submit the report again. Check the item listing before retrying the image upload.`,
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
// Notification event listeners
if (refreshNotificationsButton) {
  refreshNotificationsButton.addEventListener("click", () => {
    loadNotifications();
  });
}

// My Claims event listeners
if (refreshMyClaimsButton) {
  refreshMyClaimsButton.addEventListener("click", () => {
    hideMessage(myClaimsMessage);
    loadMyClaims();
  });
}

if (myClaimsNav) {
  myClaimsNav.addEventListener("click", () => {
    hideMessage(myClaimsMessage);
    loadMyClaims();
  });
}

if (notificationsNav) {
  notificationsNav.addEventListener("click", () => {
    loadNotifications();
  });
}
// ==========================================
// 19. INITIALIZE THE PAGE
// ==========================================


async function initializePage() {
  updateAuthenticationUI();

  // Step 1: Restore the logged-in user's session.
  await restoreSession();

  // Step 2: Load items after session restoration.
  await loadItems();
}
initializePage();