import Razorpay from "razorpay";
import type { AxiosError, AxiosInstance } from "axios";
import { env } from "@/lib/env";

// The one place a server-side Razorpay client is built.
//
// The SDK creates its own axios instance and exposes no timeout option, so a
// Razorpay that accepts the connection and then stalls held checkout, verify,
// cancel or the refill cron open with no limit. This sets one on that instance.
//
// It also gives transport failures (timeout, DNS, reset) the SDK's normal
// rejection shape. The SDK's own error handler reads err.response.status
// unconditionally, so a request with no response used to surface as
// "Cannot read properties of undefined (reading 'status')".

/** Per request. Razorpay answers in well under a second when healthy. */
export const RAZORPAY_TIMEOUT_MS = 20_000;

type SdkInternals = { api?: { rq?: AxiosInstance } };

export function createRazorpay(): Razorpay {
  const client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const rq = (client as unknown as SdkInternals).api?.rq;
  // Absent only when "razorpay" is mocked in a test.
  if (rq) {
    rq.defaults.timeout = RAZORPAY_TIMEOUT_MS;
    rq.interceptors.response.use(undefined, (err: AxiosError) => {
      if (err.response) return Promise.reject(err);
      const timedOut = err.code === "ECONNABORTED" || err.code === "ETIMEDOUT";
      // Rejected in the shape the SDK's normalizeError expects, so callers get
      // { statusCode, error: { code, description } } like any API error.
      return Promise.reject({
        ...err,
        response: {
          status: timedOut ? 504 : 502,
          data: {
            error: {
              code: timedOut ? "GATEWAY_TIMEOUT" : "GATEWAY_ERROR",
              description: timedOut
                ? `Razorpay did not respond within ${RAZORPAY_TIMEOUT_MS / 1000}s`
                : `Could not reach Razorpay (${err.code ?? err.message})`,
            },
          },
        },
      });
    });
  }
  return client;
}
