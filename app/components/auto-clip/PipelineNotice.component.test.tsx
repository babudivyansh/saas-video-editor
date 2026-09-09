// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PipelineNotice from "./PipelineNotice";

vi.setConfig({ testTimeout: 30_000 });

describe("PipelineNotice", () => {
  it("renders nothing when the pipeline skipped nothing", () => {
    const { container } = render(<PipelineNotice warnings={[]} />);
    expect(container).toBeEmptyDOMElement();
    const none = render(<PipelineNotice warnings={null} />);
    expect(none.container).toBeEmptyDOMElement();
  });

  it("leads with the consequence, not the apology", async () => {
    // The old banner opened "We couldn't transcribe this video..." — three
    // lines of explanation before the user learned what it meant for the clips
    // in front of them.
    render(<PipelineNotice warnings={["transcription_failed"]} />);
    expect(screen.getByText(/No subtitles/)).toBeInTheDocument();
    expect(screen.queryByText(/We couldn't transcribe/)).not.toBeInTheDocument();
  });

  it("keeps the full explanation one click away", async () => {
    render(<PipelineNotice warnings={["transcription_failed"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Why?" }));
    expect(screen.getByText(/We couldn't transcribe this video/)).toBeInTheDocument();
    expect(screen.getByText(/generic placeholders/)).toBeInTheDocument();
  });

  it("collapses several warnings into one line instead of stacking banners", () => {
    render(<PipelineNotice warnings={["transcription_failed", "reframe_failed"]} />);
    expect(screen.getByText(/No subtitles.*·.*Centered crop/)).toBeInTheDocument();
  });

  it("keeps 'we couldn't run it' distinct from 'this footage has no faces'", async () => {
    // One is ours to fix and applies to every video on the deployment; the
    // other is a fact about the file. Collapsing them would hide an outage.
    const ours = render(<PipelineNotice warnings={["reframe_failed"]} />);
    expect(ours.getByText(/speaker tracking didn't run/i)).toBeInTheDocument();
    ours.unmount();

    render(<PipelineNotice warnings={["reframe_unavailable"]} />);
    expect(screen.getByText(/no faces to follow/i)).toBeInTheDocument();
  });

  it("still surfaces a code it has no copy for, rather than dropping it silently", async () => {
    // A clip that rendered differently with nothing said about it is worse
    // than an unpolished string. The summary stays readable — the raw code
    // goes in the details, not the headline.
    render(<PipelineNotice warnings={["some_new_warning"]} />);
    expect(screen.getByText(/Some steps were skipped/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Why?" }));
    expect(screen.getByText("some_new_warning")).toBeInTheDocument();
  });
});
