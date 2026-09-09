// @vitest-environment jsdom
//
// testTimeout is raised for the whole file: these are jsdom + userEvent tests,
// where a single `type` of a short string is dozens of real event dispatches.
// They run in ~4s isolated, which leaves no headroom against vitest's 5s
// default once `npm test` is running many files in parallel — and a test that
// fails only under load is worse than no test at all.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaptionTemplatePicker, CaptionRenderControls } from "./CaptionTemplatePicker";

vi.setConfig({ testTimeout: 30_000 });

const API_TEMPLATES = {
  categories: ["Viral", "Creator", "Podcast", "Minimal", "Professional"],
  templates: [
    { id: "clean", label: "Clean", hint: "Neutral white.", category: null, premium: false, previewImageUrl: null, previewVideoUrl: null, requiresRender: false },
    { id: "viral-bold-01", label: "Viral Bold", hint: "Heavy all-caps.", category: "Viral", premium: true, previewImageUrl: null, previewVideoUrl: null, requiresRender: true },
    { id: "podcast-bold", label: "Podcast", hint: "Lower third.", category: "Podcast", premium: true, previewImageUrl: null, previewVideoUrl: null, requiresRender: true },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(API_TEMPLATES), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
});

afterEach(() => vi.unstubAllGlobals());

describe("CaptionTemplatePicker", () => {
  it("renders the server list, which is what makes admin overrides take effect", async () => {
    render(<CaptionTemplatePicker value={null} onChange={() => {}} />);
    expect(await screen.findByText("Viral Bold")).toBeInTheDocument();
    // "Podcast" is both a category tab and a template name here, so scope to
    // the card rather than matching either.
    expect(screen.getByRole("button", { name: /Podcast.*Lower third/s })).toBeInTheDocument();
  });

  it("marks premium styles so the price isn't a surprise", async () => {
    render(<CaptionTemplatePicker value={null} onChange={() => {}} />);
    await screen.findByText("Viral Bold");
    // Two premium templates in the fixture, one free one.
    expect(screen.getAllByText("Premium")).toHaveLength(2);
  });

  it("says a premium style costs credits once it is the selected one", async () => {
    render(<CaptionTemplatePicker value="viral-bold-01" onChange={() => {}} />);
    expect(await screen.findByText(/cost credits per minute/i)).toBeInTheDocument();
  });

  it("says nothing about credits for a free style", async () => {
    render(<CaptionTemplatePicker value="clean" onChange={() => {}} />);
    await screen.findByText("Clean");
    expect(screen.queryByText(/cost credits/i)).not.toBeInTheDocument();
  });

  it("falls back to the built-in styles when the fetch fails, rather than an empty picker", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<CaptionTemplatePicker value={null} onChange={() => {}} />);
    // "Clean" is one of the six templates compiled into lib/caption-templates.ts.
    expect(await screen.findByText("Clean")).toBeInTheDocument();
  });

  it("reports the chosen template id", async () => {
    const onChange = vi.fn();
    render(<CaptionTemplatePicker value={null} onChange={onChange} />);
    await userEvent.click(await screen.findByText("Viral Bold"));
    expect(onChange).toHaveBeenCalledWith("viral-bold-01");
  });

  it("filters by category when a tab is chosen", async () => {
    render(<CaptionTemplatePicker value={null} onChange={() => {}} />);
    await userEvent.click(await screen.findByRole("tab", { name: "Podcast" }));
    expect(screen.getByRole("button", { name: /Podcast.*Lower third/s })).toBeInTheDocument();
    expect(screen.queryByText("Viral Bold")).not.toBeInTheDocument();
  });
});

describe("CaptionRenderControls", () => {
  const props = {
    positionY: 65, onPositionYChange: vi.fn(),
    hookEnabled: false, onHookEnabledChange: vi.fn(),
    hookText: "", onHookTextChange: vi.fn(),
    applyToAll: false, onApplyToAllChange: vi.fn(),
  };

  it("states that apply-to-all does not render anything", () => {
    // A button that silently spends credits on twenty clips is a trap. The
    // copy has to say the render is separate.
    render(<CaptionRenderControls {...props} />);
    expect(screen.getByText(/Nothing is rendered until you export/i)).toBeInTheDocument();
  });

  it("exposes caption position as a labelled control", () => {
    render(<CaptionRenderControls {...props} />);
    expect(screen.getByLabelText(/Caption position/i)).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
  });

  it("hides the hook text box until hooks are switched on", () => {
    const { rerender } = render(<CaptionRenderControls {...props} />);
    expect(screen.queryByPlaceholderText(/stops the scroll/i)).not.toBeInTheDocument();
    rerender(<CaptionRenderControls {...props} hookEnabled />);
    expect(screen.getByPlaceholderText(/stops the scroll/i)).toBeInTheDocument();
  });

  it("offers AI suggestions and applies the one the user picks", async () => {
    const onHookTextChange = vi.fn();
    const onSuggestHooks = vi.fn(async () => ["You are doing this wrong", "Nobody told you this"]);
    render(
      <CaptionRenderControls {...props} hookEnabled onHookTextChange={onHookTextChange} onSuggestHooks={onSuggestHooks} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Suggest hooks/i }));
    await waitFor(() => expect(screen.getByText("Nobody told you this")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Nobody told you this"));
    // Suggestions are applied by the USER, never auto-applied — a confidently
    // wrong hook burned into a video is worse than no hook.
    expect(onHookTextChange).toHaveBeenCalledWith("Nobody told you this");
  });

  it("loads the account vocabulary and saves it on blur", async () => {
    const calls: { url: string; method?: string; body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      const terms = init?.method === "PUT" ? ["Clipiro", "Razorpay"] : ["Clipiro"];
      return new Response(JSON.stringify({ terms }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    render(<CaptionRenderControls {...props} />);
    const field = await screen.findByLabelText(/Caption vocabulary/i);
    await waitFor(() => expect(field).toHaveValue("Clipiro"));

    await userEvent.clear(field);
    await userEvent.type(field, "Clipiro, Razorpay");
    await userEvent.tab(); // blur triggers the save

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(JSON.parse(put.body!)).toEqual({ terms: ["Clipiro", "Razorpay"] });
    // The field reflects what the SERVER stored — it dedupes and caps, so
    // showing the local draft would lie about what will actually be sent.
    await waitFor(() => expect(field).toHaveValue("Clipiro, Razorpay"));
  });

  it("keeps the vocabulary field usable when the account fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<CaptionRenderControls {...props} />);
    expect(await screen.findByLabelText(/Caption vocabulary/i)).toHaveValue("");
  });

  it("keeps the manual text box usable when suggestions fail", async () => {
    const onSuggestHooks = vi.fn(async () => { throw new Error("gemini down"); });
    render(<CaptionRenderControls {...props} hookEnabled onSuggestHooks={onSuggestHooks} />);
    await userEvent.click(screen.getByRole("button", { name: /Suggest hooks/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Suggest hooks/i })).toBeEnabled());
    expect(screen.getByPlaceholderText(/stops the scroll/i)).toBeInTheDocument();
  });
});
