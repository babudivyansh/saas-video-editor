import { resetToolJobs } from "@mocks/jobs";
import { pollMs } from "@/lib/poll";
import { installMockServer } from "./mockServer";

// Every test starts with the mock fixtures behind the API client (see
// mockServer.ts). A test that installs its own fake replaces it, and its
// restore() puts this one back.
let restore: () => void = () => {};
beforeEach(() => {
  // Jobs finish after a poll or two; no test should wait seconds for them.
  pollMs.tool = 5;
  pollMs.export = 5;
  resetToolJobs();
  restore = installMockServer();
});
afterEach(() => restore());
