
import {
  describe,
  it,
  before,
  beforeEach,
  after,
  mock,
} from "node:test";

import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import sharp from "sharp";
import path from "node:path";
import { readdir } from "node:fs/promises";

import app from "../src/app.js";
import { connectDB } from "../src/config/database.js";
import Item from "../src/models/Item.js";
import User from "../src/models/User.js";
import { sessionStore } from "../src/config/session.js";
import { removeUploadedFile } from "../src/middleware/imageUpload.js";

import {
  setCloudinaryOperationsForTesting,
  resetCloudinaryOperationsForTesting,
} from "../src/services/cloudinaryImageService.js";

import Claim from "../src/models/Claim.js";

import Notification from "../src/models/Notification.js";

let agent;
let csrfToken;
let currentUserId;

// --------------------------------------------------
// TEST HELPERS
// --------------------------------------------------

function recentPastDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);

  return date.toISOString().slice(0, 10);
}

function createValidItem(overrides = {}) {
  return {
    title: "Lost student notebook",
    description:
      "A blue notebook lost near the university library.",
    type: "lost",
    category: "stationery",
    campusLocation: "University Library",
    dateOccurred: recentPastDate(),
    contactName: "Test Student",
    contactEmail: "teststudent@example.com",
    ...overrides,
  };
}

