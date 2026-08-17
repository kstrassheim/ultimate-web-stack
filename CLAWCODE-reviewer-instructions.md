# CLAWCODE reviewer instructions

No special restrictions on how you review this project — with one exception,
below.

## Accepted decisions — do NOT require changes for these

- **The Entra/MSAL token cache lives in `localStorage`.** This is a known,
  reviewed and deliberately ACCEPTED trade-off for this project: we want the
  sign-in to survive a tab close, and we have accepted the cost. It is
  recorded the same way for the deployment tester in
  `CLAWCODE-tester-instructions.md`.

  Do not return CHANGES REQUIRED, and do not raise a blocking finding,
  *solely* because a PR sets the MSAL `cacheLocation` to `LocalStorage`,
  moves it there from `SessionStorage`, or keeps it there. That includes the
  usual re-wordings — "token readable by XSS", "use httpOnly/Secure cookies",
  "prefer sessionStorage", "durable token theft across browser restarts". They
  all describe the accepted decision above.

  Note it in your review as an accepted decision and move on. If a PR reverts
  the earlier sessionStorage change, that revert is intended, not a
  regression.

## What this does NOT cover

This exception is limited to **where the MSAL token cache is stored**. Review
everything else exactly as strictly as you normally would, including on the
same PR:

- any other security finding — a different XSS vector, a token leaking into a
  URL, a log, telemetry or the page source, a widened scope, a weakened
  redirect or authority setting;
- tests: the change must still be covered, and reaching green by skipping a
  test, lowering a coverage threshold or disabling a lint rule is still
  CHANGES REQUIRED;
- correctness, stale or now-wrong comments, and the acceptance criteria of the
  linked issue.

If a PR uses this exception as cover for something broader, say so and block
it.
