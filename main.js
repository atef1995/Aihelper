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

// Model configuration
const AVAILABLE_MODELS = {
  'gpt-4': {
    name: 'GPT-4 (Most Advanced)',
    description: 'Most capable model - best for complex tasks',
    cost: '~$0.03/1K tokens',
    category: 'Advanced'
  },
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo (Fast & Powerful)',
    description: 'Faster than GPT-4 with nearly same capability',
    cost: '~$0.01/1K tokens',
    category: 'Advanced'
  },
  'gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo (Fast & Budget-friendly)',
    description: 'Quick responses, great for most tasks',
    cost: '~$0.0005/1K tokens',
    category: 'Budget-friendly'
  }
};

let selectedModel = 'gpt-3.5-turbo'; // Default model

// Error categorization and user-friendly messages
function categorizeApiError(error) {
  const errorMessage = error.message || error.toString();
  const errorType = error.type || error.error?.type || '';
  const statusCode = error.status || 0;

  console.error('Raw API Error:', { errorMessage, errorType, statusCode, fullError: error });

  // Check for specific error codes and patterns
  if (errorType === 'insufficient_quota' || errorMessage.includes('insufficient_quota')) {
    return {
      errorType: 'insufficient_quota',
      friendlyMessage: '💳 Insufficient Credits: Your OpenAI account has run out of credits.',
      detailedMessage: 'Please add funds to your OpenAI account at https://platform.openai.com/account/billing/overview',
      userAction: 'Add funds and try again'
    };
  }

  if (errorType === 'rate_limit_exceeded' || statusCode === 429 || errorMessage.includes('rate_limit')) {
    return {
      errorType: 'rate_limit',
      friendlyMessage: '⏱️ Rate Limited: Too many requests sent in a short time.',
      detailedMessage: 'Please wait a moment before trying again. Consider spacing out your requests.',
      userAction: 'Wait 30 seconds and try again'
    };
  }

  if (errorType === 'invalid_request_error' || statusCode === 400) {
    if (errorMessage.includes('model') || errorMessage.includes('does not exist')) {
      return {
        errorType: 'model_not_found',
        friendlyMessage: `⚠️ Model Not Available: The selected model (${selectedModel}) is not available with your API key.`,
        detailedMessage: 'This model might require a different subscription plan or may not be available in your region.',
        userAction: 'Try a different model (e.g., gpt-3.5-turbo)'
      };
    }
    return {
      errorType: 'invalid_request',
      friendlyMessage: '❌ Invalid Request: The request was malformed.',
      detailedMessage: `Error: ${errorMessage}`,
      userAction: 'Check your input and try again'
    };
  }

  if (errorType === 'authentication_error' || statusCode === 401) {
    return {
      errorType: 'auth_error',
      friendlyMessage: '🔑 Authentication Failed: Your API key is invalid or expired.',
      detailedMessage: 'Please check your OpenAI API key and make sure it\'s correct.',
      userAction: 'Update your API key'
    };
  }

  if (statusCode === 503 || errorMessage.includes('service') || errorMessage.includes('overloaded')) {
    return {
      errorType: 'service_unavailable',
      friendlyMessage: '🔧 OpenAI Service Unavailable: The service is temporarily down.',
      detailedMessage: 'The OpenAI API is experiencing issues. Please try again in a few moments.',
      userAction: 'Try again later'
    };
  }

  // Check for invalid/incorrect API key messages
  if (errorMessage.includes('Incorrect API key') || errorMessage.includes('invalid_api_key') ||
    errorMessage.includes('api key') && errorMessage.includes('invalid')) {
    return {
      errorType: 'invalid_api_key',
      friendlyMessage: '🔑 Invalid API Key: The API key provided is incorrect.',
      detailedMessage: 'Your API key may have been revoked, expired, or is malformed.',
      userAction: 'Generate a new API key at https://platform.openai.com/api-keys'
    };
  }

  // Generic error
  return {
    errorType: 'unknown',
    friendlyMessage: '❌ Error: Something went wrong processing your request.',
    detailedMessage: `Error details: ${errorMessage}`,
    userAction: 'Try again or check your API key'
  };
}

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
  // Validate API key format
  if (!newApiKey || typeof newApiKey !== 'string') {
    return {
      success: false,
      error: '❌ Invalid Input: API key cannot be empty.',
      errorType: 'invalid_input',
      userAction: 'Please enter a valid API key'
    };
  }

  const trimmedKey = newApiKey.trim();

  // Check basic format (OpenAI keys start with 'sk-' and are typically 48+ characters)
  if (!trimmedKey.startsWith('sk-')) {
    return {
      success: false,
      error: '⚠️ Invalid API Key Format: OpenAI API keys start with "sk-".',
      errorType: 'invalid_format',
      userAction: 'Check your API key from https://platform.openai.com/api-keys'
    };
  }

  if (trimmedKey.length < 20) {
    return {
      success: false,
      error: '⚠️ Invalid API Key Length: The key appears to be too short.',
      errorType: 'invalid_format',
      userAction: 'Verify your complete API key is copied correctly'
    };
  }

  // Set the API key and initialize OpenAI
  apiKey = trimmedKey;
  initializeOpenAI();

  // Verify the API key works by making a test request
  try {
    console.log('Testing API key validity...');
    if (openai) {
      // Make a minimal test call to verify the key works
      await openai.models.list();
      console.log('API key validation successful');
      return {
        success: true,
        message: 'API key set and validated successfully!',
        validated: true
      };
    }
  } catch (error) {
    console.error('API key validation error:', error);

    const errorInfo = categorizeApiError(error);

    // Check specifically for auth errors
    if (error.status === 401 || errorInfo.errorType === 'auth_error') {
      apiKey = null; // Clear the invalid key
      initializeOpenAI();
      return {
        success: false,
        error: '🔑 Invalid API Key: The key is rejected by OpenAI.',
        errorType: 'invalid_api_key',
        userAction: 'Double-check your API key or generate a new one at https://platform.openai.com/api-keys',
        details: 'The key format looks correct, but OpenAI rejected it as invalid or expired.'
      };
    }

    if (error.status === 429) {
      return {
        success: false,
        error: '⏱️ Rate Limited: Too many verification attempts.',
        errorType: 'rate_limit',
        userAction: 'Wait a moment and try again',
        validated: false
      };
    }

    // Generic error
    return {
      success: false,
      error: `❌ Validation Error: ${errorInfo.friendlyMessage}`,
      errorType: 'validation_error',
      userAction: 'Try again or verify your API key',
      validated: false
    };
  }
});

