import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as UI from "../src/index";
import fs from "fs";

const body = renderToStaticMarkup(
  <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 32, background: "#f9fafb", fontFamily: "sans-serif" }}>
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <UI.Button variant="primary" size="lg">Start Free</UI.Button>
      <UI.Button variant="secondary" size="lg">Watch Demo</UI.Button>
      <UI.Button variant="ghost" size="md">Learn more</UI.Button>
      <UI.Button variant="primary" size="md" loading>Loading</UI.Button>
    </div>
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <UI.Badge tone="success">Save 20%</UI.Badge>
      <UI.Badge tone="accent">Veo3-only</UI.Badge>
      <UI.Badge tone="primary">Popular</UI.Badge>
      <UI.CreditBadge cost="free" />
      <UI.CreditBadge cost={2} />
      <UI.CreditBadge cost={35} veo3 />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 280px)", gap: 24 }}>
      <UI.PricingCard
        name="Creator"
        price="₹799"
        subtitle="50 credits / month"
        features={["50 credits / month", "All AI tools", "1080p exports"]}
        ctaLabel="Get Creator"
      />
      <UI.PricingCard
        name="Pro"
        price="₹1,799"
        subtitle="140 credits / month"
        features={["140 credits / month", "All AI tools", "Priority rendering"]}
        highlighted
        badgeLabel="Most Popular"
        ctaLabel="Get Pro"
      />
      <UI.PricingCard
        name="Studio"
        price="₹3,999"
        subtitle="340 credits / month"
        features={["340 credits / month", "Priority rendering", "Dedicated support"]}
        ctaLabel="Get Studio"
      />
    </div>
    <div style={{ maxWidth: 600 }}>
      <UI.Alert tone="warning" title="You already have an active plan">
        Buying now will reset your subscription.
      </UI.Alert>
    </div>
  </div>
);

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Clipiro Design System Preview</title>
<link rel="stylesheet" href="../dist/styles.css" />
</head>
<body>${body}</body>
</html>`;

fs.writeFileSync("scratch/preview.html", html);
console.log("wrote scratch/preview.html");
