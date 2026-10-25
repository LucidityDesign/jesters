import { describe, expect, it } from "vitest";
import { parseRoute } from "./router";

describe("routes", () => {
  it("parses the app's paths", () => {
    expect(parseRoute("/")).toEqual({ page: "home" });
    expect(parseRoute("/join")).toEqual({ page: "join", key: "" });
    expect(parseRoute("/join/K7Q2XM")).toEqual({ page: "join", key: "K7Q2XM" });
    expect(parseRoute("/game/abc123/")).toEqual({ page: "game", gameId: "abc123" });
    expect(parseRoute("/profile")).toEqual({ page: "profile" });
    expect(parseRoute("/privacy")).toEqual({ page: "privacy" });
  });

  it("rejects unknown paths", () => {
    expect(parseRoute("/game")).toEqual({ page: "notFound" });
    expect(parseRoute("/join/A/B")).toEqual({ page: "notFound" });
    expect(parseRoute("/nope")).toEqual({ page: "notFound" });
  });
});
