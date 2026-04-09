import { describe, expect, it } from "vitest";
import packageJson from "../../../package.json";

describe("workspace projection backfill command", () => {
  it("uses the standard node runtime for the operational command", () => {
    expect(packageJson.scripts["workspace:backfill-projections"]).toBe(
      "node --experimental-strip-types ./src/scripts/backfill-workspace-projections.ts",
    );
  });
});
