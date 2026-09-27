import { describe, expect, it } from "vitest";
import { getContractSignal } from "./contracts";
describe("C2C posting evidence", () => {
  it.each(["C2C accepted", "Contract corp-to-corp", "Corp to corp available"])(
    "identifies explicit mentions: %s",
    (text) => {
      expect(getContractSignal({ Description: text }).key).toBe("c2c");
    },
  );
  it.each([
    "No C2C",
    "C2C not accepted",
    "W2 only, C2C unavailable",
    "No third-party vendors; C2C",
    "No subcontractors",
  ])("prioritizes restrictions: %s", (text) => {
    expect(getContractSignal({ Description: text }).key).toBe("restricted");
  });
  it.each(["Contract", "Full time", "1099", "", "Contract W2"])(
    "does not infer C2C eligibility from %s",
    (text) => {
      expect(getContractSignal({ "Employment Type": text }).key).toBe(
        "unknown",
      );
    },
  );
});
