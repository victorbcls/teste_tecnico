import { describe, it, expect, vi } from "vitest";
import { executeWithRetry } from "../src/lib/tools/executeWithRetry";

describe("executeWithRetry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await executeWithRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failure and succeeds within maxAttempts", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error("transient"));
      return Promise.resolve("recovered");
    });
    const result = await executeWithRetry(fn, { maxAttempts: 3 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(executeWithRetry(fn, { maxAttempts: 2 })).rejects.toThrow(
      "always fails"
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("times out a call that never resolves", async () => {
    const fn = () => new Promise<string>(() => {});
    await expect(
      executeWithRetry(fn, { maxAttempts: 1, timeoutMs: 20 })
    ).rejects.toThrow(/timeout/i);
  });
});
