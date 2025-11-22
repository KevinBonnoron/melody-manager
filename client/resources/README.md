# App Resources

This directory contains the source assets for generating app icons and splash screens.

## Icon

The `icon.svg` file is the source icon for the application. It features:
- Purple gradient background (#7C3AED to #A855F7)
- White "M" letter design
- Musical note decoration

## Generating Assets

To generate all required icons and splash screens for iOS and Android:

```bash
# From the client directory
bun install
bun run cap:assets
```

This will automatically generate:
- **Android**: All icon sizes in `android/app/src/main/res/mipmap-*/`
- **iOS**: All icon sizes in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- **Splash screens**: For both platforms

## What Gets Generated

### Android Icons
- mipmap-ldpi (36x36)
- mipmap-mdpi (48x48)
- mipmap-hdpi (72x72)
- mipmap-xhdpi (96x96)
- mipmap-xxhdpi (144x144)
- mipmap-xxxhdpi (192x192)

### iOS Icons
- 20x20 @2x, @3x
- 29x29 @2x, @3x
- 40x40 @2x, @3x
- 60x60 @2x, @3x
- 76x76 @1x, @2x
- 83.5x83.5 @2x
- 1024x1024 @1x

### Adaptive Icons (Android)
The tool also generates adaptive icons with:
- Foreground layer (the icon itself)
- Background layer (solid purple color #7C3AED)

## Customization

To change the background color or splash screen color, edit the `cap:assets` script in `package.json`:

```json
"cap:assets": "bunx @capacitor/assets generate --iconBackgroundColor '#YOUR_COLOR' --splashBackgroundColor '#YOUR_COLOR'"
```

## Manual Icon Creation

If you want to create custom icons manually:

1. Create a 1024x1024px PNG or SVG in this directory
2. Name it `icon.png` or `icon.svg`
3. Run `bun run cap:assets`

For splash screens, create:
- `splash.png` or `splash.svg` (2732x2732px recommended)
- `splash-dark.png` or `splash-dark.svg` (for dark mode)

## After Generation

After generating assets, don't forget to:

```bash
# Sync the changes with the native projects
bun run cap:sync
```

## CI/CD Integration

The GitHub Actions workflows automatically run `cap:assets` before building, ensuring the latest icons are always used.
