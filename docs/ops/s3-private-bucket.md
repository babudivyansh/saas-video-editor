# Making the media bucket private

**Status (2026-10-23):** code is ready (this PR). The AWS console steps below
are still owed and are done by hand — nothing in the deploy does them.

## Why

Verified 2026-08-26 (`docs/source-url-tenant-isolation-incident.md`): the media
bucket answers an **unsigned** `GET https://<bucket>.s3.<region>.amazonaws.com/<key>`
with 200. Every upload, render, avatar, voiceover and account-data export was
readable by anyone holding its key; the UUID in the key was the only control.
Keys appear in the database, API responses and client-side URLs.

## What the code does now

Stored media URLs keep their permanent unsigned form in the database (the key
is the durable part). Every **read** mints a presigned URL from the key:

| Reader | How |
| --- | --- |
| Client-facing JSON (clips, projects, dubs, `/api/auth/me`, reviews, tool job `meta`, public `/api/v1`) | `resignMediaUrl` (server-written columns) / `resignOwnedMediaUrl` (client-settable columns — ownership proven first) |
| Server fetches (clip download, zip download, dub source, editor captions) | `fetchableMediaUrl` / `getAssetReadUrl(s3Key)` |
| YouTube publish | SDK `GetObject` stream (`openS3ObjectStream`) — already did |
| Third parties (ElevenLabs dubbing, Submagic, GPU/ASD) | short-lived presigned URL |

Presigned URLs are signed against a 15-minute window (`utils/s3-upload.ts`), so
a polled list returns byte-identical URLs and `<video>` elements don't reload.

**`CDN_BASE_URL` must stay unset** (or the distribution must enforce signed
URLs/cookies). When it is set, `getAssetReadUrl` returns a plain CDN URL, and a
CloudFront distribution with an Origin Access Control would then re-publish the
private bucket to the world.

## 1. Lifecycle rules (do first — safe on a public or private bucket)

Account-data exports (`exports/<userId>/<jobId>.json`, the whole account as
JSON) and asset zips (`zips/<userId>/<jobId>.zip`) are only ever handed out as
24-hour presigned links, and no database row points at them. Account purge now
deletes both prefixes (`lib/account-deletion.ts`); the lifecycle rule removes
everything else after a day.

Console: **S3 → the media bucket → Management → Lifecycle rules → Create rule**,
once per prefix:

| Rule name | Prefix | Action |
| --- | --- | --- |
| `expire-account-exports` | `exports/` | Expire current versions of objects — **1 day** after creation |
| `expire-asset-zips` | `zips/` | Expire current versions of objects — **1 day** after creation |
| `abort-incomplete-multipart` | *(whole bucket)* | Delete expired object delete markers or incomplete multipart uploads — **7 days** |

If bucket versioning is on, also tick *Permanently delete noncurrent versions*,
1 day, on the first two — otherwise expiry only adds a delete marker and the
JSON is still there.

