export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function release() {
    active -= 1;
    const next = queue.shift();
    if (next) {
      active += 1;
      next();
    }
  }

  function acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const grant = () => resolve(release);
      if (active < maxConcurrent) {
        active += 1;
        grant();
      } else {
        queue.push(grant);
      }
    });
  }

  return {
    acquire,
    activeCount: () => active,
  };
}
