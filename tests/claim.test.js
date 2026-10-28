
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Claim from "../src/models/Claim.js";

describe("Claim model", () => {
  it("rejects a claim without required references or a message", async () => {
    const claim = new Claim({});

    await assert.rejects(
      claim.validate(),
      (error) => {
        assert.ok(error.errors.item);
        assert.ok(error.errors.claimant);
        assert.ok(error.errors.itemOwner);
        assert.ok(error.errors.message);
        return true;
      }
    );
  });

  it("rejects a message shorter than 10 characters", async () => {
    const claim = new Claim({
      item: new mongoose.Types.ObjectId(),
      claimant: new mongoose.Types.ObjectId(),
      itemOwner: new mongoose.Types.ObjectId(),
      message: "Mine",
    });

    await assert.rejects(
      claim.validate(),
      (error) => {
        assert.ok(error.errors.message);
        return true;
      }
    );
  });

  it("sets the correct defaults for a new claim", () => {
    const claim = new Claim({
      item: new mongoose.Types.ObjectId(),
      claimant: new mongoose.Types.ObjectId(),
      itemOwner: new mongoose.Types.ObjectId(),
      message: "I can identify the item by its unique marks.",
    });

    assert.equal(claim.status, "pending");
    assert.equal(claim.returnConfirmedByClaimant, false);
    assert.equal(claim.returnConfirmedByOwner, false);
  });

  it("rejects an unsupported claim status", async () => {
    const claim = new Claim({
      item: new mongoose.Types.ObjectId(),
      claimant: new mongoose.Types.ObjectId(),
      itemOwner: new mongoose.Types.ObjectId(),
      message: "I can identify the item by its unique marks.",
      status: "completed",
    });

    await assert.rejects(
      claim.validate(),
      (error) => {
        assert.ok(error.errors.status);
        return true;
      }
    );
  });
});
