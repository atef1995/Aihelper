// renderer.js - Clean version
const streamButton = document.getElementById('streamButton');
const stopStreamButton = document.getElementById('stopStreamButton');
const openaiResponse = document.getElementById('openaiResponse');
const streamingStatus = document.getElementById('streamingStatus');
const apiKeyInput = document.getElementById('apiKeyInput');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const apiKeyStatus = document.getElementById('apiKeyStatus');
// Remove logElement since there's no 'info' element in HTML

// Context management elements
const contextInput = document.getElementById('contextInput');
const saveContextButton = document.getElementById('saveContextButton');
const clearContextButton = document.getElementById('clearContextButton');
const fileInput = document.getElementById('fileInput');
const fileDropZone = document.getElementById('fileDropZone');
const uploadedFiles = document.getElementById('uploadedFiles');
const contextStatus = document.getElementById('contextStatus');

const helpBtn = document.getElementById('helpBtn');
const gotItBtn = document.getElementById('gotItBtn');
const closeGuideBtn = document.getElementById('closeGuideBtn');

let isStreaming = false;

// Event Listeners
streamButton.addEventListener('click', () => {
  startRealTimeStream();
});

stopStreamButton.addEventListener('click', () => {
  stopRealTimeStream();
});

// API Key management
setApiKeyButton.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    apiKeyStatus.textContent = '⚠️ Please enter an API key';
    apiKeyStatus.className = 'status warning';
    return;
  }

  try {
    const result = await window.electronAPI.setApiKey(apiKey);
    if (result.success) {
      apiKeyStatus.textContent = '✅ API key set successfully!';
      apiKeyStatus.className = 'status success';
      apiKeyInput.value = '';
      updateStreamButtonState();
    }
  } catch (error) {
    apiKeyStatus.textContent = '❌ Error setting API key: ' + error.message;
    apiKeyStatus.className = 'status error';
  }
});

// Check API key status on load
async function checkApiKeyStatus() {
  try {
    const status = await window.electronAPI.getApiKeyStatus();
    if (status.hasApiKey) {
      apiKeyStatus.textContent = '✅ API key is configured';
      apiKeyStatus.className = 'status success';
    } else {
      apiKeyStatus.textContent = '⚠️ No API key configured';
      apiKeyStatus.className = 'status warning';
    }
    updateStreamButtonState();
  } catch (error) {
    apiKeyStatus.textContent = '❌ Error checking API key status';
    apiKeyStatus.className = 'status error';
  }
}

function updateStreamButtonState() {
  window.electronAPI.getApiKeyStatus().then(status => {
    streamButton.disabled = !status.hasApiKey;
  });
}

// SIMPLE Push-to-Record streaming function
async function startRealTimeStream() {
  try {
    // Only use system audio (screen capture)
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 2
      },
      video: false
    });
    log('Using system audio only');

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error('No audio tracks available in stream');
    }

    const audioStream = new MediaStream(audioTracks);

    isStreaming = true;
    streamButton.disabled = true;
    stopStreamButton.disabled = false;

    streamingStatus.textContent = '🎤 READY - Press SPACEBAR to record and transcribe!';
    streamingStatus.className = 'status success';

    // Simple approach: Record when spacebar is pressed
    let currentRecorder = null;
    let isRecording = false;

    const startRecording = () => {
      if (isRecording || !isStreaming) return;

      isRecording = true;
      log('Starting recording...');
      streamingStatus.textContent = '🔴 RECORDING - Release SPACEBAR to transcribe...';
      streamingStatus.className = 'status error';

      // Use simple WAV format - most reliable
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/wav')) {
        options.mimeType = 'audio/wav';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      }

      currentRecorder = new MediaRecorder(audioStream, options);
      let recordedChunks = [];

      currentRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      currentRecorder.onstop = async () => {
        if (recordedChunks.length > 0) {
          streamingStatus.textContent = '🔄 Processing with OpenAI...';
          streamingStatus.className = 'status info';

          const audioBlob = new Blob(recordedChunks, { type: options.mimeType || 'audio/wav' });
          log(`Recorded ${audioBlob.size} bytes`);

          try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            const transcriptionResult = await window.electronAPI.transcribeAudio(uint8Array, options.mimeType);

            if (transcriptionResult.success && transcriptionResult.text.trim()) {
              log(`Transcribed: "${transcriptionResult.text}"`);

              const chatResult = await window.electronAPI.chatCompletion(transcriptionResult.text);

              if (chatResult.success) {
                if (openaiResponse.innerHTML.includes('Start streaming to begin')) {
                  openaiResponse.innerHTML = '';
                }

                openaiResponse.innerHTML += `
                  <div class="conversation-item user">
                    <div class="conversation-label">👤 System Audio</div>
                    ${transcriptionResult.text}
                  </div>
                  <div class="conversation-item ai">
                    <div class="conversation-label">🤖 AI Assistant</div>
                    ${chatResult.response}
                  </div>
                `;
                openaiResponse.scrollTop = openaiResponse.scrollHeight;

                streamingStatus.textContent = '🎤 READY - Press SPACEBAR to record again!';
                streamingStatus.className = 'status success';
              } else {
                log('Chat error: ' + chatResult.error);
                streamingStatus.textContent = '❌ Chat error - Press SPACEBAR to try again';
                streamingStatus.className = 'status warning';
              }
            } else {
              log('Transcription failed: ' + (transcriptionResult.error || 'No text'));
              streamingStatus.textContent = '❌ Transcription failed - Press SPACEBAR to try again';
              streamingStatus.className = 'status warning';
            }
          } catch (error) {
            log('Processing error: ' + error.message);
            streamingStatus.textContent = '❌ Error - Press SPACEBAR to try again';
            streamingStatus.className = 'status error';
          }
        }
        isRecording = false;
      };

      currentRecorder.start();
    };

    const stopRecording = () => {
      if (!isRecording || !currentRecorder) return;

      log('Stopping recording...');
      streamingStatus.textContent = '🔄 Stopping recording...';
      streamingStatus.className = 'status info';
      currentRecorder.stop();
    };

    // Keyboard event listeners
    const keydownHandler = (event) => {
      if (event.code === 'Space' && !event.repeat && isStreaming) {
        event.preventDefault();
        startRecording();
      }
    };

    const keyupHandler = (event) => {
      if (event.code === 'Space' && isStreaming) {
        event.preventDefault();
        stopRecording();
      }
    };

    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);

    // Store cleanup function
    window.cleanupKeyboardListeners = () => {
      document.removeEventListener('keydown', keydownHandler);
      document.removeEventListener('keyup', keyupHandler);
    };

    log('Simple push-to-record streaming ready!');

  } catch (error) {
    log('Error starting stream: ' + error.message);
    streamingStatus.textContent = '❌ Error: ' + error.message;
    streamingStatus.className = 'status error';
    resetStreamButtons();
  }
}

