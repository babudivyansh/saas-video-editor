# Maestro flows (mobile Phase 14)

End-to-end flows for the Android app, run against a dev build on an emulator
or device (`npx expo run:android` in `apps/mobile`).

| Flow | What it does | Spends money? |
|---|---|---|
| `signup-autoclip-download.yaml` | Fresh @example.com sign-up, the emailed code, AutoClip from a link up to "Generate clips" | Only with `RUN_AUTOCLIP=true`: Clip Minutes, paid transcription, S3 uploads |
| `edit-export.yaml` | Log in, open a project's top clip in the editor, go to Export | Only with `RUN_EXPORT=true`: an AI credit and an S3 upload |

Run them against a **dev server that returns codes instead of emailing them**
(the local `clipiro-dev-noemail` launch config). The flags that spend stay off
unless the server has its own S3 bucket. The local server's `.env` points at
the real one.

```bash
maestro test -e API=http://localhost:3200 .maestro/signup-autoclip-download.yaml
```

The app on the emulator reaches the host as `10.0.2.2` (`EXPO_PUBLIC_API_URL`
in `.env.local`). `API` here is for the script step, which runs on the host.

After a run, delete the throwaway account from the repo root:
`npx tsx scratch/p5-check-user.ts maestro-…@example.com --delete`.
