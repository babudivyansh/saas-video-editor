# ClipForge — AI Faceless Video Generator

A Crayo.ai-style SaaS that turns a text prompt into a 9:16 vertical short-form video with:
- AI script (Google Gemini)
- AI voiceover + word-level timestamps (ElevenLabs)
- Animated bouncy word-by-word captions (ASS subtitles via FFmpeg)
- Background video + ducked music mix
- AWS S3 storage for assets and renders
- Stripe billing for credit top-ups

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 18 |
| FFmpeg | any recent build, must be on PATH |
| Docker + Docker Compose | for local Postgres + Redis |

Install FFmpeg: https://ffmpeg.org/download.html

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Edit `.env` and fill in your real API keys:
- `GEMINI_API_KEY` from Google AI Studio
- `ELEVENLABS_API_KEY` from ElevenLabs dashboard
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION` from AWS IAM
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` from Stripe dashboard
- `JWT_SECRET` — generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### 3. Start local database and Redis
```bash
docker-compose up -d
```

### 4. Run database migrations
```bash
npm run db:migrate
```

When prompted for a migration name, enter something like `init`.

### 5. Seed the test user
```bash
npm run db:seed
```

Creates `test@example.com` / `password123` with 30 credits.

### 6. Start the development server
```bash
npm run dev
```

Open http://localhost:3000

---

## Verify the FFmpeg toolchain
```bash
npm run test:ffmpeg
```

Writes a test `.ass` caption file, runs FFmpeg with a synthetic input, and confirms a portrait 9:16 clip is produced. Run this before testing the full render pipeline.

---

## GitHub remote (first push)

After the initial commit, link to your repo:
```bash
git remote add origin https://github.com/<your-username>/saas-video-editor.git
git push -u origin main
```

---

## Architecture

```
Browser -> Next.js App Router -> API routes
  |- /api/auth/*           JWT auth + Redis session cache
  |- /api/projects/*       CRUD (Postgres via Prisma)
  |- /api/generate/script  Gemini AI script generation
  |- /api/generate/voice   ElevenLabs TTS + word timings -> S3
  |- /api/generate/compile Credit check -> in-process queue -> FFmpeg -> S3
  |- /api/billing/checkout Stripe checkout session
  +- /api/webhooks/stripe  Stripe event handler (idempotent credit top-up)
```

**Job queue:** in-process async FIFO (`lib/job-queue.ts`). Works for single-instance dev/prod.
For multi-instance deployments, swap to BullMQ on Redis — the interface is identical.

---

## Stripe setup

1. Create 3 products in your Stripe dashboard with these exact price IDs:
   - `price_starter` — $9 -> 60 credits
   - `price_pro` — $19 -> 180 credits
   - `price_unlimited` — $49 -> 600 credits
2. Point the Stripe webhook to `https://your-domain/api/webhooks/stripe`
3. Enable the `checkout.session.completed` event

---

## Credit system

- New users get **30 free credits** (1 credit = 1 video render)
- Credits validated in Redis (fast path) and reconciled in Postgres (authoritative)
- Stripe webhooks top up credits idempotently via the `StripeEvent` table
