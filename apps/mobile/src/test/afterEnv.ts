import { installMockServer } from "./mockServer";

// Every test starts with the mock fixtures behind the API client (see
// mockServer.ts). A test that installs its own fake replaces it, and its
// restore() puts this one back.
let restore: () => void = () => {};
beforeEach(() => {
  restore = installMockServer();
});
afterEach(() => restore());