function stopRealTimeStream() {
  isStreaming = false;

  // Clean up keyboard listeners
  if (window.cleanupKeyboardListeners) {
    window.cleanupKeyboardListeners();
    window.cleanupKeyboardListeners = null;
  }

  resetStreamButtons();
  streamingStatus.textContent = '⏸️ Streaming stopped';
  streamingStatus.className = 'status';
  log('Push-to-record streaming stopped');
}

function resetStreamButtons() {
  streamButton.disabled = false;
  stopStreamButton.disabled = true;
  updateStreamButtonState();
}

function log(msg) {
  console.log(msg); // Use console.log instead since there's no log element in the UI
}

// Context Management Event Listeners

// Save context button
saveContextButton.addEventListener('click', async () => {
  const context = contextInput.value.trim();
  if (!context) {
    contextStatus.textContent = '⚠️ Please enter some context text';
    contextStatus.className = 'status warning';
    return;
  }

  try {
    const result = await window.electronAPI.saveContext(context);
    if (result.success) {
      contextStatus.textContent = '✅ Context saved successfully!';
      contextStatus.className = 'status success';
      log('Context saved: ' + context.substring(0, 50) + '...');
    }
  } catch (error) {
    contextStatus.textContent = '❌ Error saving context: ' + error.message;
    contextStatus.className = 'status error';
  }
});

// Clear context button
clearContextButton.addEventListener('click', async () => {
  try {
    const result = await window.electronAPI.clearContext();
    if (result.success) {
      contextInput.value = '';
      uploadedFiles.innerHTML = '';
      contextStatus.textContent = '✅ Context and files cleared!';
      contextStatus.className = 'status success';
      log('Context and files cleared');
    }
  } catch (error) {
    contextStatus.textContent = '❌ Error clearing context: ' + error.message;
    contextStatus.className = 'status error';
  }
});

// File input change event
fileInput.addEventListener('change', handleFileSelection);

// Drag and drop functionality
fileDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropZone.classList.add('drag-over');
});

fileDropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  fileDropZone.classList.remove('drag-over');
});

fileDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  handleFiles(files);
});

fileDropZone.addEventListener('click', (e) => {
  e.preventDefault();
  fileInput.click();
});

// File handling functions
async function handleFileSelection(event) {
  const files = Array.from(event.target.files);
  handleFiles(files);
}

