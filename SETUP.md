# Local setup — environment & API keys

Every tool's backend is already implemented. The only thing standing between a
fresh clone and fully working tools is **configuration**: until a tool's API key
is filled in, its route returns `503 "not configured"`.

## 1. Create your `.env`

```bash
cp .env.example .env
```

`.env` is gitignored — **never commit real keys.** `.env.example` holds only empty
placeholders and should stay that way.

## 2. Required core (everything needs these)

| Key | What it's for | Where to get it |
|---|---|---|
| `DATABASE_URL` | Postgres (users, credits, projects) | Local default works if Postgres is running |
| `REDIS_URL` | Credit cache / sessions | Local default; falls back to in-memory if unreachable |
| `JWT_SECRET` | Auth tokens | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |

## 3. Per-tool keys — fill in only what you want to use

| Tool (page) | Env key(s) needed | Get key at |
|---|---|---|
| **AI Brainstormer** (`/dashboard/tools/brainstormer`) | `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| **AI Image Generator** (`/dashboard/tools/image-generator`) | `TOGETHER_API_KEY` + AWS S3* | https://api.together.xyz/settings/api-keys |
| **AI Voiceover** (`/dashboard/tools/voiceover`) | `ELEVENLABS_API_KEY` + AWS S3* | https://elevenlabs.io/app/settings/api-keys |
| **AI Speech Enhancer** (`/dashboard/tools/enhance-speech`) | `ELEVENLABS_API_KEY` | same as above |
| **AI Voice Changer** (`/dashboard/tools/voice-changer`) | `ELEVENLABS_API_KEY` | same as above |
| **AI Vocal Remover** (`/dashboard/tools/vocal-remover`) | `FAL_KEY` | https://fal.ai/dashboard/keys |
| **AI Video Generator (VEO3)** (`/dashboard/tools/video-generator`) | `FAL_KEY` | same as above |
| **AI Subtitle Remover** (`/dashboard/tools/subtitle-remover`) | None — needs **FFmpeg** on PATH | https://ffmpeg.org/download.html |
| **Create / video pipeline** (`/dashboard/create/*`) | `ELEVENLABS_API_KEY` + AWS S3* + FFmpeg | as above |

\* **AWS S3** = `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`,
`AWS_REGION`. The region **must match** the region the bucket was created in
(e.g. `ap-south-1`) — a mismatch fails uploads even with valid credentials.

## 4. Optional (only for specific flows)

| Key | Needed for |
|---|---|
| `RAZORPAY_KEY_ID` / `_SECRET` / `_WEBHOOK_SECRET` | Paid plans / credit purchases |
| `HEYGEN_API_KEY` + `HEYGEN_AVATAR_*` | AI Creator avatar video generation |

## 5. Verify

```bash
npx tsc --noEmit          # type check — should be clean
npm run dev               # start the app
```

Then sign in and try a tool. If you see `503 "not configured"`, that tool's key
is still empty. If you see `402 "Insufficient credits"`, top up credits (or use
the admin panel). Each paid tool deducts credits and **refunds automatically** if
the generation fails.

## 6. Production deploy (Hostinger / cPanel Node.js App Manager)

The app is deployed live at clipiro.com via cPanel's **Setup Node.js App**
(Passenger/LiteSpeed), not Docker or a bare VPS process manager.

- **Application root**: the repo directory (e.g. `saas-video-editor`)
- **Application startup file**: `.next/standalone/server.js` (matches the
  `start` script — Next's standalone output already bundles a minimal server)
- **Deploy steps** after pushing new code to the server:
  1. `git pull` (or re-upload) in the application root
  2. In cPanel's Node.js app page, click **Run NPM Install** — this runs
     `npm install`, which via `postinstall` runs `prisma generate`
  3. Run the build: `npm run build` (this also runs `prisma migrate deploy`
     first, applying any new migrations) — via SSH, or a cPanel terminal/cron
     "run once" if SSH isn't available
  4. Click **Restart** in the Node.js app page so Passenger picks up the new
     `.next/standalone` output
- `scripts/postbuild.js` additionally copies `public/` and `.next/static/`
  into the site's `public_html` so static assets are served directly by
  Apache/LiteSpeed instead of proxied through the Node process.
- If a migration needs to be applied without a full rebuild (e.g. a hotfix),
  run `npm run db:migrate:deploy` directly over SSH.

## 7. Cron Jobs (cPanel)

Three routes expect an external scheduler and are fail-closed (401) unless
`CRON_SECRET` / `SOCIAL_REFRESH_SECRET` are set in `.env` — set them, then add
matching entries under cPanel → **Cron Jobs**:

```
# Monthly credit refill + subscription expiry — daily is enough, the route
# itself only acts on users whose nextRefillAt/subscriptionEndsAt is due.
0 3 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://clipiro.com/api/cron/refill-credits

# Social Tracker snapshot refresh
0 * * * * curl -s -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" https://clipiro.com/api/cron/social-refresh

# Affiliate commission payout notifications — daily is enough; the route only
# acts on commissions whose 30-day hold has already elapsed, so a missed day
# self-heals on the next run. Also reachable on demand via
# POST /api/admin/commissions/run-payout-sweep (admin-authenticated).
0 4 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://clipiro.com/api/cron/commission-payout
```

Use cPanel's Cron Jobs UI to enter the schedule and command — it writes to the
same underlying crontab, this is just documenting what to enter.
