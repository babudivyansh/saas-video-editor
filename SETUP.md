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
