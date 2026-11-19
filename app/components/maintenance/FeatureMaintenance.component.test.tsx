// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureMaintenance } from "./FeatureMaintenance";
import FeatureMaintenancePage from "@/app/dashboard/maintenance/page";

describe("FeatureMaintenance", () => {
  it("names the feature and shows the exact maintenance copy", () => {
    render(<FeatureMaintenance featureName="AI Voiceover" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("AI Voiceover")).toBeInTheDocument();
    expect(screen.getByText("Under maintenance. Please check after some time.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/dashboard");
  });

  it("still reads sensibly without a feature name", () => {
    render(<FeatureMaintenance />);
    expect(screen.getByText("This feature")).toBeInTheDocument();
    expect(screen.getByText("Under maintenance. Please check after some time.")).toBeInTheDocument();
  });

  it("the page resolves the feature id from ?feature= to its name", async () => {
    render(await FeatureMaintenancePage({ searchParams: Promise.resolve({ feature: "auto-clip" }) }));
    expect(screen.getByText("Clipiro AutoClip")).toBeInTheDocument();
  });

  it("the page ignores an unknown feature id", async () => {
    render(await FeatureMaintenancePage({ searchParams: Promise.resolve({ feature: "<script>" }) }));
    expect(screen.getByText("This feature")).toBeInTheDocument();
  });
});
