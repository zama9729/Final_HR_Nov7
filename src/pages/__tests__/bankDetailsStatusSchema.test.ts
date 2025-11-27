import { bankDetailsStatusSchema } from "../Onboarding";

describe("bankDetailsStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(() => bankDetailsStatusSchema.parse("pending")).not.toThrow();
    expect(() => bankDetailsStatusSchema.parse("skipped")).not.toThrow();
  });

  it("rejects invalid values", () => {
    expect(() => bankDetailsStatusSchema.parse("skipped_by_user")).toThrow();
    expect(() => bankDetailsStatusSchema.parse("unknown")).toThrow();
  });
});

