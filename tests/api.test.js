import {
  describe,
  it,
  before,
  beforeEach,
  after
} from "node:test";

import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";

import app from "../src/app.js";
import { connectDB } from "../src/config/database.js";
import Item from "../src/models/Item.js";

// --------------------------------------------------
// Shared test utilities
// --------------------------------------------------

function recentPastDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);

  return date.toISOString().slice(0, 10);
}

const validOccurrenceDate = recentPastDate();

function createValidItem(overrides = {}) {
  return {
    title: "Lost student notebook",
    description:
      "A blue notebook lost near the university library.",
    type: "lost",
    category: "stationery",
    campusLocation: "University Library",
    dateOccurred: validOccurrenceDate,
    contactName: "Test Student",
    contactEmail: "teststudent@example.com",
    ...overrides
  };
}

async function createItem(overrides = {}) {
  const response = await request(app)
    .post("/api/items")
    .send(createValidItem(overrides));

  assert.equal(
    response.status,
    201,
    `Item creation failed: ${JSON.stringify(response.body)}`
  );

  return response.body.data;
}

// --------------------------------------------------
// Database safety
// --------------------------------------------------

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

  // Every test starts with a clean collection.
  beforeEach(async () => {
    await Item.deleteMany({});
  });

  after(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await Item.deleteMany({});
      }
    } finally {
      await mongoose.disconnect();
    }
  });

  // ------------------------------------------------
  // CREATE
  // ------------------------------------------------

  it("should create a new lost item", async () => {
    const item = createValidItem();

    const response = await request(app)
      .post("/api/items")
      .send(item);

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.title, item.title);
    assert.equal(response.body.data.type, item.type);
  });

  it("should reject an item with an invalid category", async () => {
    const response = await request(app)
      .post("/api/items")
      .send(
        createValidItem({
          category: "invalid-category"
        })
      );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject a title that is too short", async () => {
    const response = await request(app)
      .post("/api/items")
      .send(
        createValidItem({
          title: "A"
        })
      );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject a description that is too short", async () => {
    const response = await request(app)
      .post("/api/items")
      .send(
        createValidItem({
          description: "Too short"
        })
      );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject an item with an invalid type", async () => {
    const response = await request(app)
      .post("/api/items")
      .send(
        createValidItem({
          type: "missing"
        })
      );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("should reject an occurrence date in the future", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const response = await request(app)
      .post("/api/items")
      .send(
        createValidItem({
          dateOccurred: futureDate.toISOString()
        })
      );

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  // ------------------------------------------------
  // READ
  // ------------------------------------------------

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
        status: "all"
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.data, []);
  });

  // ------------------------------------------------
  // FILTERS
  // ------------------------------------------------

  it("should filter items by type", async () => {
    await createItem({ type: "lost" });
    await createItem({
      title: "Found campus pen",
      type: "found"
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
      category: "electronics"
    });

    const response = await request(app)
      .get("/api/items")
      .query({
        category: "stationery",
        status: "all"
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    assert.ok(
      response.body.data.every(
        (item) => item.category === "stationery"
      )
    );
  });

  // ------------------------------------------------
  // UPDATE
  // ------------------------------------------------

  it("should update an existing item", async () => {
    const item = await createItem();

    const response = await request(app)
      .patch(`/api/items/${item._id}`)
      .send({
        title: "Found blue campus notebook"
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    assert.equal(
      response.body.data.title,
      "Found blue campus notebook"
    );
  });

  it("should reject an update with no fields", async () => {
    const item = await createItem();

    const response = await request(app)
      .patch(`/api/items/${item._id}`)
      .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  // ------------------------------------------------
  // DELETE
  // ------------------------------------------------

  it("should delete an existing item", async () => {
    const item = await createItem();

    const deleteResponse = await request(app)
      .delete(`/api/items/${item._id}`);

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.body.success, true);

    const getResponse = await request(app)
      .get(`/api/items/${item._id}`);

    assert.equal(getResponse.status, 404);
  });
});