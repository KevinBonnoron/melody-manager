# App Icon Setup

The app icon has been configured to use your custom purple gradient "M" design from `client/public/icon.svg`.

## Quick Start

To generate all app icons and splash screens for Android and iOS:

```bash
cd client
bun install
bun run cap:assets
```

This will generate all required icon sizes automatically:
- Android: mipmap resources (36px to 192px)
- iOS: AppIcon assets (20pt to 1024pt)
- Adaptive icons with purple background
- Splash screens

## What Changed

1. **Added `@capacitor/assets`** to `client/package.json` devDependencies
2. **Added `cap:assets` script** to easily generate icons
3. **Created `client/resources/`** directory with your icon
4. **Updated GitHub Actions** to auto-generate icons on every build
5. **Configured purple gradient** (#7C3AED) as background color

## Icon Source

The source icon is at `client/resources/icon.svg` (copied from `client/public/icon.svg`).

## Customization

To change colors or create custom splash screens, edit the `cap:assets` script in `client/package.json`:

```json
"cap:assets": "bunx @capacitor/assets generate --iconBackgroundColor '#YOUR_COLOR' --splashBackgroundColor '#YOUR_COLOR'"
```

## After Generation

The icons are automatically placed in:
- `client/android/app/src/main/res/mipmap-*/`
- `client/ios/App/App/Assets.xcassets/AppIcon.appiconset/` (when iOS is added)

Don't forget to run `bun run cap:sync` to sync changes with native projects.

## CI/CD

The GitHub Actions workflow (`android.yml`) automatically runs `cap:assets` before building, so you don't need to commit the generated icons to git.

## See Also

- [client/resources/README.md](../client/resources/README.md) - Detailed documentation
- [Android CI Setup](./android-ci-setup.md) - Full CI/CD guide
