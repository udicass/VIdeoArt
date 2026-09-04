# Target Architecture

## Existing Owners

| Concern | Target owner | Integration rule |
|---|---|---|
| Three.js renderer, scene, camera | `src/scene3d.js` (`Scene3D`) | Add `capturePrintReadyFrame(options)` as the only public capture entry point. |
| App state and event wiring | `src/main.js` | Own selected artwork/frame/edition, open-close transitions, and lifecycle pause/resume. |
| Static accessible markup | `index.html` | Add print trigger, modal, gallery, lightbox, cart, status, and PayPal mount point. |
| Visual design and responsive states | `src/style.css` | Extend existing Synthetic Desires visual language and mobile breakpoints. |
| Video surface | `src/videoMesh.js` | Read the active video/movie identity; do not create a second video player. |
| API request security | `api/_security.js` | Use `guardApiRequest`, `ensureJsonBodySize`, and `enforceRateLimit`. |
| Vercel functions | `api/` | CommonJS only in this repository. |
| Product authority | `lib/paypal.js` | Server-only prices, edition sizes, allowed artwork IDs, and allowed frame ranges. |
| Public display assets | `public/prints/` | Keep tiered gallery, magnify, thumbnail, and optional print-master assets. |

`src/PostTrainingCapture.js` captures AI transcript data, not pixels. Do not overload it with artwork capture.

## Recommended File Layout

```text
src/print/
  capturePrintReadyFrame.js
  printCatalog.js
  printModule.js
public/prints/
  gallery/<artwork-id>-<frame>.jpg
  magnify/<artwork-id>-<frame>.jpg
  thumbs/<artwork-id>-<frame>.jpg
  masters/<artwork-id>-<frame>.png
lib/
  paypal.js
api/
  paypal-config.js
  paypal-create-order.js
  paypal-capture.js
```

## Capture Contract

`Scene3D.capturePrintReadyFrame(options)` should delegate to the bundled utility with:

```js
return capturePrintReadyFrame({
  THREE,
  renderer: this.renderer,
  scene: this.scene,
  camera: this.camera,
  overlayElement: document.querySelector('[data-print-overlay]'),
  hiddenObjects: [this.handCursor, this.handCursor2, this.handRing, this.handRing2, this.handLine],
  sceneId: activeMovieId,
  ...options
});
```

Decide deliberately whether gesture cursors, webcam PiP, HUD, subtitles, and AI text belong in the artwork. Default: omit controls, webcam, and diagnostics; include only an explicitly marked artwork overlay.

The utility renders to an offscreen WebGL target, restores renderer/camera state, flips rows, optionally composites a DOM overlay, lays the image into a print canvas with bleed, and downloads PNG. Prefer `canvas.toBlob()` over `toDataURL()` for large outputs when adapting the template.

## Print UI State

Keep one state object rather than unrelated globals:

```js
const printState = {
  unlocked: false,
  artworkId: null,
  frame: 1,
  editionId: null,
  cart: null,
  view: 'gallery', // gallery | checkout | success
  playbackSnapshot: null
};
```

Required transitions:

1. `open(artworkId)` validates unlock and catalog eligibility.
2. `selectFrame(frame)` updates gallery, magnifier, subtitle, and checkout preview.
3. `selectEdition(editionId)` creates cart state and opens checkout.
4. `close()` restores the precise prior camera/video/voice/webcam state.
5. `resumeCart()` restores artwork, frame, edition, and checkout view.
6. Successful capture displays fulfillment details without exposing secrets.

## Gallery Asset Tiers

Use one naming convention across client and server, for example `sd3-01`:

| Tier | Suggested dimensions | Purpose |
|---|---:|---|
| `thumbs` | 300 x 225 | selector/navigation |
| `gallery` | 1200 x 900 | modal gallery |
| `magnify` | 2400 x 1800 | zoom/lightbox |
| `masters` | 6000 x 4500 PNG | production source; do not load by default |

All visible images need useful alt text. Keep a stable 4:3 container to prevent layout shifts.

## PayPal Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Config as /api/paypal-config
    participant Create as /api/paypal-create-order
    participant PayPal
    participant Capture as /api/paypal-capture

    Browser->>Config: GET public client ID/environment
    Browser->>PayPal: Load official SDK
    Browser->>Create: artworkId + editionId + frame
    Create->>Create: Resolve server catalog and price
    Create->>PayPal: Create order with secret token
    PayPal-->>Browser: Buyer approval
    Browser->>Capture: orderId
    Capture->>PayPal: Capture order
    Capture-->>Browser: Sanitized fulfillment details
```

The browser sends identifiers only. The server derives description and amount from `lib/paypal.js`.

## Environment

Add placeholders to `.env.example`:

```dotenv
# PayPal print checkout
# PAYPAL_CLIENT_ID=
# PAYPAL_CLIENT_SECRET=
# PAYPAL_ENVIRONMENT=sandbox
```

Use sandbox credentials locally and in preview deployments. Set live credentials only in the production environment and redeploy.

## CSP And Vercel

If a Content-Security-Policy is added, allow the chosen PayPal environment in `script-src`, `connect-src`, and `frame-src`. Do not loosen unrelated directives.

Suggested Vercel function durations:

- `api/paypal-config.js`: default
- `api/paypal-create-order.js`: 30 seconds
- `api/paypal-capture.js`: 30 seconds

## Secret Unlock

When requested, implement both presentation and route guards:

- Hide print triggers and cart until unlocked.
- Count deliberate logo/mark clicks in session memory only unless persistence is explicitly requested.
- `openPrintModule`, cart restore, keyboard shortcuts, and deep-link handlers must all check `printState.unlocked`.
- The server endpoints do not need the UI unlock token; they must still validate origin, rate, input IDs, and catalog values.