ipcMain.handle('get-api-key-status', async () => {
  return { hasApiKey: !!apiKey };
});

// Model management handlers
ipcMain.handle('get-available-models', async () => {
  return { success: true, models: AVAILABLE_MODELS };
});

ipcMain.handle('set-selected-model', async (event, model) => {
  if (AVAILABLE_MODELS[model]) {
    selectedModel = model;
    return { success: true, message: `Model set to ${AVAILABLE_MODELS[model].name}` };
  }
  return { success: false, error: 'Invalid model selected' };
});

ipcMain.handle('get-selected-model', async () => {
  return { success: true, model: selectedModel, info: AVAILABLE_MODELS[selectedModel] };
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
    let errorType = 'transcription_failed';

    // Categorize transcription-specific errors
    if (error.status === 400) {
      errorType = 'invalid_audio_format';
      errorMessage = '🎙️ Audio Format Issue: The audio format is not supported or the file is corrupted. Try speaking more clearly or check your audio settings.';
    } else if (error.status === 413) {
      errorType = 'audio_too_large';
      errorMessage = '📁 Audio Too Large: The recording is too large. Please keep recordings under 25MB.';
    } else if (error.status === 429) {
      errorType = 'rate_limit';
      errorMessage = '⏱️ Too Many Requests: The transcription service is temporarily rate limited. Wait a moment and try again.';
    } else if (error.status === 401 || error.status === 403) {
      errorType = 'auth_error';
      errorMessage = '🔑 Authentication Failed: Your API key is invalid or has expired. Please check your OpenAI API key settings.';
    } else if (error.message.includes('Incorrect API key') || error.message.includes('invalid api key')) {
      errorType = 'invalid_api_key';
      errorMessage = '🔑 Invalid API Key: The API key provided is incorrect or has been revoked. Please verify your key at https://platform.openai.com/api-keys';
    } else if (error.message.includes('empty') || error.message.includes('no audio')) {
      errorType = 'no_audio_detected';
      errorMessage = '🔇 No Audio Detected: The recording appears to be silent. Please try speaking more clearly.';
    } else if (error.message.includes('corrupted')) {
      errorType = 'corrupted_audio';
      errorMessage = '⚠️ Corrupted Audio: The audio file appears to be corrupted. Try recording again.';
    } else if (error.message.includes('quota') || error.message.includes('insufficient_quota')) {
      errorType = 'insufficient_quota';
      errorMessage = '💳 Insufficient Credits: Your OpenAI account has run out of credits. Please add funds at https://platform.openai.com/account/billing/overview';
    }

    return { success: false, error: errorMessage, errorType };
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
// Regular chat completion (non-streaming)
ipcMain.handle('chat-completion', async (event, text, model, systemPrompt) => {
  if (!openai) {
    return {
      success: false,
      error: 'OpenAI API key not set. Please configure your API key first.',
      errorType: 'no_api_key'
    };
  }

  // Use provided model or fall back to selected model
  const modelToUse = model || selectedModel;

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

    console.log(`Using model: ${modelToUse}`);

    // Use system prompt if provided, otherwise use default helpful assistant prompt
    const systemMessage = systemPrompt || 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.';

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user',
          content: fullMessage
        }
      ],
      model: modelToUse,
      max_tokens: 2000, // Allow longer responses due to context
    });

    return { success: true, response: completion.choices[0].message.content };
  } catch (error) {
    console.error('Chat completion error:', error);

    const errorInfo = categorizeApiError(error);

    return {
      success: false,
      error: errorInfo.friendlyMessage,
      errorType: errorInfo.errorType,
      errorDetails: errorInfo.detailedMessage,
      userAction: errorInfo.userAction
    };
  }
});

