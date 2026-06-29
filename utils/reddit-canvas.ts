import { createCanvas } from "@napi-rs/canvas";

const W = 1080;
const H = 1920;

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/gu, "").split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function renderRedditCard(opts: {
  postTitle: string;
  username: string;
  upvotes: string;
  comments: string;
  darkMode: boolean;
}): Promise<Buffer> {
  const { postTitle, username, upvotes, comments, darkMode } = opts;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── Color scheme
  const bg       = darkMode ? "#1a1a1b" : "#ffffff";
  const cardBg   = darkMode ? "#272729" : "#ffffff";
  const textMain = darkMode ? "#d7dadc" : "#1c1c1c";
  const textSub  = darkMode ? "#818384" : "#7c7c7c";
  const border   = darkMode ? "#343536" : "#edeff1";
  const orange   = "#ff4500";
  const upvoteColor = darkMode ? "#d7dadc" : "#1c1c1c";

  // ── Full canvas background (semi-transparent dark gradient at bottom)
  ctx.clearRect(0, 0, W, H);

  // Dark scrim covering bottom 55% of screen
  const scrimGrad = ctx.createLinearGradient(0, H * 0.38, 0, H);
  scrimGrad.addColorStop(0, "rgba(0,0,0,0)");
  scrimGrad.addColorStop(0.25, darkMode ? "rgba(0,0,0,0.82)" : "rgba(0,0,0,0.65)");
  scrimGrad.addColorStop(1, darkMode ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0.75)");
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, 0, W, H);

  // ── Card dimensions — centred vertically in bottom 50%
  const CARD_W = 980;
  const CARD_X = (W - CARD_W) / 2;
  const TITLE_FONT = 52;
  const META_FONT  = 28;
  const SUB_FONT   = 26;
  const PAD        = 36;

  // Measure title height
  ctx.font = `bold ${TITLE_FONT}px Arial`;
  const titleLines = wrapText(ctx, postTitle || "Reddit Post", CARD_W - PAD * 2);
  const titleHeight = titleLines.length * (TITLE_FONT + 12);
  const CARD_H = PAD + 48 + 16 + 32 + 20 + titleHeight + 20 + 48 + PAD;

  const CARD_Y = H - CARD_H - 100;

  // ── Card shadow
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;

  // ── Card background
  ctx.fillStyle = cardBg;
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 16);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // ── Card border
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 16);
  ctx.stroke();

  let y = CARD_Y + PAD;

  // ── Header row: subreddit icon + sub name + username
  // Orange Reddit circle icon
  ctx.fillStyle = orange;
  ctx.beginPath();
  ctx.arc(CARD_X + PAD + 20, y + 20, 20, 0, Math.PI * 2);
  ctx.fill();

  // "r" letter in circle
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 22px Arial`;
  ctx.textAlign = "center";
  ctx.fillText("r", CARD_X + PAD + 20, y + 27);
  ctx.textAlign = "left";

  // Subreddit name + username
  ctx.fillStyle = textMain;
  ctx.font = `bold ${META_FONT}px Arial`;
  ctx.fillText("r/AskReddit", CARD_X + PAD + 50, y + 16);

  ctx.fillStyle = textSub;
  ctx.font = `${SUB_FONT}px Arial`;
  ctx.fillText(`u/${username.slice(0, 20)}  ·  Posted`, CARD_X + PAD + 50, y + 44);

  y += 48 + 16;

  // ── Award badges (small colored circles)
  const awards = [
    { color: "#ffd700", label: "1" },
    { color: "#c0c0c0", label: "2" },
    { color: "#cd7f32", label: "3" },
  ];
  let awardX = CARD_X + PAD;
  for (const award of awards) {
    ctx.fillStyle = award.color;
    ctx.beginPath();
    ctx.arc(awardX + 10, y + 10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1b";
    ctx.font = `bold 11px Arial`;
    ctx.textAlign = "center";
    ctx.fillText(award.label, awardX + 10, y + 14);
    ctx.textAlign = "left";
    awardX += 28;
  }

  y += 32 + 20;

  // ── Post title
  ctx.fillStyle = textMain;
  ctx.font = `bold ${TITLE_FONT}px Arial`;
  for (const line of titleLines) {
    ctx.fillText(line, CARD_X + PAD, y);
    y += TITLE_FONT + 12;
  }

  y += 8;

  // ── Action row: upvote arrow + count + comments
  // Upvote button area
  ctx.fillStyle = darkMode ? "#272729" : "#f6f7f8";
  roundRect(ctx, CARD_X + PAD, y, 200, 42, 21);
  ctx.fill();

  ctx.fillStyle = upvoteColor;
  ctx.font = `bold 26px Arial`;
  ctx.textAlign = "center";
  ctx.fillText("▲", CARD_X + PAD + 26, y + 29);
  ctx.textAlign = "left";

  ctx.fillStyle = orange;
  ctx.font = `bold 26px Arial`;
  ctx.fillText(String(upvotes || "0"), CARD_X + PAD + 54, y + 29);

  ctx.fillStyle = upvoteColor;
  ctx.font = `bold 26px Arial`;
  ctx.fillText("▼", CARD_X + PAD + 120, y + 29);

  // Comments pill
  ctx.fillStyle = darkMode ? "#272729" : "#f6f7f8";
  roundRect(ctx, CARD_X + PAD + 216, y, 240, 42, 21);
  ctx.fill();

  ctx.fillStyle = textSub;
  ctx.font = `${SUB_FONT}px Arial`;
  ctx.fillText(`💬  ${comments || "0"} Comments`, CARD_X + PAD + 236, y + 29);

  // Share pill
  ctx.fillStyle = darkMode ? "#272729" : "#f6f7f8";
  roundRect(ctx, CARD_X + PAD + 472, y, 140, 42, 21);
  ctx.fill();

  ctx.fillStyle = textSub;
  ctx.font = `${SUB_FONT}px Arial`;
  ctx.fillText("↗  Share", CARD_X + PAD + 492, y + 29);

  // ── Subreddit info line at very top (optional subtle label)
  ctx.fillStyle = bg === "#ffffff" ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
  ctx.fillRect(CARD_X, CARD_Y, CARD_W, 2);

  return canvas.toBuffer("image/png");
}
