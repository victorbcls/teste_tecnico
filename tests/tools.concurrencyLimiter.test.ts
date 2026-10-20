import { describe, it, expect } from "vitest";
import { createLimiter } from "../src/lib/tools/concurrencyLimiter";

describe("createLimiter", () => {
  it("allows up to maxConcurrent acquisitions without blocking", async () => {
    const limiter = createLimiter(2);
    const release1 = await limiter.acquire();
    const release2 = await limiter.acquire();
    expect(limiter.activeCount()).toBe(2);
    release1();
    release2();
  });

  it("blocks a third acquisition until a slot is released", async () => {
    const limiter = createLimiter(1);
    const release1 = await limiter.acquire();

    let acquired = false;
    const pending = limiter.acquire().then((release2) => {
      acquired = true;
      release2();
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(acquired).toBe(false);

    release1();
    await pending;
    expect(acquired).toBe(true);
  });

  it("activeCount drops back to 0 after all slots released", async () => {
    const limiter = createLimiter(3);
    const release = await limiter.acquire();
    expect(limiter.activeCount()).toBe(1);
    release();
    expect(limiter.activeCount()).toBe(0);
  });
});
