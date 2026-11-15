
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
import User from "../src/models/User.js";
import SavedSearch from "../src/models/SavedSearch.js";
import { sessionStore } from "../src/config/session.js";

let agent;
let csrfToken;

describe("Findora Saved Searches API", () => {
  before(async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI is missing.");
    }

    const databaseName = new URL(uri).pathname.replace(/^\//, "");

    if (databaseName !== "campus_lost_found_test") {
      throw new Error(
        "Saved Search tests must use campus_lost_found_test."
      );
    }

    await connectDB();
  });

  beforeEach(async () => {
    await SavedSearch.deleteMany({});
    await User.deleteMany({});

    agent = request.agent(app);

    const response = await agent.get("/api/auth/csrf-token");

    assert.equal(response.status, 200);

    csrfToken = response.body.csrfToken;

    assert.ok(csrfToken);
  });

  after(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await SavedSearch.deleteMany({});
        await User.deleteMany({});
      }
    } finally {
      await sessionStore.close();
      await mongoose.disconnect();
    }
  });

  async function registerAndLogin(email) {
    const registerResponse = await agent
      .post("/api/auth/register")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Saved Search Test",
        email,
        password: "SecurePass123!",
      });

    assert.equal(
      registerResponse.status,
      201,
      JSON.stringify(registerResponse.body)
    );

    const loginResponse = await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrfToken)
      .send({
        email,
        password: "SecurePass123!",
      });

    assert.equal(
      loginResponse.status,
      200,
      JSON.stringify(loginResponse.body)
    );

    const tokenResponse = await agent.get("/api/auth/csrf-token");

    assert.equal(tokenResponse.status, 200);

    csrfToken = tokenResponse.body.csrfToken;

    assert.ok(csrfToken);
  }

  it("creates a saved search", async () => {
    await registerAndLogin("saved@example.com");

    const response = await agent
      .post("/api/saved-searches")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Lost Electronics",
        filters: {
          search: "Laptop",
          type: "lost",
          category: "electronics",
          campusLocation: "Library",
          status: "active",
          sort: "newest",
        },
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.name, "Lost Electronics");
    assert.equal(response.body.data.filters.search, "Laptop");
    assert.equal(response.body.data.filters.type, "lost");
    assert.ok(response.body.data._id);
  });

  it("lists the logged-in user's saved searches", async () => {
    await registerAndLogin("list@example.com");

    await agent
      .post("/api/saved-searches")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Books Search",
        filters: { category: "books" },
      });

    const response = await agent.get("/api/saved-searches");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.data[0].name, "Books Search");
  });

  it("updates a saved search name", async () => {
    await registerAndLogin("update@example.com");

    const created = await agent
      .post("/api/saved-searches")
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Old Name",
        filters: { search: "Phone" },
      });

    const id = created.body.data._id;

    const response = await agent
      .patch(`/api/saved-searches/${id}`)
      .set("x-csrf-token", csrfToken)
      .send({ name: "New Name" });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.name, "New Name");
  });

  it("deletes a saved search", async () => {
    await registerAndLogin("delete@example.com");

    const created = await agent
      .post("/api/saved-searches")
      .set("x-csrf-token", csrfToken)
      .send({ name: "Delete Test" });

    const id = created.body.data._id;

    const response = await agent
      .delete(`/api/saved-searches/${id}`)
      .set("x-csrf-token", csrfToken);

    assert.equal(response.status, 200);

    const savedSearch = await SavedSearch.findById(id);

    assert.equal(savedSearch, null);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get("/api/saved-searches");

    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  });

  it("does not expose another user's saved searches", async () => {
    await registerAndLogin("owner@example.com");

    await agent
      .post("/api/saved-searches")
      .set("x-csrf-token", csrfToken)
      .send({ name: "Private Search" });

    await agent
      .post("/api/auth/logout")
      .set("x-csrf-token", csrfToken);

    const tokenResponse = await agent.get("/api/auth/csrf-token");
    csrfToken = tokenResponse.body.csrfToken;

    await registerAndLogin("other@example.com");

    const response = await agent.get("/api/saved-searches");

    assert.equal(response.status, 200);
    assert.equal(response.body.count, 0);
    assert.equal(response.body.data.length, 0);
  });

  it("rejects an invalid saved search ID", async () => {
    await registerAndLogin("invalid-id@example.com");

    const response = await agent.get("/api/saved-searches/invalid-id");

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });

  it("rejects a saved search name shorter than two characters", async () => {
    await registerAndLogin("validation@example.com");

    const response = await agent
      .post("/api/saved-searches")
      .set("x-csrf-token", csrfToken)
      .send({ name: "A" });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  });
  it("saves date filters and descending title sort", async () => {
  await registerAndLogin("date-search@example.com");

  const response = await agent
    .post("/api/saved-searches")
    .set("x-csrf-token", csrfToken)
    .send({
      name: "Date Range Search",
      filters: {
        dateFrom: "2026-10-01",
        dateTo: "2026-10-31",
        sort: "title_desc",
      },
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.filters.dateFrom, "2026-10-01");
  assert.equal(response.body.data.filters.dateTo, "2026-10-31");
  assert.equal(response.body.data.filters.sort, "title_desc");
});
it("rejects a saved search with a reversed date range", async () => {
  await registerAndLogin("invalid-date-search@example.com");

  const response = await agent
    .post("/api/saved-searches")
    .set("x-csrf-token", csrfToken)
    .send({
      name: "Invalid Date Range",
      filters: {
        dateFrom: "2026-10-31",
        dateTo: "2026-10-01",
      },
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});
});
