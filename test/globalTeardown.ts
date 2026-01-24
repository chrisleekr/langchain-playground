/**
 * Jest global teardown script.
 * Called once after all test suites complete.
 *
 * Use this to clean up any global resources created in globalSetup.ts
 * or during tests (e.g., close connections, clear caches).
 */
const globalTeardown = async (): Promise<void> => {
  // Clean up any global resources here
  // Note: Redis client cleanup is handled per-test, not globally
};

export default globalTeardown;
