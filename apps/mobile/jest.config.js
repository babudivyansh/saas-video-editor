/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Screen tests render whole routes; on a cold transform cache (every CI run)
  // the heaviest ones can pass the 5 s default.
  testTimeout: 60000,
  setupFiles: ["<rootDir>/jest.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/src/test/afterEnv.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist-check/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@mocks/(.*)$": "<rootDir>/mocks/$1",
    // packages/shared's imports resolve to this app's copy (see metro.config.js).
    "^zod$": require.resolve("zod", { paths: [__dirname] }),
    // Babel's output for packages/shared (e.g. the API client's classes)
    // requires its runtime helpers, which only this app has installed.
    "^@babel/runtime/(.*)$": `${require("path").dirname(require.resolve("@babel/runtime/package.json", { paths: [__dirname] }))}/$1`,
  },
};
