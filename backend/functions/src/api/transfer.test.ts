import { describe, expect, it } from "vitest";
import { seededRandom } from "../../test/helpers.js";
import { generateTransferCode, normalizeTransferCode, TRANSFER_CODE_LENGTH } from "./transfer.js";

describe("transfer codes", () => {
  it("are 8 characters without look-alikes", () => {
    const code = generateTransferCode(seededRandom(1));
    expect(code).toHaveLength(TRANSFER_CODE_LENGTH);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]+$/);
  });

  it("are read leniently, as typed", () => {
    expect(normalizeTransferCode("k7q2-xm4p")).toBe("K7Q2XM4P");
    expect(normalizeTransferCode(" K7Q2 XM4P ")).toBe("K7Q2XM4P");
    expect(normalizeTransferCode("K7Q2XM4")).toBeNull();
    expect(normalizeTransferCode("K7Q2XM4O")).toBeNull();
  });
});
