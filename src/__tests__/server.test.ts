import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../server";

describe("API server", () => {
  it("returns 200 on /health", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await request(app).get("/nope");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: "Not found" });
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{invalid-json}");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: "Invalid JSON" });
  });

  it("returns 401 for missing auth on protected routes", async () => {
    const response = await request(app).get("/protected");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });
});
