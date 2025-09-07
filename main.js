const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron/main');
const path = require('node:path');
const os = require('node:os');
const OpenAI = require('openai');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

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
  // Initialize temp directories on app start
  try {
    ensureTempDirectories();
  } catch (error) {
    console.error('Failed to initialize temp directories:', error);
  }
  
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

// Context management
let userContext = '';
let uploadedFilesContent = new Map(); // Store file content by filename

// Helper function to get proper temp directories using Electron best practices
function getTempDirectories() {
  const userDataPath = app.getPath('userData');
  const tempPath = app.getPath('temp');
  
  return {
    // Use app's userData directory for file uploads (persistent across sessions)
    uploadsDir: path.join(userDataPath, 'temp-uploads'),
    // Use system temp directory for audio files (cleaned up automatically)
    audioDir: path.join(tempPath, 'aihelper-audio')
  };
}

// Ensure temp directories exist
function ensureTempDirectories() {
  const { uploadsDir, audioDir } = getTempDirectories();
  
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log(`Created uploads directory: ${uploadsDir}`);
    }
    
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
      console.log(`Created audio directory: ${audioDir}`);
    }
  } catch (error) {
    console.error('Error creating temp directories:', error);
    throw error;
  }
}

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
ipcMain.handle('transcribe-audio', async (event, audioBlob, mimeType) => {
  if (!openai) {
    return { success: false, error: 'OpenAI API key not set. Please configure your API key first.' };
  }

  let tempPath = null;
  try {
    // Create unique temp file name to avoid conflicts
    const timestamp = Date.now();
    // Determine file extension based on MIME type
    let extension = '.webm';
    if (mimeType) {
      if (mimeType.includes('wav')) extension = '.wav';
      else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) extension = '.mp3';
      else if (mimeType.includes('mp4')) extension = '.mp4';
      else if (mimeType.includes('ogg')) extension = '.ogg';
      else if (mimeType.includes('webm')) extension = '.webm';
    }
    const { audioDir } = getTempDirectories();
    ensureTempDirectories();
    tempPath = path.join(audioDir, `temp-audio-${timestamp}${extension}`);

    // Write audio blob to temp file
    fs.writeFileSync(tempPath, Buffer.from(audioBlob));

    // Verify file was created and has content
    const stats = fs.statSync(tempPath);
    console.log(`Temp file created: ${tempPath}, size: ${stats.size} bytes`);

    if (stats.size === 0) {
      throw new Error('Generated audio file is empty');
    }

    // Basic WebM validation
    if (extension === '.webm') {
      const buffer = Buffer.from(audioBlob);
      const hasWebMHeader = buffer.slice(0, 4).toString('hex') === '1a45dfa3';
      console.log(`WebM header check: ${hasWebMHeader ? 'VALID' : 'INVALID'}`);

      if (!hasWebMHeader) {
        throw new Error('Invalid WebM file - missing EBML header');
      }

      // Check file size - WebM files under 1KB or over 10MB are likely corrupted
      if (stats.size < 1000) {
        throw new Error('WebM file too small - likely corrupted');
      }
      if (stats.size > 10 * 1024 * 1024) {
        throw new Error('WebM file too large - likely corrupted');
      }
    }

    // Add more logging
    console.log(`Processing audio file: ${tempPath}`);
    console.log(`File size: ${stats.size} bytes`);
    console.log(`MIME type: ${mimeType || 'unknown'}`);

    // Save a copy for debugging (keep last 3 files)
    const debugPath = path.join(audioDir, `debug-audio-${timestamp}${extension}`);
    try {
      fs.copyFileSync(tempPath, debugPath);
      console.log(`Debug copy saved: ${debugPath}`);

      // Clean up old debug files (keep only last 3)
      const debugFiles = fs.readdirSync(audioDir)
        .filter(file => file.startsWith('debug-audio-'))
        .sort()
        .reverse();
      if (debugFiles.length > 3) {
        debugFiles.slice(3).forEach(file => {
          try {
            fs.unlinkSync(path.join(audioDir, file));
            console.log(`Cleaned up old debug file: ${file}`);
          } catch (e) { /* ignore */ }
        });
      }
    } catch (debugError) {
      console.log('Debug copy failed:', debugError.message);
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      language: 'en'
    });

    console.log(`Transcription successful: ${transcription.text}`);

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
        // Try to clean up old temp files
        try {
          const { audioDir } = getTempDirectories();
          if (fs.existsSync(audioDir)) {
            const tempFiles = fs.readdirSync(audioDir).filter(file =>
              file.startsWith('temp-audio-') && (
                file.endsWith('.webm') ||
                file.endsWith('.wav') ||
                file.endsWith('.mp3') ||
                file.endsWith('.mp4') ||
                file.endsWith('.ogg')
              )
            );
            tempFiles.forEach(file => {
              const filePath = path.join(audioDir, file);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Cleaned up old temp file: ${file}`);
              }
            });
          }
        } catch (cleanupAllError) {
          console.error('Error cleaning up old temp files:', cleanupAllError);
        }
      }
    }
  }
});

// File parsing functions
async function parseTextFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function parsePdfFile(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return { success: true, content: data.text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function parseDocxFile(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return { success: true, content: result.value };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Handle file upload and parsing
ipcMain.handle('upload-file', async (event, fileName, fileBuffer) => {
  let tempPath = null; // Declare tempPath outside try block so it's available in catch
  
  try {
    console.log(`Processing file upload: ${fileName}`);

    const { uploadsDir } = getTempDirectories();
    ensureTempDirectories();
    console.log(`Upload directory: ${uploadsDir}`);

    // Verify temp directory is accessible
    const tempDirStats = fs.statSync(uploadsDir);
    if (!tempDirStats.isDirectory()) {
      throw new Error(`Upload path exists but is not a directory: ${uploadsDir}`);
    }

    // Sanitize filename to avoid path issues with spaces and special characters
    const timestamp = Date.now();
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    // More aggressive sanitization for Windows compatibility
    const sanitizedName = `${baseName.replace(/[^a-zA-Z0-9.-]/g, '_')}_${timestamp}${extension}`;
    tempPath = path.resolve(uploadsDir, sanitizedName);

    console.log(`Original filename: ${fileName}`);
    console.log(`Sanitized filename: ${sanitizedName}`);
    console.log(`Full temp path: ${tempPath}`);

    // Verify the path looks correct
    if (!tempPath.startsWith(uploadsDir)) {
      throw new Error(`Security error: temp path outside upload directory`);
    }

    // Write file to temp directory
    console.log('Writing file to temp path...');
    fs.writeFileSync(tempPath, fileBuffer);
    console.log('File written successfully');

    // Verify the file was written correctly
    const fileStats = fs.statSync(tempPath);
    console.log(`File size: ${fileStats.size} bytes`);

    let parseResult;

    console.log(`Parsing file with extension: ${extension}`);

    switch (extension) {
      case '.pdf':
        parseResult = await parsePdfFile(tempPath);
        break;
      case '.txt':
        parseResult = await parseTextFile(tempPath);
        break;
      case '.docx':
        parseResult = await parseDocxFile(tempPath);
        break;
      default:
        parseResult = { success: false, error: 'Unsupported file type' };
    }

    console.log(`Parse result: ${parseResult.success ? 'Success' : 'Failed'}`);
    if (!parseResult.success) {
      console.log(`Parse error: ${parseResult.error}`);
    }

    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
      console.log('Temp file cleaned up');
    }

    if (parseResult.success) {
      // Store file content
      uploadedFilesContent.set(fileName, parseResult.content);
      console.log(`File content stored for: ${fileName}`);
      return { success: true, fileName, contentLength: parseResult.content.length };
    } else {
      return { success: false, error: parseResult.error };
    }

  } catch (error) {
    console.error('File upload error:', error);

    // Clean up temp file if it exists
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
        console.log('Temp file cleaned up after error');
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    }
    return { success: false, error: error.message };
  }
});

// Handle context management
ipcMain.handle('save-context', async (event, context) => {
  userContext = context;
  return { success: true, message: 'Context saved successfully' };
});

ipcMain.handle('get-context', async () => {
  return { success: true, context: userContext };
});

ipcMain.handle('clear-context', async () => {
  userContext = '';
  uploadedFilesContent.clear();
  return { success: true, message: 'Context and files cleared successfully' };
});

ipcMain.handle('remove-file', async (event, fileName) => {
  uploadedFilesContent.delete(fileName);
  return { success: true, message: 'File removed from context' };
});

ipcMain.handle('get-uploaded-files', async () => {
  const files = Array.from(uploadedFilesContent.keys()).map(fileName => ({
    name: fileName,
    contentLength: uploadedFilesContent.get(fileName).length
  }));
  return { success: true, files };
});

// Enhanced chat completion with context
ipcMain.handle('chat-completion', async (event, text) => {
  if (!openai) {
    return { success: false, error: 'OpenAI API key not set. Please configure your API key first.' };
  }

  try {
    // Build context message
    let contextMessage = '';

    if (userContext.trim()) {
      contextMessage += `User Context: ${userContext}\n\n`;
    }

    // Add file contents to context
    if (uploadedFilesContent.size > 0) {
      contextMessage += `Uploaded Files Content:\n`;
      for (const [fileName, content] of uploadedFilesContent) {
        contextMessage += `--- ${fileName} ---\n${content}\n\n`;
      }
    }

    // Combine context with user query
    const fullMessage = contextMessage + `User Query: ${text}`;

    const completion = await openai.chat.completions.create({
      messages: [{
        role: 'user',
        content: fullMessage
      }],
      model: 'gpt-3.5-turbo',
      max_tokens: 2000, // Allow longer responses due to context
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