CLI equivalent:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket "$AWS_S3_BUCKET" --lifecycle-configuration '{
  "Rules": [
    { "ID": "expire-account-exports", "Status": "Enabled", "Filter": { "Prefix": "exports/" },
      "Expiration": { "Days": 1 }, "NoncurrentVersionExpiration": { "NoncurrentDays": 1 } },
    { "ID": "expire-asset-zips", "Status": "Enabled", "Filter": { "Prefix": "zips/" },
      "Expiration": { "Days": 1 }, "NoncurrentVersionExpiration": { "NoncurrentDays": 1 } },
    { "ID": "abort-incomplete-multipart", "Status": "Enabled", "Filter": {},
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 } }
  ]
}'
```

`put-bucket-lifecycle-configuration` **replaces** the whole configuration — run
`aws s3api get-bucket-lifecycle-configuration --bucket "$AWS_S3_BUCKET"` first
and merge any rules already there.

S3 runs expiry once a day (around 00:00 UTC), so an object lives 1–2 days, never
less than the 24 hours its download link is valid for.

## 2. Music catalogue: its own public location

Block Public Access is per bucket, so a public `music/` prefix inside the media
bucket is not an option. Decision: background-music tracks (licensed catalogue,
not user data) live in a **separate public-read bucket**, e.g.
`clipiro-public-assets`, under `music/<slug>.mp3`.

1. Create the bucket (same region). Leave *Block all public access* **off** for
   this bucket only.
2. Bucket policy — public read of `music/*` only:
   ```json
   { "Version": "2012-10-17", "Statement": [{
       "Sid": "PublicMusic", "Effect": "Allow", "Principal": "*",
       "Action": "s3:GetObject", "Resource": "arn:aws:s3:::clipiro-public-assets/music/*" }] }
   ```
3. Upload the tracks listed in `lib/music/catalog.ts` as `music/<slug>.mp3`.
4. Set `NEXT_PUBLIC_MUSIC_BASE=https://clipiro-public-assets.s3.<region>.amazonaws.com/music`
   in the production env and rebuild (it is inlined at build time).

Unset, the catalogue falls back to the app's own `/music` path
(`public/music/`). Nothing imports the catalogue today (the create products
that used it were removed 2026-09-10), so this blocks nothing at launch.
Never put anything user-generated in the public bucket.

## 3. Turn on Block Public Access

Prerequisite: this PR is **deployed** to production (`/api/health` green after
the deploy). Turning BPA on before the deploy breaks every video and thumbnail.

1. **Record the current state** (for rollback):
   ```bash
   aws s3api get-bucket-policy --bucket "$AWS_S3_BUCKET" > policy-before.json
   aws s3api get-public-access-block --bucket "$AWS_S3_BUCKET"
   aws s3api get-bucket-ownership-controls --bucket "$AWS_S3_BUCKET"
   ```
2. **Remove the public-read grant.** Console: *Permissions → Bucket policy* —
   delete any statement with `"Principal": "*"` and `s3:GetObject`. If
   *Object Ownership* is not *Bucket owner enforced*, switch it to that
   (disables ACLs, so per-object `public-read` ACLs stop working too).
3. **Block Public Access.** Console: *Permissions → Block public access (bucket
   settings) → Edit* → tick **Block all public access** (all four) → Save →
   type `confirm`.
4. **Keep CORS.** Do not touch the bucket's CORS configuration: browser uploads
   (presigned PUT, multipart) and presigned GETs still need it.

### Verify

Pick any real object key (e.g. a recent clip's `renders/<projectId>/clip-….mp4`
from the database).

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://$AWS_S3_BUCKET.s3.$AWS_REGION.amazonaws.com/renders/<projectId>/clip-<n>.mp4"
```

**Expect `403`.** A `200` means the bucket is still public — stop and recheck
steps 2–3.

```bash
aws s3 presign "s3://$AWS_S3_BUCKET/renders/<projectId>/clip-<n>.mp4" --expires-in 300 | xargs -I{} curl -s -o /dev/null -w "%{http_code}\n" "{}"
```

**Expect `200`** (the signed path still works).

Then in the signed-in app (production):

- Library / a project's clips page — thumbnails and clip videos play.
- A clip's **Download** and **Download all** — both save a file.
- Settings → Profile — the uploaded avatar shows.
- Any AI tool result (voiceover) — plays.
- Account → export data — the link downloads.

### Rollback

```bash
aws s3api delete-public-access-block --bucket "$AWS_S3_BUCKET"
aws s3api put-bucket-policy --bucket "$AWS_S3_BUCKET" --policy file://policy-before.json
```

## Known limits

- The voiceover tool keeps its recent-results list in `localStorage`. Entries
  saved before the switch hold unsigned URLs (now 403) and new ones expire after
  about 6 hours. The audio itself is safe in the user's Assets library.
- The home and reviews pages are ISR (`revalidate = 3600`) and embed signed
  avatar/attachment URLs (~6 h lifetime). After more than ~6 h with no traffic,
  the first visitor gets the stale page with expired images while it
  regenerates. Review attachments already behaved this way.
- `scripts/verify-music-assets.mjs` still HEADs the media bucket; point it at
  the public-assets bucket once that exists.
