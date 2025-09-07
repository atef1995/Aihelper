# 🎤 Job Interview AI Helper

Real-time Audio Assistant powered by OpenAI - Transcribe system audio and get intelligent AI responses with context management and file upload support.

## Features

- **Real-time Audio Transcription**: Capture system audio and transcribe it using OpenAI Whisper
- **AI Chat Integration**: Get intelligent responses from OpenAI GPT models
- **Context Management**: Add custom context to improve AI responses
- **File Upload Support**: Upload PDF, TXT, and DOCX files for enhanced context
- **Push-to-Record Interface**: Simple spacebar recording controls
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Prerequisites

- Node.js 18 or higher
- OpenAI API key

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/atefcodes/aihelper.git
   cd aihelper
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

## Configuration

1. Launch the application
2. Enter your OpenAI API key in the configuration section
3. Optionally add context or upload files to enhance AI responses
4. Click "Start AI Stream" to enable audio capture
5. Hold SPACEBAR to record audio, release to transcribe and get AI response

## Building for Distribution

### Local Build

Build for your current platform:

```bash
npm run build
```

Build for specific platforms:

```bash
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

### GitHub Releases (Automated)

This project is configured for automated builds and releases using GitHub Actions.

## File Structure

```
aihelper/
├── main.js          # Electron main process
├── preload.js       # Preload script for security
├── renderer.js      # Frontend JavaScript
├── index.html       # Main UI
├── package.json     # Project configuration
├── assets/          # App icons and resources
│   ├── icon.ico     # Windows icon
│   ├── icon.icns    # macOS icon
│   └── icon.png     # Linux icon
└── .github/
    └── workflows/
        └── build-release.yml  # GitHub Actions configuration
```

## Development

### Adding New Features

1. Frontend changes: Edit `renderer.js` and `index.html`
2. Backend logic: Edit `main.js`
3. Security: Update `preload.js` for new IPC methods

### Testing Local Builds

```bash
# Build and test locally
npm run build

# Test the built application
# Windows: ./dist/AI Helper Setup.exe
# macOS: ./dist/AI Helper.dmg
# Linux: ./dist/AI Helper.AppImage
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and support, please use the GitHub Issues page.
