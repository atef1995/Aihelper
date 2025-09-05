const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron/main');
const path = require('node:path');
const OpenAI = require('openai');
const fs = require('fs');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Grant access to the first screen found.
      callback({ video: sources[0], audio: 'loopback' })
    })
    // If true, use the system picker if available.
    // Note: this is currently experimental. If the system picker
    // is available, it will be used and the media request handler
    // will not be invoked.
  }, { useSystemPicker: true })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// OpenAI configuration - store API key securely
let openai = null;
let apiKey = process.env.OPENAI_API_KEY || null;

function initializeOpenAI() {
  if (apiKey) {
    openai = new OpenAI({ apiKey });
  }
}

ipcMain.on("start-recording", () => {
  console.log("recording triggered");
});

// Handle API key management
ipcMain.handle('set-api-key', async (event, newApiKey) => {
  apiKey = newApiKey;
  initializeOpenAI();
  return { success: true, message: 'API key set successfully' };
});

ipcMain.handle('get-api-key-status', async () => {
  return { hasApiKey: !!apiKey };
});

// Handle real-time audio transcription
ipcMain.handle('transcribe-audio', async (event, audioBlob) => {
  if (!openai) {
    return { success: false, error: 'OpenAI API key not set. Please configure your API key first.' };
  }
  
  let tempPath = null;
  try {
    // Create unique temp file name to avoid conflicts
    const timestamp = Date.now();
    tempPath = path.join(__dirname, `temp-audio-${timestamp}.webm`);
    
    // Write audio blob to temp file
    fs.writeFileSync(tempPath, Buffer.from(audioBlob));
    
    // Verify file was created and has content
    const stats = fs.statSync(tempPath);
    console.log(`Temp file created: ${tempPath}, size: ${stats.size} bytes`);
    
    if (stats.size === 0) {
      throw new Error('Generated audio file is empty');
    }
    
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      language: 'en'
    });

    return { success: true, text: transcription.text };
  } catch (error) {
    console.error('Transcription error:', error);
    
    let errorMessage = error.message;
    if (error.status === 400) {
      errorMessage = 'Audio format not supported or corrupted. Trying next audio chunk...';
    }
    
    return { success: false, error: errorMessage };
  } finally {
    // Always clean up temp file, even if there was an error
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
        console.log(`Temp file cleaned up: ${tempPath}`);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    }
  }
});

// Handle chat completion with transcribed text
ipcMain.handle('chat-completion', async (event, text) => {
  if (!openai) {
    return { success: false, error: 'OpenAI API key not set. Please configure your API key first.' };
  }
  
  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: text }],
      model: 'gpt-3.5-turbo',
    });

    return { success: true, response: completion.choices[0].message.content };
  } catch (error) {
    console.error('Chat completion error:', error);
    return { success: false, error: error.message };
  }
});

// Initialize OpenAI on app start
initializeOpenAI();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})