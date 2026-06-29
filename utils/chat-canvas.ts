import { createCanvas, loadImage } from "@napi-rs/canvas";

const W = 1080;
const H = 1920;

export interface CanvasTheme {
  id?: string;
  bg: string;
  headerBg: string;
  headerText: string;
  receiverBubble: string;
  receiverText: string;
  senderBubble: string;
  senderText: string;
}

export interface CanvasMessage {
  type: "receiver" | "sender";
  text: string;
}

function hexToRgba(hex: string, alpha = 1): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Safe hex fallback: returns black if hex is malformed
function safeHex(hex: string, alpha = 1): string {
  try { return hexToRgba(hex, alpha); }
  catch { return `rgba(0,0,0,${alpha})`; }
}

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
  // Replace emoji with [?] to avoid rendering artifacts on servers without emoji fonts
  const clean = text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "[?]");
  const words = clean.split(" ");
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

export async function renderChatFrame(
  messages: CanvasMessage[],
  theme: CanvasTheme,
  contactName: string,
  avatarBuffer?: Buffer,
  showTyping = false,
): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const HEADER_H = 140;
  const BUBBLE_MAX_W = 720;
  const FONT_SIZE = 38;
  const LINE_H = 54;
  const PAD_X = 30;
  const PAD_Y = 20;
  const MSG_GAP = 16;
  const BORDER_R = 22;
  const SIDE_PAD = 28;
  const AVATAR_R = 34;

  // ── Background
  ctx.fillStyle = safeHex(theme.bg, 0.94);
  ctx.fillRect(0, 0, W, H);

  // ── Header
  ctx.fillStyle = safeHex(theme.headerBg);
  ctx.fillRect(0, 0, W, HEADER_H);

  // subtle bottom border on header
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(0, HEADER_H - 1, W, 1);

  // Back arrow
  ctx.fillStyle = safeHex(theme.headerText, 0.7);
  ctx.font = `bold 56px Arial`;
  ctx.textAlign = "left";
  ctx.fillText("‹", 28, 88);

  // Avatar circle centered
  const avatarCX = W / 2;
  const avatarCY = HEADER_H / 2 - 14;

  if (avatarBuffer) {
    try {
      const img = await loadImage(avatarBuffer);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarCX, avatarCY, AVATAR_R, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, avatarCX - AVATAR_R, avatarCY - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
      ctx.restore();
    } catch {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(avatarCX, avatarCY, AVATAR_R, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, AVATAR_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // Contact name
  ctx.fillStyle = safeHex(theme.headerText);
  ctx.font = `bold 34px Arial`;
  ctx.textAlign = "center";
  ctx.fillText(contactName.slice(0, 28), W / 2, avatarCY + AVATAR_R + 28);

  // Phone / video icons (right side of header)
  ctx.fillStyle = safeHex(theme.headerText, 0.7);
  ctx.font = `28px Arial`;
  ctx.textAlign = "right";
  ctx.fillText("📱  📹", W - 32, 84);

  // ── Messages
  ctx.textAlign = "left";
  let yPos = HEADER_H + 24;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isReceiver = msg.type === "receiver";
    const bubbleColor = safeHex(isReceiver ? theme.receiverBubble : theme.senderBubble);
    const textColor = safeHex(isReceiver ? theme.receiverText : theme.senderText);

    ctx.font = `${FONT_SIZE}px Arial`;
    const lines = wrapText(ctx, msg.text, BUBBLE_MAX_W - PAD_X * 2);
    const bubbleH = lines.length * LINE_H + PAD_Y * 2;

    // Compute bubble width based on longest line
    const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const bubbleW = Math.min(maxLineW + PAD_X * 2 + 8, BUBBLE_MAX_W);
    const bubbleX = isReceiver ? SIDE_PAD : W - SIDE_PAD - bubbleW;

    // Drop shadow
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // Bubble
    ctx.fillStyle = bubbleColor;
    roundRect(ctx, bubbleX, yPos, bubbleW, bubbleH, BORDER_R);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Text
    ctx.fillStyle = textColor;
    ctx.font = `${FONT_SIZE}px Arial`;
    for (let l = 0; l < lines.length; l++) {
      ctx.fillText(lines[l], bubbleX + PAD_X, yPos + PAD_Y + l * LINE_H + FONT_SIZE * 0.82);
    }

    // Timestamp + read receipts
    const hour = 9 + Math.floor(i / 2);
    const min = String((i * 7) % 60).padStart(2, "0");
    const timeStr = `${hour}:${min} ${hour < 12 ? "AM" : "PM"}`;
    ctx.font = `22px Arial`;
    ctx.fillStyle = isReceiver
      ? safeHex(theme.receiverText, 0.45)
      : safeHex(theme.senderText, 0.5);

    if (isReceiver) {
      ctx.textAlign = "left";
      ctx.fillText(timeStr, bubbleX, yPos + bubbleH + 22);
    } else {
      ctx.textAlign = "right";
      ctx.fillText(`${timeStr}  ✓✓`, bubbleX + bubbleW, yPos + bubbleH + 22);
    }
    ctx.textAlign = "left";

    yPos += bubbleH + MSG_GAP + 28;

    // Stop if near bottom (leave room for typing indicator)
    if (yPos > H - 240) break;
  }

  // ── Typing indicator
  if (showTyping) {
    const typingW = 130;
    const typingH = 72;
    const typingX = SIDE_PAD;
    const typingY = yPos;

    ctx.shadowColor = "rgba(0,0,0,0.15)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = safeHex(theme.receiverBubble);
    roundRect(ctx, typingX, typingY, typingW, typingH, BORDER_R);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    const dotY = typingY + typingH / 2;
    const dotR = 9;
    for (let d = 0; d < 3; d++) {
      ctx.fillStyle = safeHex(theme.receiverText, 0.65);
      ctx.beginPath();
      ctx.arc(typingX + 26 + d * 32, dotY, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas.toBuffer("image/png");
}
