/**
 * Test stub for the `server-only` package.
 *
 * `server-only` deliberately throws when resolved outside a React Server
 * Component graph, which would break unit tests of server modules. Aliasing it
 * here lets us unit-test services directly while the real guard still protects
 * production client bundles.
 */
export {};
