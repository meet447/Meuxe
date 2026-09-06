import { describe, expect, it } from "vitest";
import { resolveVrmExpressionName } from "./vrmExpressions";

describe("resolveVrmExpressionName", () => {
  const utsuwa = [
    "neutral",
    "aa",
    "ih",
    "ou",
    "ee",
    "oh",
    "blink",
    "happy",
    "angry",
    "sad",
    "relaxed",
    "Surprised",
  ];

  it("maps VRM 0 joy/sorrow/fun aliases onto three-vrm presets", () => {
    expect(resolveVrmExpressionName("joy", utsuwa)).toBe("happy");
    expect(resolveVrmExpressionName("sorrow", utsuwa)).toBe("sad");
    expect(resolveVrmExpressionName("fun", utsuwa)).toBe("relaxed");
  });

  it("matches surprised case-insensitively when the model kept the custom name", () => {
    expect(resolveVrmExpressionName("surprised", utsuwa)).toBe("Surprised");
  });

  it("clears the face for neutral", () => {
    expect(resolveVrmExpressionName("neutral", utsuwa)).toBe("");
  });
});