async function createTestImage() {
  return sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: { r: 30, g: 100, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
}

// Create a session, register a user, and log in.
async function createLoggedInAgent(email) {
  const userAgent = request.agent(app);

  let response = await userAgent.get("/api/auth/csrf-token");

  assert.equal(response.status, 200);

  let token = response.body.csrfToken;

  response = await userAgent
    .post("/api/auth/register")
    .set("x-csrf-token", token)
    .send({
      name: "API Test Student",
      email,
      password: "SecurePass123!",
    });

  assert.equal(
    response.status,
    201,
    `Registration failed: ${JSON.stringify(response.body)}`
  );

  response = await userAgent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({
      email,
      password: "SecurePass123!",
    });

  assert.equal(
    response.status,
    200,
    `Login failed: ${JSON.stringify(response.body)}`
  );

  // Login regenerates the session.
  // Obtain a CSRF token for the new session.
  response = await userAgent.get("/api/auth/csrf-token");

  assert.equal(response.status, 200);


  token = response.body.csrfToken;

  assert.ok(token);

  // Get the authenticated user's actual ID.
  response = await userAgent.get("/api/auth/me");

  assert.equal(response.status, 200);
  assert.ok(response.body.user?.id);

  return {
    agent: userAgent,
    csrfToken: token,
    userId: response.body.user.id,
  };

}

// Create an item using the authenticated test user.
async function createItem(overrides = {}) {
  const response = await agent
    .post("/api/items")
    .set("x-csrf-token", csrfToken)
    .send(createValidItem(overrides));

  assert.equal(
    response.status,
    201,
    `Item creation failed: ${JSON.stringify(response.body)}`
  );

  const approvedItem = await Item.findByIdAndUpdate(
    response.body.data._id,
    { $set: { moderationStatus: "approved" } },
    { returnDocument: "after" }
  );

  return approvedItem.toObject();
}

// Create an anonymous session with a valid CSRF token.
async function createAnonymousAgent() {
  const anonymousAgent = request.agent(app);

  const response = await anonymousAgent.get("/api/auth/csrf-token");

  assert.equal(response.status, 200);
  assert.ok(response.body.csrfToken);

  return {
    agent: anonymousAgent,
    csrfToken: response.body.csrfToken,
  };
}

// --------------------------------------------------
// API TEST SUITE
// --------------------------------------------------

describe("Findora API", () => {
  // --------------------------------------------------
  // DATABASE SETUP
  // --------------------------------------------------

  before(async () => {
     setCloudinaryOperationsForTesting({
        upload: async () => ({
          secure_url:
            "https://res.cloudinary.com/findora-test/image/upload/v123/findora/items/test-image.jpg",
          public_id: "findora/items/test-image",
        }),
        destroy: async () => ({
          result: "ok",
        }),
      });
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error(
        "MONGODB_URI is missing. Configure .env.test before running tests."
      );
    }

    let databaseName;

    try {
      databaseName = new URL(uri).pathname.replace(/^\//, "");
    } catch {
      throw new Error(
        "MONGODB_URI must be a valid MongoDB connection URI."
      );
    }

    if (databaseName !== "campus_lost_found_test") {
      throw new Error(
        "Tests must use the campus_lost_found_test database."
      );
    }

    await connectDB();
  });

  beforeEach(async () => {
    // Clear records only in the guarded test database.
    await Notification.deleteMany({});
    await Item.deleteMany({});
    await User.deleteMany({});
    await Claim.deleteMany({});

    const testSession = await createLoggedInAgent(
      "api-test@example.com"
    );

    agent = testSession.agent;
    csrfToken = testSession.csrfToken;

    const meResponse = await agent.get("/api/auth/me");

    assert.equal(meResponse.status, 200);
    assert.ok(meResponse.body.user?.id);

    currentUserId = meResponse.body.user.id.toString();
  });

  after(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await Notification.deleteMany({});
        await Item.deleteMany({});
        await User.deleteMany({});
        await Claim.deleteMany({});
      }
        } finally {
      try {
        await sessionStore.close();
      } finally {
        try {
          await mongoose.disconnect();
        } finally {
          resetCloudinaryOperationsForTesting();
        }
      }
    }
  });

  // --------------------------------------------------
  // CREATE AND AUTHENTICATION
  // --------------------------------------------------

  it("should create a new lost item", async () => {
    const input = createValidItem();

    const response = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(input);

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.title, input.title);
    assert.equal(response.body.data.type, input.type);
    assert.ok(response.body.data.owner);

    assert.equal(
      response.body.data.owner.toString(),
      currentUserId.toString()
    );
  });

  it("should reject item creation without authentication", async () => {
    const anonymous = await createAnonymousAgent();

    const response = await anonymous.agent
      .post("/api/items")
      .set("x-csrf-token", anonymous.csrfToken)
      .send(createValidItem());

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });
    it("should reject item creation without a CSRF token", async () => {
    const response = await agent
      .post("/api/items")
      .send(createValidItem());

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  });

  it("should reject item creation with an invalid CSRF token", async () => {
    const response = await agent
      .post("/api/items")
      .set("x-csrf-token", "invalid-csrf-token")
      .send(createValidItem());

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  });

  it("should assign ownership from the session, not the request body", async () => {
    const anotherUserId = new mongoose.Types.ObjectId().toString();

    const response = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(
        createValidItem({
          owner: anotherUserId,
        })
      );

    assert.equal(response.status, 201);

    assert.equal(
      response.body.data.owner.toString(),
      currentUserId
    );

    assert.notEqual(
      response.body.data.owner.toString(),
      anotherUserId
    );
  });

  it("should reject an item with an invalid category", async () => {
    const response = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem({ category: "invalid-category" }));

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject a title that is too short", async () => {
    const response = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem({ title: "A" }));

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject a description that is too short", async () => {
    const response = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem({ description: "Too short" }));

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject an item with an invalid type", async () => {
    const response = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem({ type: "missing" }));

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject an occurrence date in the future", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const response = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(
        createValidItem({
          dateOccurred: futureDate.toISOString(),
        })
      );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  // --------------------------------------------------
  // PUBLIC READ
  // --------------------------------------------------

  it("should retrieve an existing item by ID", async () => {
    const item = await createItem();

    const response = await request(app)
      .get(`/api/items/${item._id}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(
  response.body.data._id.toString(),
  item._id.toString()
);
    assert.equal(response.body.data.title, item.title);
  });

  it("should search items by title", async () => {
    const item = await createItem();

    const response = await request(app)
      .get("/api/items")
      .query({ search: "notebook" });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    assert.ok(
      response.body.data.some(
        (result) => result._id.toString() === item._id.toString()
      )
    );
  });

  it("should return pagination metadata", async () => {
    const response = await request(app)
      .get("/api/items")
      .query({ page: 1, limit: 5 });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.pagination.page, 1);
    assert.equal(response.body.pagination.limit, 5);
    assert.ok(Array.isArray(response.body.data));

    assert.equal(
      typeof response.body.pagination.totalItems,
      "number"
    );

    assert.equal(
      typeof response.body.pagination.totalPages,
      "number"
    );
  });

  it("should reject an invalid page number", async () => {
    const response = await request(app)
      .get("/api/items")
      .query({ page: 0, limit: 5 });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject an invalid item ID", async () => {
    const response = await request(app)
      .get("/api/items/invalid-id");

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should return 404 for a nonexistent item ID", async () => {
    const id = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .get(`/api/items/${id}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
  });

  it("should return no items for a search with no matches", async () => {
    const response = await request(app)
      .get("/api/items")
      .query({
        search: "unique-no-match-findora-test",
        status: "all",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.data, []);
  });

  // --------------------------------------------------
  // FILTERS
  // --------------------------------------------------

  it("should filter items by type", async () => {
    await createItem({ type: "lost" });

    await createItem({
      title: "Found campus pen",
      type: "found",
    });

    const response = await request(app)
      .get("/api/items")
      .query({ type: "lost", status: "all" });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    assert.ok(
      response.body.data.every(
        (item) => item.type === "lost"
      )
    );
  });

  it("should filter items by category", async () => {
    await createItem({ category: "stationery" });

    await createItem({
      title: "Found campus electronics",
      category: "electronics",
    });

    const response = await request(app)
      .get("/api/items")
      .query({
        category: "stationery",
        status: "all",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    assert.ok(
      response.body.data.every(
        (item) => item.category === "stationery"
      )
    );
  });

  // --------------------------------------------------
  // UPDATE AND OWNERSHIP
  // --------------------------------------------------

  it("should allow the owner to update an item", async () => {
    const item = await createItem();

    const response = await agent
      .patch(`/api/items/${item._id}`)
      .set("x-csrf-token", csrfToken)
      .send({
        title: "Found blue campus notebook",
        type: "found",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    assert.equal(
      response.body.data.title,
      "Found blue campus notebook"
    );

    assert.equal(
      response.body.data.owner.toString(),
      currentUserId
    );
  });

    it("should reject item updates without a CSRF token", async () => {
    const item = await createItem();

    const response = await agent
      .patch(`/api/items/${item._id}`)
      .send({ title: "Changed without CSRF token" });

    assert.equal(response.status, 403);

    const savedItem = await Item.findById(item._id);
    assert.equal(savedItem.title, item.title);
  });

  it("should reject updates without authentication", async () => {
    const item = await createItem();
    const anonymous = await createAnonymousAgent();

    const response = await anonymous.agent
      .patch(`/api/items/${item._id}`)
      .set("x-csrf-token", anonymous.csrfToken)
      .send({ title: "Unauthorized title change" });

    assert.equal(response.status, 401);
  });

  it("should prevent another user from updating an item", async () => {
    const item = await createItem();

    const anotherUser = await createLoggedInAgent(
      "another-user@example.com"
    );

    const response = await anotherUser.agent
      .patch(`/api/items/${item._id}`)
      .set("x-csrf-token", anotherUser.csrfToken)
      .send({ title: "Unauthorized title change" });

    assert.equal(response.status, 403);

    const unchangedItem = await Item.findById(item._id);

    assert.equal(unchangedItem.title, item.title);

    assert.equal(
      unchangedItem.owner.toString(),
      currentUserId
    );
  });

  it("should reject an update with no fields", async () => {
    const item = await createItem();

    const response = await agent
      .patch(`/api/items/${item._id}`)
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should not allow ownership to be changed during an update", async () => {
    const item = await createItem();

    const anotherUserId = new mongoose.Types.ObjectId().toString();

    const response = await agent
      .patch(`/api/items/${item._id}`)
      .set("x-csrf-token", csrfToken)
      .send({
        title: "Updated notebook title",
        owner: anotherUserId,
      });

    assert.equal(response.status, 200);

    assert.equal(
      response.body.data.owner.toString(),
      currentUserId
    );
  });

  // --------------------------------------------------
  // DELETE AND OWNERSHIP
  // --------------------------------------------------

  it("should allow the owner to delete an item", async () => {
    const item = await createItem();

    const deleteResponse = await agent
      .delete(`/api/items/${item._id}`)
      .set("x-csrf-token", csrfToken);

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.body.success, true);

    const getResponse = await request(app)
      .get(`/api/items/${item._id}`);

    assert.equal(getResponse.status, 404);
  });

  it("should reject deletion without authentication", async () => {
    const item = await createItem();
    const anonymous = await createAnonymousAgent();

    const response = await anonymous.agent
      .delete(`/api/items/${item._id}`)
      .set("x-csrf-token", anonymous.csrfToken);

    assert.equal(response.status, 401);

    assert.ok(await Item.findById(item._id));
  });

  it("should prevent another user from deleting an item", async () => {
    const item = await createItem();

    const anotherUser = await createLoggedInAgent(
      "delete-test-user@example.com"
    );

    const response = await anotherUser.agent
      .delete(`/api/items/${item._id}`)
      .set("x-csrf-token", anotherUser.csrfToken);

    assert.equal(response.status, 403);

    const existingItem = await Item.findById(item._id);

    assert.ok(existingItem);

    assert.equal(
      existingItem.owner.toString(),
      currentUserId
    );
  });
  // --------------------------------------------------
  // IMAGE UPLOAD AND RETRIEVAL
  // --------------------------------------------------
  it("should upload and retrieve a valid JPEG image", async () => {

    const item = await createItem();
    const imageBuffer = await createTestImage();
    const uploadResponse = await agent
      .post(`/api/items/${item._id}/image`)
      .set("x-csrf-token", csrfToken)
      .attach("image", imageBuffer, {
        filename: "test-image.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(
      uploadResponse.status,
      200,
      JSON.stringify(uploadResponse.body)
    );

    assert.equal(uploadResponse.body.success, true);

    const expectedImageUrl =
      "https://res.cloudinary.com/findora-test/image/upload/v123/findora/items/test-image.jpg";

    assert.equal(
      uploadResponse.body.data.imageUrl,
      expectedImageUrl
    );

    const savedItem = await Item.findById(item._id);

    savedItem.moderationStatus = "approved";
await savedItem.save();

    assert.equal(savedItem.imageUrl, expectedImageUrl);
    assert.equal(savedItem.imagePublicId, "findora/items/test-image");
    assert.equal(savedItem.imageFilename, "");

    const imageResponse = await request(app)
      .get(`/api/items/${item._id}/image`);

    assert.equal(imageResponse.status, 302);
    assert.equal(
      imageResponse.headers.location,
      expectedImageUrl
    );
  });
  it("should remove temporary files when Cloudinary upload fails", async () => {
  const item = await createItem();
  const imageBuffer = await createTestImage();

  setCloudinaryOperationsForTesting({
    upload: async () => {
      throw new Error("Cloudinary upload failed");
    },
    destroy: async () => ({
      result: "ok",
    }),
  });

  try {
    const response = await agent
      .post(`/api/items/${item._id}/image`)
      .set("x-csrf-token", csrfToken)
      .attach("image", imageBuffer, {
        filename: "test-image.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(response.status, 500);
    assert.equal(response.body.success, false);

    const temporaryFiles = await readdir(
      path.resolve("tmp", "uploads")
    );

    assert.equal(
      temporaryFiles.some((filename) =>
        filename.startsWith("processed-")
      ),
      false
    );
  } finally {
    resetCloudinaryOperationsForTesting();
  }
});
  it("should delete the Cloudinary image when MongoDB save fails", async () => {
    const item = await createItem();
    const imageBuffer = await createTestImage();
    const destroyedPublicIds = [];

    const originalSave = Item.prototype.save;

    setCloudinaryOperationsForTesting({
      upload: async () => ({
        secure_url:
          "https://res.cloudinary.com/findora-test/image/upload/v123/findora/items/save-failure.jpg",
        public_id: "findora/items/save-failure",
      }),

      destroy: async (publicId) => {
        destroyedPublicIds.push(publicId);
        return { result: "ok" };
      },
    });

    const saveMock = mock.method(
      Item.prototype,
      "save",
      async function (...args) {
        if (this._id.toString() === item._id.toString()) {
          throw new Error("Simulated MongoDB save failure");
        }

        return originalSave.apply(this, args);
      }
    );

    try {
      const response = await agent
        .post(`/api/items/${item._id}/image`)
        .set("x-csrf-token", csrfToken)
        .attach("image", imageBuffer, {
          filename: "test-image.jpg",
          contentType: "image/jpeg",
        });

      assert.equal(response.status, 500);
      assert.equal(response.body.success, false);

      assert.deepEqual(destroyedPublicIds, [
        "findora/items/save-failure",
      ]);

      const temporaryFiles = await readdir(
        path.resolve("tmp", "uploads")
      );

      assert.equal(
        temporaryFiles.some((filename) =>
          filename.startsWith("processed-")
        ),
        false
      );
    } finally {
      saveMock.mock.restore();
      resetCloudinaryOperationsForTesting();
    }
  });

  it("should reject image uploads without authentication", async () => {
    const item = await createItem();
    const anonymous = await createAnonymousAgent();
    const imageBuffer = await createTestImage();

    const response = await anonymous.agent
      .post(`/api/items/${item._id}/image`)
      .set("x-csrf-token", anonymous.csrfToken)
      .attach("image", imageBuffer, {
        filename: "test-image.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  it("should reject image uploads without a valid CSRF token", async () => {
    const item = await createItem();
    const imageBuffer = await createTestImage();

    const response = await agent
      .post(`/api/items/${item._id}/image`)
      .attach("image", imageBuffer, {
        filename: "test-image.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  });

  it("should prevent another user from uploading an item's image", async () => {
    const item = await createItem();

    const anotherUser = await createLoggedInAgent(
      "image-owner-test@example.com"
    );

    const imageBuffer = await createTestImage();

    const response = await anotherUser.agent
      .post(`/api/items/${item._id}/image`)
      .set("x-csrf-token", anotherUser.csrfToken)
      .attach("image", imageBuffer, {
        filename: "test-image.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);

    const unchangedItem = await Item.findById(item._id);

    assert.equal(unchangedItem.imageFilename, "");
  });

  it("should reject unsupported image MIME types", async () => {
    const item = await createItem();

    const response = await agent
      .post(`/api/items/${item._id}/image`)
      .set("x-csrf-token", csrfToken)
      .attach("image", Buffer.from("not an image"), {
        filename: "document.txt",
        contentType: "text/plain",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject a file that is not actually an image", async () => {
    const item = await createItem();

    const response = await agent
      .post(`/api/items/${item._id}/image`)
      .set("x-csrf-token", csrfToken)
      .attach("image", Buffer.from("not a real JPEG image"), {
        filename: "fake-image.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject images larger than 5 MB", async () => {
    const item = await createItem();

    const oversizedBuffer = Buffer.alloc(
      5 * 1024 * 1024 + 1
    );

    const response = await agent
      .post(`/api/items/${item._id}/image`)
      .set("x-csrf-token", csrfToken)
      .attach("image", oversizedBuffer, {
        filename: "oversized.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(response.status, 413);
    assert.equal(response.body.success, false);
  });

  it("should return 404 when an item has no uploaded image", async () => {
    const item = await createItem();

    const response = await request(app)
      .get(`/api/items/${item._id}/image`);

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
  });


  it("rejects claim submission without authentication", async () => {
    const item = await createItem();
    const anonymous = await createAnonymousAgent();

    const response = await anonymous.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", anonymous.csrfToken)
      .send({
        message: "I can identify this item by its unique marks.",
      });

    assert.equal(response.status, 401);
  });

  it("rejects a claim with an invalid item ID", async () => {
    const response = await agent
      .post("/api/items/not-an-id/claims")
      .set("x-csrf-token", csrfToken)
      .send({
        message: "I can identify this item by its unique marks.",
      });

    assert.equal(response.status, 400);
  });

  it("rejects a claim when the item does not exist", async () => {
    const nonexistentId = new mongoose.Types.ObjectId();

    const response = await agent
      .post(`/api/items/${nonexistentId}/claims`)
      .set("x-csrf-token", csrfToken)
      .send({
        message: "I can identify this item by its unique marks.",
      });

    assert.equal(response.status, 404);
  });

  it("rejects a claim explanation that is too short", async () => {
    const item = await createItem();

    // Use another authenticated student to avoid a self-claim.
    const other = await createLoggedInAgent(
      "claimant-test@example.com"
    );

    const response = await other.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", other.csrfToken)
      .send({ message: "Too short" });

    assert.equal(response.status, 400);
  });

  it("should create a pending claim for another student's item", async () => {
    const item = await createItem();

    // Sign in as a different student from the item owner.
    const claimant = await createLoggedInAgent(
      "valid-claimant@example.com"
    );

    const message =
      "I can identify the notebook by its unique blue cover and initials.";

    const response = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({ message });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, "pending");
    assert.equal(response.body.data.item.toString(), item._id.toString());
    assert.equal(response.body.data.claimant.toString(), claimant.userId.toString());
    assert.equal(response.body.data.itemOwner.toString(), currentUserId);
    assert.equal(response.body.data.message, message);

    const savedClaim = await Claim.findById(response.body.data._id);

    assert.ok(savedClaim);
    assert.equal(savedClaim.status, "pending");
    assert.equal(savedClaim.returnConfirmedByClaimant, false);
    assert.equal(savedClaim.returnConfirmedByOwner, false);

    // Verify that the item owner receives a notification.
    const notification = await Notification.findOne({
      recipient: currentUserId,
      claim: savedClaim._id,
      item: item._id,
    });

    assert.ok(notification);
    assert.equal(notification.type, "claim_submitted");
    assert.equal(notification.isRead, false);
    assert.match(notification.message, /new claim has been submitted/i);
      });
  it("should reject a duplicate pending claim", async () => {
  const item = await createItem();

  const claimant = await createLoggedInAgent(
    "duplicate-claimant@example.com"
  );

  const message =
    "I can identify this item by its unique marks and details.";

  const firstResponse = await claimant.agent
    .post(`/api/items/${item._id}/claims`)
    .set("x-csrf-token", claimant.csrfToken)
    .send({ message });

  assert.equal(firstResponse.status, 201);

  const secondResponse = await claimant.agent
    .post(`/api/items/${item._id}/claims`)
    .set("x-csrf-token", claimant.csrfToken)
    .send({ message });

  assert.equal(secondResponse.status, 409);
  assert.equal(secondResponse.body.success, false);

  const pendingClaims = await Claim.countDocuments({
    item: item._id,
    status: "pending",
  });

  assert.equal(pendingClaims, 1);
});
  it("allows only the item owner to view claims", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "privacy-claimant@example.com"
    );

    const message =
      "I can identify this item by its unique marks and details.";

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({ message });

    assert.equal(claimResponse.status, 201);

    // The item owner should be able to view the claim.
    const ownerResponse = await agent
      .get(`/api/items/${item._id}/claims`);

    assert.equal(ownerResponse.status, 200);
    assert.equal(ownerResponse.body.count, 1);
    assert.equal(ownerResponse.body.data.length, 1);

    // Another authenticated user must not view the claim.
    const anotherUser = await createLoggedInAgent(
      "privacy-outsider@example.com"
    );

    const outsiderResponse = await anotherUser.agent
      .get(`/api/items/${item._id}/claims`);

    assert.equal(outsiderResponse.status, 403);
    assert.equal(outsiderResponse.body.success, false);
  });

  it("returns only the logged-in claimant's own claims", async () => {
    const firstItem = await createItem();
    const secondItem = await createItem({
      title: "Found student identity card",
      type: "found",
    });

    const firstClaimant = await createLoggedInAgent(
      "first-privacy-claimant@example.com"
    );

    const secondClaimant = await createLoggedInAgent(
      "second-privacy-claimant@example.com"
    );

    const message =
      "I can identify this item by its unique marks and details.";

    const firstClaimResponse = await firstClaimant.agent
      .post(`/api/items/${firstItem._id}/claims`)
      .set("x-csrf-token", firstClaimant.csrfToken)
      .send({ message });

    assert.equal(firstClaimResponse.status, 201);

    const secondClaimResponse = await secondClaimant.agent
      .post(`/api/items/${secondItem._id}/claims`)
      .set("x-csrf-token", secondClaimant.csrfToken)
      .send({ message });

    assert.equal(secondClaimResponse.status, 201);

    // The first claimant should see only their own claim.
    const myClaimsResponse = await firstClaimant.agent
      .get("/api/items/my-claims");

    assert.equal(myClaimsResponse.status, 200);
    assert.equal(myClaimsResponse.body.count, 1);
    assert.equal(myClaimsResponse.body.data.length, 1);

    assert.equal(
      myClaimsResponse.body.data[0].claimant.toString(),
      firstClaimant.userId.toString()
    );

    assert.equal(
      myClaimsResponse.body.data[0].item._id.toString(),
      firstItem._id.toString()
    );
  });

  it("allows the item owner to approve a pending claim", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "approval-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const response = await agent
      .patch(`/api/items/${item._id}/claims/${claimId}/approve`)
      .set("x-csrf-token", csrfToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, "approved");

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.status, "approved");

    const savedItem = await Item.findById(item._id);
    assert.equal(savedItem.status, "claimed");

    // Verify that the claimant receives an approval notification.
    const notification = await Notification.findOne({
      recipient: claimant.userId,
      claim: claimId,
      item: item._id,
    });

    assert.ok(notification);
    assert.equal(notification.type, "claim_approved");
    assert.equal(notification.isRead, false);
    assert.match(notification.message, /claim.*approved/i);
  });


it("records claimant recovery confirmation without resolving the item early", async () => {
  const item = await createItem();

  const claimant = await createLoggedInAgent(
    "recovery-claimant@example.com"
  );

  const claimResponse = await claimant.agent
    .post(`/api/items/${item._id}/claims`)
    .set("x-csrf-token", claimant.csrfToken)
    .send({
      message:
        "I can identify this item by its unique marks and details.",
    });

  assert.equal(claimResponse.status, 201);

  const claimId = claimResponse.body.data._id;

  const approvalResponse = await agent
    .patch(`/api/items/${item._id}/claims/${claimId}/approve`)
    .set("x-csrf-token", csrfToken);

  assert.equal(approvalResponse.status, 200);

  const confirmationResponse = await claimant.agent
    .patch(
      `/api/items/${item._id}/claims/${claimId}/confirm-recovery`
    )
    .set("x-csrf-token", claimant.csrfToken);

  assert.equal(confirmationResponse.status, 200);
  assert.equal(confirmationResponse.body.success, true);
  assert.equal(confirmationResponse.body.data.recoveryComplete, false);
  assert.equal(confirmationResponse.body.data.itemStatus, "claimed");

  const savedClaim = await Claim.findById(claimId);
  assert.equal(savedClaim.returnConfirmedByClaimant, true);
  assert.equal(savedClaim.returnConfirmedByOwner, false);

  const savedItem = await Item.findById(item._id);
  assert.equal(savedItem.status, "claimed");
});


it("resolves the item after both parties confirm recovery", async () => {
  const item = await createItem();

  const claimant = await createLoggedInAgent(
    "recovery-complete-claimant@example.com"
  );

  const claimResponse = await claimant.agent
    .post(`/api/items/${item._id}/claims`)
    .set("x-csrf-token", claimant.csrfToken)
    .send({
      message:
        "I can identify this item by its unique marks and details.",
    });

  assert.equal(claimResponse.status, 201);

  const claimId = claimResponse.body.data._id;

  const approvalResponse = await agent
    .patch(`/api/items/${item._id}/claims/${claimId}/approve`)
    .set("x-csrf-token", csrfToken);

  assert.equal(approvalResponse.status, 200);

  // First, the claimant confirms recovery.
  const claimantConfirmation = await claimant.agent
    .patch(
      `/api/items/${item._id}/claims/${claimId}/confirm-recovery`
    )
    .set("x-csrf-token", claimant.csrfToken);

  assert.equal(claimantConfirmation.status, 200);
  assert.equal(claimantConfirmation.body.data.recoveryComplete, false);

  // Next, the owner confirms recovery.
  const ownerConfirmation = await agent
    .patch(
      `/api/items/${item._id}/claims/${claimId}/confirm-recovery`
    )
    .set("x-csrf-token", csrfToken);

  assert.equal(ownerConfirmation.status, 200);
  assert.equal(ownerConfirmation.body.data.recoveryComplete, true);
  assert.equal(ownerConfirmation.body.data.itemStatus, "resolved");

  const savedClaim = await Claim.findById(claimId);
  assert.equal(savedClaim.returnConfirmedByClaimant, true);
  assert.equal(savedClaim.returnConfirmedByOwner, true);

  const savedItem = await Item.findById(item._id);
  assert.equal(savedItem.status, "resolved");
});


it("prevents an unrelated user from confirming recovery", async () => {
  const item = await createItem();

  const claimant = await createLoggedInAgent(
    "recovery-auth-claimant@example.com"
  );

  const stranger = await createLoggedInAgent(
    "recovery-auth-stranger@example.com"
  );

  const claimResponse = await claimant.agent
    .post(`/api/items/${item._id}/claims`)
    .set("x-csrf-token", claimant.csrfToken)
    .send({
      message:
        "I can identify this item by its unique marks and details.",
    });

  assert.equal(claimResponse.status, 201);

  const claimId = claimResponse.body.data._id;

  const approvalResponse = await agent
    .patch(`/api/items/${item._id}/claims/${claimId}/approve`)
    .set("x-csrf-token", csrfToken);

  assert.equal(approvalResponse.status, 200);

  const response = await stranger.agent
    .patch(
      `/api/items/${item._id}/claims/${claimId}/confirm-recovery`
    )
    .set("x-csrf-token", stranger.csrfToken);

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);

  const savedClaim = await Claim.findById(claimId);
  assert.equal(savedClaim.returnConfirmedByClaimant, false);
  assert.equal(savedClaim.returnConfirmedByOwner, false);

  const savedItem = await Item.findById(item._id);
  assert.equal(savedItem.status, "claimed");
});


it("prevents a claimant from confirming recovery twice", async () => {
  const item = await createItem();

  const claimant = await createLoggedInAgent(
    "recovery-duplicate-claimant@example.com"
  );

  const claimResponse = await claimant.agent
    .post(`/api/items/${item._id}/claims`)
    .set("x-csrf-token", claimant.csrfToken)
    .send({
      message:
        "I can identify this item by its unique marks and details.",
    });

  assert.equal(claimResponse.status, 201);

  const claimId = claimResponse.body.data._id;

  const approvalResponse = await agent
    .patch(`/api/items/${item._id}/claims/${claimId}/approve`)
    .set("x-csrf-token", csrfToken);

  assert.equal(approvalResponse.status, 200);

  const recoveryUrl =
    `/api/items/${item._id}/claims/${claimId}/confirm-recovery`;

  const firstConfirmation = await claimant.agent
    .patch(recoveryUrl)
    .set("x-csrf-token", claimant.csrfToken);

  assert.equal(firstConfirmation.status, 200);

  const duplicateConfirmation = await claimant.agent
    .patch(recoveryUrl)
    .set("x-csrf-token", claimant.csrfToken);

  assert.equal(duplicateConfirmation.status, 409);
  assert.equal(duplicateConfirmation.body.success, false);

  const savedClaim = await Claim.findById(claimId);
  assert.equal(savedClaim.returnConfirmedByClaimant, true);
  assert.equal(savedClaim.returnConfirmedByOwner, false);

  const savedItem = await Item.findById(item._id);
  assert.equal(savedItem.status, "claimed");
});


  it("allows the item owner to reject a pending claim", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "rejection-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const response = await agent
      .patch(`/api/items/${item._id}/claims/${claimId}/reject`)
      .set("x-csrf-token", csrfToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, "rejected");

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.status, "rejected");

    // Verify that the claimant receives a rejection notification.
    const notification = await Notification.findOne({
      recipient: claimant.userId,
      claim: claimId,
      item: item._id,
    });

    assert.ok(notification);
    assert.equal(notification.type, "claim_rejected");
    assert.equal(notification.isRead, false);
    assert.match(notification.message, /claim.*rejected/i);

  });

  it("prevents another user from reviewing a claim", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "unauthorized-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const anotherUser = await createLoggedInAgent(
      "unauthorized-reviewer@example.com"
    );

    const response = await anotherUser.agent
      .patch(`/api/items/${item._id}/claims/${claimId}/approve`)
      .set("x-csrf-token", anotherUser.csrfToken);

    assert.equal(response.status, 403);

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.status, "pending");
  });
  it("prevents another user from rejecting a claim", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "unauthorized-rejection-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const anotherUser = await createLoggedInAgent(
      "unauthorized-rejection-reviewer@example.com"
    );

    const response = await anotherUser.agent
      .patch(`/api/items/${item._id}/claims/${claimId}/reject`)
      .set("x-csrf-token", anotherUser.csrfToken);

    assert.equal(response.status, 403);

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.status, "pending");
  });
  it("prevents a claimant from approving their own claim", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "self-approval-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const response = await claimant.agent
      .patch(`/api/items/${item._id}/claims/${claimId}/approve`)
      .set("x-csrf-token", claimant.csrfToken);

    assert.equal(response.status, 403);

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.status, "pending");
  });

  it("rejects an invalid claim ID during approval", async () => {
    const item = await createItem();

    const response = await agent
      .patch(`/api/items/${item._id}/claims/not-a-valid-id/approve`)
      .set("x-csrf-token", csrfToken);

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("prevents a claim from being reviewed twice", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "review-twice-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const firstReview = await agent
      .patch(`/api/items/${item._id}/claims/${claimId}/approve`)
      .set("x-csrf-token", csrfToken);

    assert.equal(firstReview.status, 200);
    assert.equal(firstReview.body.data.status, "approved");

    const secondReview = await agent
      .patch(`/api/items/${item._id}/claims/${claimId}/reject`)
      .set("x-csrf-token", csrfToken);

    assert.equal(secondReview.status, 409);
    assert.equal(secondReview.body.success, false);

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.status, "approved");
  });

  it("returns only the logged-in user's notifications", async () => {
    const owner = await createLoggedInAgent(
      "notification-owner@example.com"
    );
    const claimant = await createLoggedInAgent(
      "notification-claimant@example.com"
    );
    const otherUser = await createLoggedInAgent(
      "notification-other@example.com"
    );

    const itemResponse = await owner.agent
      .post("/api/items")
      .set("x-csrf-token", owner.csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);
    const item = itemResponse.body.data;
    await Item.findByIdAndUpdate(
  item._id,
  { $set: { moderationStatus: "approved" } }
);

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const ownerResponse = await owner.agent.get("/api/notifications");

    assert.equal(ownerResponse.status, 200);
    assert.equal(ownerResponse.body.success, true);
    assert.ok(Array.isArray(ownerResponse.body.data));
    assert.ok(
      ownerResponse.body.data.some(
        (notification) => notification.type === "claim_submitted"
      )
    );

    const otherResponse = await otherUser.agent.get("/api/notifications");

    assert.equal(otherResponse.status, 200);
    assert.equal(otherResponse.body.success, true);
    assert.equal(otherResponse.body.count, 0);
  });

  it("marks the logged-in user's notification as read", async () => {
    const owner = await createLoggedInAgent(
      "notification-read-owner@example.com"
    );
    const claimant = await createLoggedInAgent(
      "notification-read-claimant@example.com"
    );

    const itemResponse = await owner.agent
      .post("/api/items")
      .set("x-csrf-token", owner.csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);
    const item = itemResponse.body.data;

    await Item.findByIdAndUpdate(
  item._id,
  { $set: { moderationStatus: "approved" } }
);

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const notification = await Notification.findOne({
      recipient: owner.userId,
      type: "claim_submitted",
    });

    assert.ok(notification);
    assert.equal(notification.isRead, false);

    const response = await owner.agent
      .patch(`/api/notifications/${notification._id}/read`)
      .set("x-csrf-token", owner.csrfToken);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.isRead, true);

    const savedNotification = await Notification.findById(
      notification._id
    );

    assert.equal(savedNotification.isRead, true);
  });

  it("prevents a user from marking another user's notification as read", async () => {
    const owner = await createLoggedInAgent(
      "notification-access-owner@example.com"
    );
    const claimant = await createLoggedInAgent(
      "notification-access-claimant@example.com"
    );

    const itemResponse = await owner.agent
      .post("/api/items")
      .set("x-csrf-token", owner.csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);
    const item = itemResponse.body.data;

    await Item.findByIdAndUpdate(
  item._id,
  { $set: { moderationStatus: "approved" } }
);

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message:
          "I can identify this item by its unique marks and details.",
      });

    assert.equal(claimResponse.status, 201);

    const notification = await Notification.findOne({
      recipient: owner.userId,
      type: "claim_submitted",
    });

    assert.ok(notification);

    const response = await claimant.agent
      .patch(`/api/notifications/${notification._id}/read`)
      .set("x-csrf-token", claimant.csrfToken);

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);

    const savedNotification = await Notification.findById(
      notification._id
    );

    assert.equal(savedNotification.isRead, false);
  });

    // ADMIN AUTHORIZATION AND AUDIT LOG SECURITY

  it("rejects access to the admin review queue without authentication", async () => {
    const anonymous = await createAnonymousAgent();

    const response = await anonymous.agent.get(
      "/api/items/admin/review"
    );

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  it("prevents a normal user from accessing the admin review queue", async () => {
    const response = await agent.get("/api/items/admin/review");

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  });

  it("allows an administrator to access the admin review queue", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get("/api/items/admin/review");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.data));
  });

  it("prevents a normal user from accessing audit logs", async () => {
    const response = await agent.get(
      "/api/items/admin/audit-logs"
    );

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  });

  it("allows an administrator to access audit logs", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/audit-logs"
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.data));
  });

  // ADMIN ANALYTICS TESTS

  it("rejects analytics access without authentication", async () => {
    const anonymous = await createAnonymousAgent();

    const response = await anonymous.agent.get(
      "/api/items/admin/analytics"
    );

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  it("prevents a normal user from accessing analytics", async () => {
    const response = await agent.get(
      "/api/items/admin/analytics"
    );

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  });

  it("allows an administrator to access analytics", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/analytics"
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(response.body.data.reports);
    assert.ok(response.body.data.claims);
    assert.ok(response.body.data.users);
    assert.ok(Array.isArray(response.body.data.categories));
    assert.ok(Array.isArray(response.body.data.locations));
    assert.ok(Array.isArray(response.body.data.monthlyReports));
  });

  it("rejects an invalid analytics start date", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/analytics?from=invalid-date"
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("rejects an invalid analytics end date", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/analytics?to=2026-02-30"
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("rejects an analytics date range when the start date is after the end date", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/analytics?from=2026-11-20&to=2026-11-10"
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("returns correct report, claim, user, and recovery statistics", async () => {
    const claimant = await createLoggedInAgent(
      "analytics-claimant@example.com"
    );

    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const lostItem = await createItem({
      type: "lost",
      category: "electronics",
      campusLocation: "Central Library",
    });

    const foundItem = await createItem({
      type: "found",
      category: "books",
      campusLocation: "Computer Block",
    });

    await Item.findByIdAndUpdate(lostItem._id, {
      $set: {
        moderationStatus: "pending",
        status: "active",
        "duplicateCheck.status": "flagged",
      },
    });

    await Item.findByIdAndUpdate(foundItem._id, {
      $set: {
        moderationStatus: "rejected",
        status: "resolved",
        "suspiciousCheck.status": "flagged",
      },
    });

    const claimDetails = {
      item: lostItem._id,
      claimant: claimant.userId,
      itemOwner: currentUserId,
      message: "I can identify this item using its unique details.",
    };

    await Claim.create({
      ...claimDetails,
      status: "pending",
    });

    await Claim.create({
      ...claimDetails,
      status: "approved",
      returnConfirmedByClaimant: true,
      returnConfirmedByOwner: true,
    });

    await Claim.create({
      ...claimDetails,
      status: "rejected",
    });

    await Claim.create({
      ...claimDetails,
      status: "cancelled",
    });

    const response = await agent.get(
      "/api/items/admin/analytics"
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const { reports, claims, users } = response.body.data;

    // Report statistics
    assert.equal(reports.total, 2);
    assert.equal(reports.lost, 1);
    assert.equal(reports.found, 1);
    assert.equal(reports.pending, 1);
    assert.equal(reports.rejected, 1);
    assert.equal(reports.duplicates, 1);
    assert.equal(reports.suspicious, 1);
    assert.equal(reports.active, 1);
    assert.equal(reports.resolved, 1);

    // Claim statistics
    assert.equal(claims.total, 4);
    assert.equal(claims.pending, 1);
    assert.equal(claims.approved, 1);
    assert.equal(claims.rejected, 1);
    assert.equal(claims.cancelled, 1);
    assert.equal(claims.recovered, 1);
    assert.equal(claims.recoveryRate, 100);

    // User statistics
    assert.equal(users.total, 2);
    assert.equal(users.admins, 1);
    assert.equal(users.regularUsers, 1);

    // Category and location aggregation
    assert.equal(response.body.data.categories.length, 2);
    assert.equal(response.body.data.locations.length, 2);

    // Monthly report aggregation
    assert.equal(response.body.data.monthlyReports.length, 1);
    assert.equal(response.body.data.monthlyReports[0].count, 2);
  });

  it("returns zero statistics for a date range without records", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/analytics?from=2000-01-01&to=2000-01-31"
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.reports.total, 0);
    assert.equal(response.body.data.claims.total, 0);
    assert.equal(response.body.data.users.total, 0);
    assert.equal(response.body.data.categories.length, 0);
    assert.equal(response.body.data.locations.length, 0);
    assert.equal(response.body.data.monthlyReports.length, 0);
  });

it("includes records created on both boundaries of a same-day date range", async () => {
  await User.findByIdAndUpdate(currentUserId, {
    $set: { role: "admin" },
  });

  const today = new Date().toISOString().slice(0, 10);

  const item = await createItem({
    type: "lost",
    category: "electronics",
    campusLocation: "Central Library",
  });

  await Claim.create({
    item: item._id,
    claimant: currentUserId,
    itemOwner: currentUserId,
    message: "I can identify this item using its unique details.",
    status: "approved",
    returnConfirmedByClaimant: true,
    returnConfirmedByOwner: true,
  });

  const response = await agent.get(
    `/api/items/admin/analytics?from=${today}&to=${today}`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  assert.equal(response.body.data.reports.total, 1);
  assert.equal(response.body.data.claims.total, 1);
  assert.equal(response.body.data.claims.recovered, 1);
  assert.equal(response.body.data.users.total, 1);
});


    // ADMIN MODERATION ACTIONS

  it("allows an administrator to approve a pending report", async () => {
    const itemResponse = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);

    const itemId = itemResponse.body.data._id;

    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent
      .patch(`/api/items/admin/review/${itemId}/approve`)
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.equal(response.status, 200);
    assert.equal(response.body.data.moderationStatus, "approved");

    const savedItem = await Item.findById(itemId);
    assert.equal(savedItem.moderationStatus, "approved");
  });

  it("allows an administrator to reject a pending report with a reason", async () => {
    const itemResponse = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);

    const itemId = itemResponse.body.data._id;

    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent
      .patch(`/api/items/admin/review/${itemId}/reject`)
      .set("x-csrf-token", csrfToken)
      .send({ reason: "Insufficient report details" });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.moderationStatus, "rejected");
    assert.equal(
      response.body.data.moderationReason,
      "Insufficient report details"
    );

    const savedItem = await Item.findById(itemId);
    assert.equal(savedItem.moderationStatus, "rejected");
  });

  it("rejects an admin report rejection without a reason", async () => {
    const itemResponse = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);

    const itemId = itemResponse.body.data._id;

    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent
      .patch(`/api/items/admin/review/${itemId}/reject`)
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.equal(response.status, 400);

    const savedItem = await Item.findById(itemId);
    assert.equal(savedItem.moderationStatus, "pending");
  });
    it("rejects admin approval without a CSRF token", async () => {
    const itemResponse = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);

    const itemId = itemResponse.body.data._id;

    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent
      .patch(`/api/items/admin/review/${itemId}/approve`)
      .send({});

    assert.equal(response.status, 403);

    const savedItem = await Item.findById(itemId);
    assert.equal(savedItem.moderationStatus, "pending");
  });
    it("does not allow item updates to change protected fields", async () => {
    const item = await createItem();

    const response = await agent
      .patch(`/api/items/${item._id}`)
      .set("x-csrf-token", csrfToken)
      .send({
        title: "Updated notebook title",
        owner: new mongoose.Types.ObjectId().toString(),
        status: "resolved",
        moderationStatus: "approved",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.title, "Updated notebook title");
    assert.equal(response.body.data.owner.toString(), currentUserId);
    assert.equal(response.body.data.status, "active");
    assert.equal(response.body.data.moderationStatus, "pending");

    const savedItem = await Item.findById(item._id);

    assert.equal(savedItem.owner.toString(), currentUserId);
    assert.equal(savedItem.status, "active");
    assert.equal(savedItem.moderationStatus, "pending");
  });

  it("prevents an item owner from claiming their own report", async () => {
    const item = await createItem();

    const response = await agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", csrfToken)
      .send({
        message: "I am the owner of this reported item.",
      });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);

    const claimCount = await Claim.countDocuments({
      item: item._id,
    });

    assert.equal(claimCount, 0);
  });

  it("prevents claims on reports awaiting admin approval", async () => {
    const itemResponse = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);

    const itemId = itemResponse.body.data._id;

    const claimant = await createLoggedInAgent(
      "pending-report-claimant@example.com"
    );

    const response = await claimant.agent
      .post(`/api/items/${itemId}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message: "I can identify this item using its unique details.",
      });

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);

    const claimCount = await Claim.countDocuments({
      item: itemId,
    });

    assert.equal(claimCount, 0);
  });

  it("rejects claim submission without a CSRF token", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "claim-csrf-test@example.com"
    );

    const response = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .send({
        message: "I can identify this item using its unique details.",
      });

    assert.equal(response.status, 403);

    const claimCount = await Claim.countDocuments({
      item: item._id,
    });

    assert.equal(claimCount, 0);
  });

  it("rejects claim approval without a CSRF token", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "approval-csrf-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message: "I can identify this item using its unique details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const response = await agent
      .patch(`/api/items/${item._id}/claims/${claimId}/approve`);

    assert.equal(response.status, 403);

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.status, "pending");
  });

  it("prevents recovery confirmation before a claim is approved", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "pending-recovery-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message: "I can identify this item using its unique details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const response = await claimant.agent
      .patch(
        `/api/items/${item._id}/claims/${claimId}/confirm-recovery`
      )
      .set("x-csrf-token", claimant.csrfToken);

    assert.equal(response.status, 409);

    const savedClaim = await Claim.findById(claimId);

    assert.equal(savedClaim.status, "pending");
    assert.equal(savedClaim.returnConfirmedByClaimant, false);
    assert.equal(savedClaim.returnConfirmedByOwner, false);

    const savedItem = await Item.findById(item._id);
    assert.equal(savedItem.status, "active");
  });

  it("rejects recovery confirmation without a CSRF token", async () => {
    const item = await createItem();

    const claimant = await createLoggedInAgent(
      "recovery-csrf-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${item._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message: "I can identify this item using its unique details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    await Claim.findByIdAndUpdate(claimId, {
      $set: { status: "approved" },
    });

    await Item.findByIdAndUpdate(item._id, {
      $set: { status: "claimed" },
    });

    const response = await claimant.agent.patch(
      `/api/items/${item._id}/claims/${claimId}/confirm-recovery`
    );

    assert.equal(response.status, 403);

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.returnConfirmedByClaimant, false);
  });

  it("does not allow a claim to be reviewed through a different item", async () => {
    const firstItem = await createItem();
    const secondItem = await createItem({
      title: "Another reported notebook",
    });

    const claimant = await createLoggedInAgent(
      "cross-item-claimant@example.com"
    );

    const claimResponse = await claimant.agent
      .post(`/api/items/${firstItem._id}/claims`)
      .set("x-csrf-token", claimant.csrfToken)
      .send({
        message: "I can identify this item using its unique details.",
      });

    assert.equal(claimResponse.status, 201);

    const claimId = claimResponse.body.data._id;

    const response = await agent
      .patch(
        `/api/items/${secondItem._id}/claims/${claimId}/approve`
      )
      .set("x-csrf-token", csrfToken);

    assert.equal(response.status, 404);

    const savedClaim = await Claim.findById(claimId);
    assert.equal(savedClaim.status, "pending");
  });

  it("rejects an invalid notification ID", async () => {
    const response = await agent
      .patch("/api/notifications/not-a-valid-id/read")
      .set("x-csrf-token", csrfToken);

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("rejects admin moderation requests with an invalid report ID", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent
      .patch("/api/items/admin/review/not-a-valid-id/approve")
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("prevents an administrator from reviewing the same report twice", async () => {
    const itemResponse = await agent
      .post("/api/items")
      .set("x-csrf-token", csrfToken)
      .send(createValidItem());

    assert.equal(itemResponse.status, 201);

    const itemId = itemResponse.body.data._id;

    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const firstResponse = await agent
      .patch(`/api/items/admin/review/${itemId}/approve`)
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.equal(firstResponse.status, 200);

    const secondResponse = await agent
      .patch(`/api/items/admin/review/${itemId}/approve`)
      .set("x-csrf-token", csrfToken)
      .send({});

    assert.equal(secondResponse.status, 404);

    const savedItem = await Item.findById(itemId);
    assert.equal(savedItem.moderationStatus, "approved");
  });
    // ==========================================
  // ADMIN ANALYTICS TESTS
  // ==========================================

  it("does not allow anonymous users to access admin analytics", async () => {
    const anonymous = await createAnonymousAgent();

    const response = await anonymous.agent.get(
      "/api/items/admin/analytics"
    );

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  it("does not allow regular users to access admin analytics", async () => {
    const response = await agent.get("/api/items/admin/analytics");

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  });

  it("returns report, claim, user, category and location analytics for admins", async () => {
    // Promote the current test user to administrator.
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    // Create another regular user.
    await createLoggedInAgent("analytics-student@example.com");

    // Create a lost report.
    const lostItem = await createItem({
      title: "Analytics lost phone",
      type: "lost",
      category: "electronics",
      campusLocation: "Central Library",
    });

    // Create a found report.
    const foundItem = await createItem({
      title: "Analytics found book",
      type: "found",
      category: "books",
      campusLocation: "Main Block",
    });

    // Set report statuses and detection flags.
    await Item.findByIdAndUpdate(lostItem._id, {
      $set: {
        moderationStatus: "pending",
        status: "active",
      },
    });

    await Item.findByIdAndUpdate(foundItem._id, {
      $set: {
        moderationStatus: "approved",
        status: "claimed",
        "duplicateCheck.status": "flagged",
        "suspiciousCheck.status": "flagged",
      },
    });

    // Create one completed recovery claim.
    await Claim.create({
      item: foundItem._id,
      claimant: currentUserId,
      itemOwner: currentUserId,
      message: "I can identify this item using its unique details.",
      status: "approved",
      returnConfirmedByClaimant: true,
      returnConfirmedByOwner: true,
    });

    // Create one pending claim.
    await Claim.create({
      item: lostItem._id,
      claimant: currentUserId,
      itemOwner: currentUserId,
      message: "I have additional details to identify this item.",
      status: "pending",
    });

    const response = await agent.get(
      "/api/items/admin/analytics"
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const data = response.body.data;

    // Report statistics.
    assert.equal(data.reports.total, 2);
    assert.equal(data.reports.lost, 1);
    assert.equal(data.reports.found, 1);
    assert.equal(data.reports.pending, 1);
    assert.equal(data.reports.approved, 1);
    assert.equal(data.reports.active, 1);
    assert.equal(data.reports.claimed, 1);
    assert.equal(data.reports.duplicates, 1);
    assert.equal(data.reports.suspicious, 1);

    // Claim statistics.
    assert.equal(data.claims.total, 2);
    assert.equal(data.claims.pending, 1);
    assert.equal(data.claims.approved, 1);
    assert.equal(data.claims.recovered, 1);
    assert.equal(data.claims.recoveryRate, 100);

    // User statistics.
    assert.equal(data.users.total, 2);
    assert.equal(data.users.admins, 1);
    assert.equal(data.users.regularUsers, 1);

    // Distribution and trend data.
    assert.equal(data.categories.length, 2);
    assert.equal(data.locations.length, 2);
    assert.ok(Array.isArray(data.monthlyReports));
  });

  it("filters analytics reports by the requested date range", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const includedItem = await createItem({
      title: "Report inside analytics date range",
    });

    const excludedItem = await createItem({
      title: "Report outside analytics date range",
    });

    // Set deterministic report creation dates directly in MongoDB.
    await Item.collection.updateOne(
      { _id: includedItem._id },
      {
        $set: {
          createdAt: new Date("2026-10-10T12:00:00.000Z"),
        },
      }
    );

    await Item.collection.updateOne(
      { _id: excludedItem._id },
      {
        $set: {
          createdAt: new Date("2026-10-11T12:00:00.000Z"),
        },
      }
    );

    const response = await agent.get(
      "/api/items/admin/analytics?from=2026-10-10&to=2026-10-10"
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.reports.total, 1);
    assert.equal(response.body.filters.from, "2026-10-10");
    assert.equal(response.body.filters.to, "2026-10-10");
  });

  it("rejects an invalid analytics start date", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/analytics?from=invalid-date"
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("rejects an impossible analytics end date", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/analytics?to=2026-02-30"
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("rejects an analytics start date later than the end date", async () => {
    await User.findByIdAndUpdate(currentUserId, {
      $set: { role: "admin" },
    });

    const response = await agent.get(
      "/api/items/admin/analytics?from=2026-10-20&to=2026-10-10"
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });
});
