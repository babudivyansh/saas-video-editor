import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { DIWALI, diwaliOfferId, diwaliPhase } from "@/lib/campaigns/diwali";

export const alt = "Clipiro — Create Viral Shorts From Long Videos in Seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Regenerated hourly so the Diwali card (until 15 Nov 2026) swaps back to the
// standard one without a redeploy.
export const revalidate = 3600;

export default async function OpengraphImage() {
  if (diwaliPhase() !== "over") return diwaliCard();
  return standardCard();
}

async function logoDataUri(): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), "public", "logo-emerald.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null; // standalone build without public/: fall back to a text wordmark
  }
}

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];

async function diwaliCard() {
  const logo = await logoDataUri();
  const offer = diwaliOfferId() !== null;
  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", background: "#050908", color: "#eef5f1", fontFamily: "Arial, sans-serif" }}>
        {/* Marigold toran */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, display: "flex" }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} style={{ width: 18, height: 18, margin: "4px 11px", borderRadius: 9, background: i % 2 ? "#ffd23f" : "#ff9f1c" }} />
          ))}
        </div>
        {/* Rangoli */}
        <svg width="560" height="560" viewBox="0 0 300 300" style={{ position: "absolute", right: -90, top: 60 }}>
          <circle cx="150" cy="150" r="140" fill="none" stroke="#f5b544" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="2 8" />
          {PETALS.map((r) => <ellipse key={`o${r}`} cx="150" cy="62" rx="16" ry="38" fill="#ff9f1c" fillOpacity="0.85" transform={`rotate(${r} 150 150)`} />)}
          {PETALS.map((r) => <ellipse key={`g${r}`} cx="150" cy="92" rx="11" ry="26" fill="#00a968" transform={`rotate(${r + 22.5} 150 150)`} />)}
          <circle cx="150" cy="150" r="44" fill="#ffd23f" />
          <circle cx="150" cy="150" r="30" fill="#d9661f" />
          <circle cx="150" cy="150" r="14" fill="#fff3c4" />
        </svg>

        <div style={{ position: "absolute", left: 72, top: 96, width: 660, display: "flex", flexDirection: "column" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} width={163} height={56} alt="" />
          ) : (
            <div style={{ fontSize: 40, fontWeight: 800, color: "#20d68a" }}>Clipiro</div>
          )}
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", fontSize: 84, fontWeight: 800, lineHeight: 1, letterSpacing: "-3px" }}>
            <span>Live this</span>
            <span style={{ color: "#ffd23f", fontStyle: "italic", fontFamily: "Georgia, serif", fontWeight: 400 }}>Diwali</span>
          </div>
          <div style={{ marginTop: 22, fontSize: 28, color: "#a9bdb3" }}>
            {offer ? `Launches 8 Nov · Diwali offer ends ${DIWALI.endLabel}` : "Launching 8 November 2026"}
          </div>
          {offer && (
            <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ padding: "12px 20px", borderRadius: 12, background: "#ffd23f", color: "#1a0f02", fontSize: 26, fontWeight: 800 }}>
                {`${DIWALI.yearlyPct}% + extra ${DIWALI.extraPct}% off yearly`}
              </div>
              <div style={{ padding: "10px 18px", borderRadius: 12, border: "2px dashed #f5b544", color: "#ffd23f", fontSize: 24, fontWeight: 700, letterSpacing: "2px" }}>
                {DIWALI.code}
              </div>
            </div>
          )}
        </div>

        {/* Row of diyas */}
        <div style={{ position: "absolute", left: 72, right: 72, bottom: 34, display: "flex", justifyContent: "space-between" }}>
          {Array.from({ length: 12 }, (_, i) => (
            <svg key={i} width="44" height="44" viewBox="0 0 36 36">
              <path d="M18 3c3.4 5 4.4 8.5 0 13c-4.4-4.5-3.4-8 0-13z" fill="#ffcf5a" />
              <path d="M3 19h30c-1.5 7-7.5 11-15 11S4.5 26 3 19z" fill="#d9661f" />
            </svg>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

function standardCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #050908 0%, #06291c 55%, #00a968 100%)",
          color: "#f5f7f4",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            fontSize: 64,
            fontWeight: 800,
            letterSpacing: "-2px",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "rgba(255,255,255,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
            }}
          >
            ▶
          </div>
          Clipiro
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 58,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-1.5px",
            maxWidth: 980,
          }}
        >
          Create viral shorts from long videos in seconds
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            opacity: 0.92,
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          AI clipping, captions, and one-click formatting for Reels &amp; Shorts
        </div>
      </div>
    ),
    size,
  );
}
