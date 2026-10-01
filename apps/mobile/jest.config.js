/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["/node_modules/", "/dist-check/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@mocks/(.*)$": "<rootDir>/mocks/$1",
    // packages/shared's imports resolve to this app's copy (see metro.config.js).
    "^zod$": require.resolve("zod", { paths: [__dirname] }),
  },
};
