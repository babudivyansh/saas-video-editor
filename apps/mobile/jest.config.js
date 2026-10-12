/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Screen tests render whole routes; on a cold transform cache (every CI run)
  // the heaviest ones can pass the 5 s default.
  testTimeout: 20000,
  setupFiles: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["/node_modules/", "/dist-check/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@mocks/(.*)$": "<rootDir>/mocks/$1",
    // packages/shared's imports resolve to this app's copy (see metro.config.js).
    "^zod$": require.resolve("zod", { paths: [__dirname] }),
  },
};
