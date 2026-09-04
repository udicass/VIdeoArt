# Validation

## Static Checks

1. Run `npm run build`.
2. Confirm no real PayPal credentials appear in tracked files.
3. Confirm all client checkout requests send identifiers, never prices.
4. Confirm every mutating API uses `guardApiRequest`, `ensureJsonBodySize`, and `enforceRateLimit`.
5. Confirm capture cleanup is in `finally` and camera/renderer state is restored.

## Capture Checks

Test at desktop and mobile viewport sizes:

- Capture while the active movie is playing.
- Output is nonblank and correctly oriented.
- Output dimensions equal the configured print dimensions.
- 4:3 crop and bleed are correct.
- Hidden HUD/webcam/gesture controls do not leak into the artwork.
- Intended subtitle/art overlay appears at print resolution.
- Live renderer size, camera framing, object visibility, and animation continue unchanged after capture.
- Repeated captures do not leak render targets or object URLs.
- Cross-origin video textures are either CORS-enabled or produce a clear unsupported-state message.

Use Playwright screenshots for UI framing, but inspect downloaded PNG dimensions and representative pixels separately. A screenshot of the visible canvas does not validate the print file.

## Print UI Checks

- Locked entry points are absent and programmatic open calls are rejected.
- The configured unlock count reveals access exactly once per session.
- Gallery has correct frame count, labels, thumbnails, arrows, scroll sync, and keyboard navigation.
- Lightbox supports 100%, 125%, and 150%, reset, and bounded pan.
- Selecting a frame updates title/subtitle, preview, cart, and order payload consistently.
- Closing/reopening preserves the intended cart state.
- Modal focus enters on open, Escape closes the topmost layer, and focus returns to the trigger.
- No controls overlap at 390 x 844, 768 x 1024, 1440 x 900, or 1920 x 1080.
- Existing webcam, gesture, movie, voice, and access-gate workflows resume correctly after close.

## API Checks

Before credentials are configured:

- `GET /api/paypal-config` returns `503` without leaking details.
- Invalid methods return `405`.
- Disallowed origins return `403`.
- Oversized bodies return `413`.
- Unknown artwork, edition, or frame returns `400`.

With PayPal sandbox credentials:

1. `GET /api/paypal-config` returns public client ID, `sandbox`, and currency.
2. Create order returns an ID for every valid catalog combination.
3. Browser-supplied fake price fields have no effect.
4. Buyer cancellation leaves checkout recoverable.
5. Approved order captures as `COMPLETED`.
6. Success response includes only required payer/shipping fields.
7. PayPal dashboard description/custom ID matches artwork, frame, and edition.
8. Duplicate capture is handled as an error or known completed order, not a second charge.

## Release Gate

- Keep `PAYPAL_ENVIRONMENT=sandbox` until the full browser flow passes.
- Verify production asset URLs and CORS headers.
- Verify the production page and all three endpoints after deployment.
- Confirm the git worktree contains no generated captures, secrets, or unrelated files.
