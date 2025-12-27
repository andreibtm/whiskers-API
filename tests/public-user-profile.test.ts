import { describe, expect, it } from "vitest";
import { toPublicUserProfile } from "../src/lib/auth.js";

describe("toPublicUserProfile", () => {
  it("strips sensitive fields from user DTOs", () => {
    const dto = toPublicUserProfile({
      id: "user-1",
      email: "private@example.com",
      role: "ADMIN",
      password: "hashed",
      username: "alice",
      avatar: "https://example.com/avatar.png",
    } as any);

    expect(dto).toEqual({ id: "user-1", username: "alice", avatar: "https://example.com/avatar.png" });
    expect((dto as any).email).toBeUndefined();
    expect((dto as any).role).toBeUndefined();
    expect((dto as any).password).toBeUndefined();
  });
});
