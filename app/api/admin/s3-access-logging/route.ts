import { NextResponse } from "next/server";
import { GetBucketLoggingCommand } from "@aws-sdk/client-s3";
import { withAdmin } from "@/lib/admin/api";
import { s3 } from "@/utils/s3-upload";
import { env } from "@/lib/env";

// Stage 9 (2026-08-30 audit): S3 access logging was turned on manually
// 2026-08-26 after the stale-presigned-URL/tenant-isolation fix (see
// project_stale_presigned_url_fix memory) — this is the "make sure it's
// still on" probe that follow-up called for, since a bucket policy change or
// a redeploy against a different bucket could silently turn it back off with
// nothing else noticing. Read-only: GetBucketLogging, never PutBucketLogging.
export const GET = withAdmin(async () => {
  try {
    const res = await s3.send(new GetBucketLoggingCommand({ Bucket: env.AWS_S3_BUCKET }));
    const enabled = !!res.LoggingEnabled;
    return NextResponse.json({
      enabled,
      bucket: env.AWS_S3_BUCKET,
      targetBucket: res.LoggingEnabled?.TargetBucket ?? null,
      targetPrefix: res.LoggingEnabled?.TargetPrefix ?? null,
    });
  } catch (err) {
    // Most likely cause: the app's IAM credentials aren't allowed to call
    // GetBucketLogging (it's a bucket-policy read, not an object read/write,
    // so the app's normal least-privilege object-level permissions may not
    // cover it). Reported as "can't verify", not folded into `enabled: false`
    // — those are different findings and shouldn't look the same on the page.
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ enabled: null, bucket: env.AWS_S3_BUCKET, error: message }, { status: 200 });
  }
});
