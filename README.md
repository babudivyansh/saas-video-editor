# Clipiro — AI Faceless Video Generator

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
| PostgreSQL | 16 (local install or any reachable instance) |
| Redis | optional — falls back to in-memory in dev if unreachable |

Install FFmpeg: https://ffmpeg.org/download.html

No Docker is required for local development — point `DATABASE_URL` / `REDIS_URL` in `.env` at any reachable Postgres/Redis. (`docker-compose.yml` is kept in the repo for production/optional use.)

---

## Setup

### Quick start (first time)
```bash
cp .env.example .env   # fill in your API keys, then:
# Start a local Postgres (and optionally Redis) reachable at the URLs in .env,
# then create the database/user to match (see "Local database" below).
make setup             # install → migrate → seed
make dev               # → http://localhost:3000
```

### All available commands

| Command | What it does |
|---|---|
| `make dev` | Start Next.js dev server |
| `make build` | Production build |
| `make start` | Start production server |
| `make lint` | Run ESLint |
| `make install` | npm install |
| `make db-migrate` | Run Prisma migrations |
| `make db-seed` | Seed test user |
| `make db-reset` | Reset DB and re-run all migrations |
| `make db-studio` | Open Prisma Studio |
| `make generate` | Regenerate Prisma client |
| `make test-ffmpeg` | FFmpeg toolchain smoke test |
| `make setup` | Full first-time setup (install + migrate + seed) |

### Local database

Local dev needs a reachable **PostgreSQL 16** instance; **Redis is optional** (when it's
unreachable, `lib/redis.ts` transparently falls back to an in-memory store).

1. Install PostgreSQL locally (or use any reachable/managed instance) and, optionally, Redis.
2. Create a database and user matching `.env.example` (or edit `DATABASE_URL` to match yours):
   ```sql
   CREATE USER saas WITH PASSWORD 'saas';
   CREATE DATABASE saas_video OWNER saas;
   ```
3. Apply the schema and seed:
   ```bash
   make db-migrate && make db-seed
   ```

`docker-compose.yml` is retained for production/optional use, but Docker is not required for dev.

### Environment variables
Edit `.env` (copied from `.env.example`) with your real keys:
- `GEMINI_API_KEY` from Google AI Studio
- `ELEVENLABS_API_KEY` from ElevenLabs dashboard
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION` from AWS IAM
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` from Razorpay dashboard
- `JWT_SECRET` — generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## Verify the FFmpeg toolchain
```bash
make test-ffmpeg
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
  |- /api/billing/checkout Razorpay order creation
  +- /api/webhooks/razorpay Razorpay event handler (idempotent credit top-up)
```

**Job queue:** in-process async FIFO (`lib/job-queue.ts`). Works for single-instance dev/prod.
For multi-instance deployments, swap to BullMQ on Redis — the interface is identical.

---

## Razorpay setup

1. Create a Razorpay account at https://dashboard.razorpay.com
2. Copy your **Key ID** and **Key Secret** into `.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
3. Go to **Settings → Webhooks**, add a webhook pointing to `https://your-domain/api/webhooks/razorpay`
4. Enable the `payment.captured` event and copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`

Credit packs (amounts in INR paise, adjust in `app/api/billing/checkout/route.ts`):

| Pack ID | Price | Credits |
|---|---|---|
| `pack_starter` | ₹799 | 60 |
| `pack_pro` | ₹1,599 | 180 |
| `pack_studio` | ₹3,999 | 600 |

---

## Credit system

- New users get **30 free credits** (1 credit = 1 video render)
- Credits validated in Redis (fast path) and reconciled in Postgres (authoritative)
- Razorpay webhooks top up credits idempotently via the `RazorpayEvent` table
