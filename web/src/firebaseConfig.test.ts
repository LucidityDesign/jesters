import { describe, expect, it } from "vitest";
import { parseFirebaseConfig } from "./firebaseConfig";

describe("parseFirebaseConfig", () => {
  const expected = {
    apiKey: "key",
    authDomain: "jesters-x.firebaseapp.com",
    projectId: "jesters-x",
    appId: "1:23:web:45",
  };

  it("reads JSON", () => {
    expect(parseFirebaseConfig(JSON.stringify(expected))).toEqual(expected);
  });

  it("reads the console's JavaScript snippet", () => {
    const snippet = `const firebaseConfig = {
      apiKey: "key",
      authDomain: 'jesters-x.firebaseapp.com',
      projectId: "jesters-x",
      appId: "1:23:web:45"
    };`;
    expect(parseFirebaseConfig(snippet)).toEqual(expected);
  });

  it("rejects missing or incomplete configs", () => {
    expect(parseFirebaseConfig(undefined)).toBeNull();
    expect(parseFirebaseConfig("  ")).toBeNull();
    expect(parseFirebaseConfig('{"projectId": "jesters-x"}')).toBeNull();
  });
});
