// Fetches a fresh sign-up code for the email the flow just signed up with.
// Only works against a server that returns codes instead of emailing them
// (the local "clipiro-dev-noemail" server: issueOtp's devCode). Inputs:
// API (server origin), EMAIL. Output: output.code.
const res = http.post(`${API}/api/auth/register/resend`, {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL }),
});
const body = json(res.body);
if (!body.devCode) throw new Error(`No devCode from ${API} (status ${res.status}). Run the flows against a dev server that returns codes.`);
output.code = body.devCode;
