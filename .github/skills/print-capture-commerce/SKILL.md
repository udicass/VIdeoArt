---
name: print-capture-commerce
description: 'Port or build the Morphology-style high-resolution Three.js screen capture and complete limited-edition Print module in gesture-3d. Use when asked about print-ready capture, screen capture, artwork editions, print gallery, magnifier, cart, secret unlock, WhiteWall assets, or PayPal checkout.'
argument-hint: 'Describe the artwork, frame source, edition sizes, prices, and whether checkout should use PayPal sandbox or live.'
user-invocable: true
disable-model-invocation: false
---

# Print Capture And Commerce

Build the feature as two cooperating modules:

1. **Capture** produces a print-ready still from the existing Three.js scene without resizing the live renderer.
2. **Commerce** lets a visitor inspect a curated frame, choose an edition, and pay through server-validated PayPal checkout.

Read [architecture.md](./references/architecture.md) before editing. Read [validation.md](./references/validation.md) before testing or deploying.

## Source Of Truth

The proven reference implementation is in the sibling project:

- `D:/Users/User/Sonar/Morphology of a Plot/index.html`
- `D:/Users/User/Sonar/Morphology of a Plot/lib/paypal.js`
- `D:/Users/User/Sonar/Morphology of a Plot/api/paypal-config.js`
- `D:/Users/User/Sonar/Morphology of a Plot/api/paypal-create-order.js`
- `D:/Users/User/Sonar/Morphology of a Plot/api/paypal-capture.js`

Use it to confirm behavior, but adapt it to `gesture-3d`; do not paste the monolithic page wholesale.

## Procedure

1. Inspect `src/scene3d.js`, `src/main.js`, `index.html`, `src/style.css`, `api/_security.js`, `package.json`, and `vercel.json`.
2. Ask only for missing product decisions: eligible movies/frames, edition dimensions, edition count, price, currency, and unlock behavior.
3. Install `html2canvas` as a normal dependency if DOM overlays must appear in exported art. Do not add it when the output is WebGL-only.
4. Add the capture utility from [capturePrintReadyFrame.js](./assets/capturePrintReadyFrame.js) under `src/print/`, then expose a narrow method from `Scene3D` rather than accessing renderer internals throughout `main.js`.
5. Add a small print catalog module under `src/print/`. Keep artwork IDs and frame paths shared by the gallery and checkout UI, but keep authoritative prices and edition limits on the server.
6. Add accessible edition markup to `index.html` and styles to `src/style.css`. Include gallery, selected-frame state, magnifier, edition options, checkout state, success/error state, and a cart/resume path. Do not nest cards or replace the existing visual language.
7. Orchestrate the module from `src/main.js`. Pause webcam/voice/playback only when required and restore the exact prior state when the modal closes.
8. If secret access is requested, hide the entry points and guard every opening function. UI hiding alone is insufficient. Preserve the current access gate unless the user explicitly changes it.
9. Copy the PayPal templates from `assets/` into the indicated project paths, then replace all placeholder catalog values and brand text. Use CommonJS in `api/` and `lib/` because this repository's Vercel functions use `require` and `module.exports`.
10. Add the PayPal variables to `.env.example`; never copy real credentials into tracked files.
11. Update `vercel.json` only when function duration or CSP rules require it. The PayPal SDK domains must be allowed if a CSP is present.
12. Run the focused checks in [validation.md](./references/validation.md), then run `npm run build`.

## Required Invariants

- Never use the visible canvas dimensions as the print master dimensions.
- Restore camera aspect, render target, clear color/alpha, and temporarily hidden object visibility in `finally`.
- Flip WebGL pixel rows before writing to a 2D canvas.
- Do not trust browser-supplied price, currency, title, or edition size.
- Keep `PAYPAL_CLIENT_SECRET` server-only.
- Validate artwork, frame, and edition IDs server-side.
- Use the existing `guardApiRequest`, body-size validation, and rate limiting for mutating endpoints.
- PayPal sandbox must pass before switching to live.
- A successful payment is not an inventory lock. Document the fulfillment/inventory process or add transactional inventory before promising hard edition limits.
- Desktop and mobile must expose the same frame, edition, price, and checkout state.

## Bundled Templates

- [capturePrintReadyFrame.js](./assets/capturePrintReadyFrame.js) -> `src/print/capturePrintReadyFrame.js`
- [paypal.js](./assets/paypal.js) -> `lib/paypal.js`
- [paypal-config.js](./assets/paypal-config.js) -> `api/paypal-config.js`
- [paypal-create-order.js](./assets/paypal-create-order.js) -> `api/paypal-create-order.js`
- [paypal-capture.js](./assets/paypal-capture.js) -> `api/paypal-capture.js`

Treat templates as starting points. Replace placeholders and integrate with existing state; do not overwrite unrelated project behavior.

## Using The Skill

Invoke it explicitly in Copilot Chat:

```text
/print-capture-commerce Add print-ready capture and the complete Print module for SD3 and SD4. Use PayPal sandbox first, five curated frames per movie, and preserve the current access gate.
```

It may also load automatically for requests containing the discovery terms in the description.