// Streaming chat completion
ipcMain.handle('chat-completion-stream', async (event, text, model, systemPrompt) => {
  if (!openai) {
    return {
      success: false,
      error: 'OpenAI API key not set. Please configure your API key first.',
      errorType: 'no_api_key'
    };
  }

  // Use provided model or fall back to selected model
  const modelToUse = model || selectedModel;

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

    console.log(`Using model for streaming: ${modelToUse}`);

    // Use system prompt if provided, otherwise use default helpful assistant prompt
    const systemMessage = systemPrompt || 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.';

    const stream = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user',
          content: fullMessage
        }
      ],
      model: modelToUse,
      max_tokens: 2000,
      stream: true // Enable streaming
    });

    let fullResponse = '';

    // Process stream chunks
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullResponse += delta;
        // Send chunk to renderer
        event.sender.send('chat-stream-chunk', {
          chunk: delta,
          isError: false
        });
      }
    }

    // Send completion signal
    event.sender.send('chat-stream-complete', {
      success: true,
      fullResponse: fullResponse
    });

    return { success: true, response: fullResponse };
  } catch (error) {
    console.error('Chat completion stream error:', error);

    const errorInfo = categorizeApiError(error);

    // Send error through stream
    event.sender.send('chat-stream-error', {
      error: errorInfo.friendlyMessage,
      errorType: errorInfo.errorType,
      errorDetails: errorInfo.detailedMessage,
      userAction: errorInfo.userAction
    });

    return {
      success: false,
      error: errorInfo.friendlyMessage,
      errorType: errorInfo.errorType,
      errorDetails: errorInfo.detailedMessage,
      userAction: errorInfo.userAction
    };
  }
});

// Initialize OpenAI on app start
initializeOpenAI();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})