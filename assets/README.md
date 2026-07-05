# Expo Assets Folder Instructions

This folder is intended to store all of your static assets for your Expo project.

## Organizing Assets:
- Place images in a separate folder (`assets/images/`).
- Place fonts in a separate folder (`assets/fonts/`).

## Accessing Assets:
- Use `require()` to reference assets in your components, e.g., `require('./assets/images/your-image.png')`.
- For web usage, use the `expo-asset` library to load and cache assets.

Keep this folder organized to simplify asset management throughout your development process!