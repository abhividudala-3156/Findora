
import {
  describe,
  it,
  before,
  beforeEach,
  after,
} from "node:test";

import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";

import app from "../src/app.js";
import { connectDB } from "../src/config/database.js";
import Item from "../src/models/Item.js";
import User from "../src/models/User.js";
import { sessionStore } from "../src/config/session.js";

let agent;
let csrfToken;
let currentUserId;

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

  // Login regenerates the session. Obtain a token for that session.
  response = await userAgent.get("/api/auth/csrf-token");

  assert.equal(response.status, 200);

  token = response.body.csrfToken;

  assert.ok(token);

  return {
    agent: userAgent,
    csrfToken: token,
    userId: response.body.userId,
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

  return response.body.data;
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

describe("Findora API", () => {
  before(async () => {
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
    await Item.deleteMany({});
    await User.deleteMany({});

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
        await Item.deleteMany({});
        await User.deleteMany({});
      }
    } finally {
      try {
        await sessionStore.close();
      } finally {
        await mongoose.disconnect();
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
    assert.equal(response.body.data._id, item._id);
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
        (result) => result._id === item._id
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
      response.body.data.every((item) => item.type === "lost")
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
});