async function handleFiles(files) {
  for (const file of files) {
    // Check file type
    const allowedTypes = ['.pdf', '.txt', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

    if (!allowedTypes.includes(fileExtension)) {
      showFileStatus(file.name, 'error', 'Unsupported file type');
      continue;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showFileStatus(file.name, 'error', 'File too large (max 10MB)');
      continue;
    }

    // Add file to UI with processing status
    addFileToUI(file.name, file.size, 'processing');

    try {
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Upload and parse file
      const result = await window.electronAPI.uploadFile(file.name, uint8Array);

      if (result.success) {
        updateFileStatus(file.name, 'completed', `Parsed (${result.contentLength} chars)`);
        log(`File uploaded: ${file.name} (${result.contentLength} characters extracted)`);

        contextStatus.textContent = '✅ File uploaded and parsed successfully!';
        contextStatus.className = 'status success';
      } else {
        updateFileStatus(file.name, 'error', result.error);
        log(`File upload failed: ${file.name} - ${result.error}`);
      }
    } catch (error) {
      updateFileStatus(file.name, 'error', error.message);
      log(`File processing error: ${file.name} - ${error.message}`);
    }
  }

  // Clear file input
  fileInput.value = '';
}

function addFileToUI(fileName, fileSize, status) {
  const fileItem = document.createElement('div');
  fileItem.className = 'file-item';
  fileItem.setAttribute('data-filename', fileName);

  const sizeInMB = (fileSize / (1024 * 1024)).toFixed(2);

  fileItem.innerHTML = `
    <div class="file-info">
      <div class="file-name">${fileName}</div>
      <div class="file-size">${sizeInMB} MB</div>
    </div>
    <div class="file-status ${status}">
      ${status === 'processing' ? 'Processing...' : status}
    </div>
    <button class="btn-remove">×</button>
  `;

  // Add event listener to the remove button
  const removeBtn = fileItem.querySelector('.btn-remove');
  removeBtn.addEventListener('click', () => removeFile(fileName));

  uploadedFiles.appendChild(fileItem);
}

function updateFileStatus(fileName, status, message) {
  const fileItem = document.querySelector(`[data-filename="${fileName}"]`);
  if (fileItem) {
    const statusElement = fileItem.querySelector('.file-status');
    statusElement.className = `file-status ${status}`;
    statusElement.textContent = message;
  }
}

function showFileStatus(fileName, status, message) {
  contextStatus.textContent = `${status === 'error' ? '❌' : '✅'} ${fileName}: ${message}`;
  contextStatus.className = `status ${status}`;
}

async function removeFile(fileName) {
  try {
    const result = await window.electronAPI.removeFile(fileName);
    if (result.success) {
      // Remove from UI
      const fileItem = document.querySelector(`[data-filename="${fileName}"]`);
      if (fileItem) {
        fileItem.remove();
      }

      contextStatus.textContent = '✅ File removed from context';
      contextStatus.className = 'status success';
      log(`File removed: ${fileName}`);
    }
  } catch (error) {
    contextStatus.textContent = '❌ Error removing file: ' + error.message;
    contextStatus.className = 'status error';
  }
}

// Load context and files on startup
async function loadExistingContext() {
  try {
    // Load saved context
    const contextResult = await window.electronAPI.getContext();
    if (contextResult.success && contextResult.context) {
      contextInput.value = contextResult.context;
    }

    // Load uploaded files
    const filesResult = await window.electronAPI.getUploadedFiles();
    if (filesResult.success && filesResult.files.length > 0) {
      for (const file of filesResult.files) {
        addFileToUI(file.name, file.contentLength * 2, 'completed'); // Rough size estimate
        updateFileStatus(file.name, 'completed', `${file.contentLength} chars`);
      }
    }
  } catch (error) {
    log('Error loading existing context: ' + error.message);
  }
}

function checkFirstTime() {
  const guideSeen = localStorage.getItem('aiHelper_guideSeen');
  if (!guideSeen) {
    // Show guide after a short delay for better UX
    setTimeout(() => {
      document.getElementById('guideOverlay').style.display = 'flex';
    }, 500);
  }
}

// Guide overlay functionality with proper event listeners
function showGuide() {
  console.log('showGuide called');
  const overlay = document.getElementById('guideOverlay');
  console.log('overlay element:', overlay);
  if (overlay) {
    overlay.style.display = 'flex';
    console.log('overlay shown');
  }
}

function closeGuide() {
  console.log('closeGuide called');
  const overlay = document.getElementById('guideOverlay');
  console.log('overlay element:', overlay);
  if (overlay) {
    overlay.style.display = 'none';
    localStorage.setItem('aiHelper_guideSeen', 'true');
    console.log('overlay closed');
  }
}



// Initialize the app

checkApiKeyStatus();
loadExistingContext();
checkFirstTime();

// Help button
if (helpBtn) {
  helpBtn.addEventListener('click', showGuide);

  // Add hover effects
  helpBtn.addEventListener('mouseover', function () {
    this.style.background = 'rgba(255,255,255,0.3)';
  });
  helpBtn.addEventListener('mouseout', function () {
    this.style.background = 'rgba(255,255,255,0.2)';
  });
}

// Close button (X)
if (closeGuideBtn) {
  closeGuideBtn.addEventListener('click', closeGuide);
}

// Got it button
if (gotItBtn) {
  gotItBtn.addEventListener('click', closeGuide);
}

