# Design System: Gesture-3D: Synthetic Desire
**Project ID:** 6343532215243866841

## 1. Visual Theme & Atmosphere
The aesthetic is **Premium Dark Cinematic**. It combines the isolation of a deep-space void with the vibrant energy of 2077 cyberpunk. The interface feels like a high-end neural link or a film editing suite from the near future. It prioritizes **depth, glassmorphism, and neon luminescence** to create a dream-like state.

## 2. Color Palette & Roles
*   **Void Black (#05050a)**: The core background color. Used to create a sense of infinite space and eliminate browser borders.
*   **Deep Neural Navy (#0a0a14)**: Used for secondary backgrounds and structural containers that need more definition than the void.
*   **Synthetic Purple (#7c5cff)**: The primary energy color. Used for interactive buttons, active indicators, and spiritual energy.
*   **Digital Emerald (#00e5a0)**: The color of stability and tracking. Used for successful hand detection and "Normal" system states.
*   **Ethereal Rose (#ff6b9d)**: Used for high-energy highlights, errors, and "Anti-Gravity" warnings.
*   **Cyber Cyan (#00d4ff)**: Used for technical data, monospaced readouts, and medical/scientific overlays.
*   **Ghost White (#f0eef6)**: The primary text color, slightly tinted to avoid harsh contrast.

## 3. Typography Rules
*   **Outfit**: The main display and body font. It is geometric and modern, conveying a futuristic but premium feel.
*   **JetBrains Mono**: The technical font. Used exclusively for status pills, FPS counters, and AI system messages to suggest "code" and "precision."
*   **Letter Spacing**: Extended tracking (2px-4px) is used for titles and logos to enhance the cinematic look.

## 4. Component Stylings
*   **Glass Controls**: All UI panels use **Cyber Glass**—a semi-transparent indigo base (`rgba(20, 20, 45, 0.55)`) with a deep backdrop blur (`12px-16px`).
*   **Interactive Buttons**: Rounded edges (`radius-md: 12px`), subtle purple borders, and a glowing transition on hover.
*   **Status Pills**: Fully pill-shaped (`radius: 100px`) with a "living" status dot that pulses when active.
*   **Depth & Elevation**: Layers are defined by blur intensity and border glow rather than traditional shadows. Higher-z elements have sharper borders and brighter glows.

## 5. Layout Principles
*   **Floating HUD**: UI elements should feel like they are floating over the 3D canvas, never anchored to solid "header" or "footer" bars.
*   **Responsive Margins**: Large outer margins (`24px-28px`) on desktop to maintain a cinematic "letterbox" feel.
*   **Purity**: No visible scrollbars or standard browser chrome. Every element must look custom-built for this world.

## 6. Design System Notes for Stitch Generation
When generating new screens for Synthetic Desire, always use the following styles:
- **Backgrounds**: Use `#05050a` for the main canvas and `rgba(15, 15, 30, 0.75)` for cards.
- **Accents**: Primary `Purple (#7c5cff)`, Secondary `Emerald (#00e5a0)`.
- **Blur**: Apply `backdrop-filter: blur(12px)` to all overlays.
- **Geometry**: Use `12px` or `20px` border-radius. Avoid sharp corners.
- **Vibe**: Poetic, cinematic, haunting, and high-tech.
