# Assets Directory

This directory contains application icons and resources for building distributable versions of AI Helper.

## Required Icons

To properly build the application for distribution, you'll need to add the following icon files:

### Windows
- **icon.ico** - Windows icon file (recommended: 256x256 or larger, .ico format)

### macOS  
- **icon.icns** - macOS icon file (recommended: 512x512 or larger, .icns format)

### Linux
- **icon.png** - Linux icon file (recommended: 512x512, .png format)

## Creating Icons

You can create these icons from a single high-resolution PNG image (1024x1024 recommended) using online converters or tools like:

- **For .ico**: Use online converters like convertio.co or favicon.io
- **For .icns**: Use online converters or macOS tools like `iconutil`
- **For .png**: Simply save your image as PNG

## Note

If you don't add these icons, electron-builder will use default Electron icons for your application. The build process will still work, but your app won't have custom branding.

The icons should represent a microphone or audio assistant to match the AI Helper theme.