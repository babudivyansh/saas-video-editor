# Billing in the Android app — options (mobile Phase 12)

Status: **DRAFT, waiting for a decision** (§5). Nothing that takes money is
built until one is made (PLAYBOOK.md Phase 12).

What Clipiro sells today, on the web only, through Razorpay in INR and USD:
three subscriptions (Creator, Pro, and the plans above them, monthly or
yearly), AI-credit packs, clip-minute packs and auto top-up. The app's
Subscription and Credits screens were drawn from the design with these
prices and "buy" buttons, but nothing behind them takes payment yet.

## 1. What Google Play allows (checked 2026-10-10)

- **Everything Clipiro sells is "digital goods" under Play's Payments
  policy.** Subscriptions, "service upgrades", virtual currency (AI credits,
  minutes) and "cloud software and services" bought inside an app must use
  Google Play's billing. That holds unless the app is in one of Google's
  alternative-billing programs for that country.
- **The app may not point people to the website to pay.** That covers buttons,
  links, webviews, in-app messages, or "buy on clipiro.com" text next to the
  plans, and the app's store listing too. Outside the special programs, this
  is what gets apps rejected or removed.
- **India: user choice billing.** Since the CCI order (2023), an app can
  offer its own payment system *alongside* Play billing to users in India.
  - The person picks one of the two on a choice screen.
  - When they pick ours, Google's fee is **4 points lower** (e.g. 15% → 11%).
    Google still charges it, on our own payment too.
  - Each such sale must be reported to Google within 24 hours through the
    alternative billing API, or monthly by hand.
  - A web checkout shown inside the app's webview is allowed as that
    alternative.
- **US, UK and EEA (from 30 June 2026).**
  - **Fees:** a 10% service fee on auto-renewing subscriptions and on the
    first US$1M a year. Play's billing adds a 5% billing fee on top; using
    our own billing or a web link avoids that 5% but not the 10%.
  - **Linking out:** developers there may now offer their own billing or link
    to their own website, alongside Play.
  - **Elsewhere:** Google says the rest of the world comes later, with no
    date. India is not in it yet.
- **Everywhere else:** Play billing only. Fees are 15% on auto-renewing
  subscriptions, and 15% on the first US$1M a year of other sales (30% above
  that).
- **Already-bought plans.** A plan or credits bought on the web can be
  *used* in the app; Spotify and Netflix do this. The app just can't sell, or
  say where to buy. *This is how the policy is applied in practice, but the
  policy text doesn't spell it out. Confirm it in the Play Console's policy
  declaration before launch.*

Sources: Play Payments policy (support.google.com/googleplay/android-developer/answer/9858738),
India billing changes (…/answer/13306652), user choice billing (…/answer/13821247),
service fees (…/answer/112622), "Expanded billing choice and lower fees on
Google Play" (android-developers.googleblog.com/2026/06/play-expanded-billing.html).

## 2. What that means for the app's screens today

The Credits and Subscription screens show prices and pack "buy" rows. Shipping
them as they are, with no Play billing behind them, breaks the policy: either
the buttons do nothing, or they lead to the web. Whichever option is chosen,
the prices and buy rows must change before release.

Managing a plan bought on the web is not a purchase: showing it, cancelling
at period end and resuming are fine (web routes `/api/billing/cancel`,
`/resume`, `/details` exist). Invoices can be shown too.

## 3. Options

### A. Read-only at launch (recommended for v1)
- **What the app shows:**
  - Your plan, renewal date, minutes and credits left, and usage.
  - Cancel and resume.
  - Invoices.
  - No prices and no buy buttons.
  - When credits run out: "You’re out of AI credits", with no link to the web.
- **Purchases:** anything bought on the web (Razorpay) works in the app
  straight away. Same account, same balance.
- **Cost and effort:** no Play fees. The smallest build: Phase 12 ships
  without any payment code.
- **Risk:** people can't upgrade from the phone. Some will drift to the
  website on their own, some won't upgrade at all.

### B. Google Play Billing for everything
- **What gets built:**
  - Plans and packs become Play products: subscriptions with monthly/yearly
    base plans, and consumable credit and minute packs, priced per country
    in the Play Console.
  - In the app, Expo's in-app purchase module (`expo-iap`, needs a dev
    build).
  - **On the server, before adding anything:**
    - check each purchase with the Google Play Developer API
      (`purchases.subscriptionsv2`, `purchases.products`);
    - acknowledge it within 3 days, or Google refunds it;
    - consume packs;
    - follow renewals, cancellations and refunds through Real-time Developer
      Notifications (a Pub/Sub push to a new webhook route);
    - record which store each subscription came from, so a Play subscriber
      and a Razorpay subscriber are never billed twice and refunds reverse
      the right grant.
- **Cost and effort:**
  - Google's fees: 15% on subscriptions; 15%, then 30%, on packs. Lower in
    US/UK/EEA.
  - The largest build, about two stages.
  - Needs a Google Payments merchant account, Play products set up by you,
    and test licences.
- **Risk:** the same plan has two prices (web and Play), and support has to
  handle two refund paths.

### C. B plus user choice billing in India
- **What gets built:** B, plus Razorpay offered inside the app as the second
  choice for Indian users. Google's choice screen, then a Razorpay checkout,
  with each sale reported to Google within 24 h.
- **Cost:** saves 4 points of fee on the Indian sales where people pick
  Razorpay; Google still takes about 11%.
- **Effort:** more again: the choice flow, the reporting API, enrolment in
  the program, and UPI in the app.
- **Risk:** the most moving parts. Worth it only if Indian in-app revenue is
  large.

### D. Link out to the website (not available to us yet)
Allowed only in the US, UK and EEA programs (and Japan). India and the rest
are not covered. Revisit when Google extends it.

## 4. Recommendation

**A for launch, B when there's demand.**
- A ships Phase 12 without payment code, carries no policy risk, and costs
  no fees.
- Meanwhile, the server keeps a store field on subscriptions, so B can be
  added without a migration fight.
- Then measure how many app users hit "out of credits", and how many upgrade
  on the web within a week. If it's material, build B as its own phase. Add C
  only if Indian Play sales turn out to be large.

## 5. Decision needed

- **B1 — Billing at launch:** A (read-only, recommended) · B (Play billing)
  · C (B + India user choice billing).
- **B2 — Out of credits or minutes, with A:** a neutral message only
  (recommended; policy-safe) · or no message at all.
- **B3 — Web subscribers in the app:** show and manage (cancel/resume,
  invoices) (recommended) · or show only.
