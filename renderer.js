// renderer.js - Clean version
const streamButton = document.getElementById('streamButton');
const stopStreamButton = document.getElementById('stopStreamButton');
const recordButton = document.getElementById('recordButton');
const stopRecordButton = document.getElementById('stopRecordButton');
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

// Model selection elements
const modelSelect = document.getElementById('modelSelect');
const modelInfo = document.getElementById('modelInfo');
const readyStatus = document.getElementById('readyStatus');

// System prompt elements
const systemPromptSelect = document.getElementById('systemPromptSelect');
const systemPromptInput = document.getElementById('systemPromptInput');
const systemPromptInfo = document.getElementById('systemPromptInfo');
const saveSystemPromptButton = document.getElementById('saveSystemPromptButton');
const clearSystemPromptButton = document.getElementById('clearSystemPromptButton');

// Support buttons
const updateBtn = document.getElementById('updateBtn');
const coffeeBtn = document.getElementById('coffeeBtn');
let apiKeyConfigured = false;
let modelSelected = 'gpt-3.5-turbo';
let currentRecorder = null;
let isRecording = false;
let isResponseStreaming = false;
let currentStreamElement = null;
let systemPrompt = 'You are a helpful AI assistant. Provide clear, concise, and accurate responses. Help the user with their questions and tasks.';

// Model information mapping
const modelDescriptions = {
  'gpt-4': {
    description: 'Most capable model - best for complex tasks',
    category: 'Advanced',
    cost: '~$0.03/1K tokens'
  },
  'gpt-4-turbo': {
    description: 'Faster than GPT-4 with nearly same capability',
    category: 'Advanced',
    cost: '~$0.01/1K tokens'
  },
  'gpt-3.5-turbo': {
    description: 'Quick responses, great for most tasks',
    category: 'Budget-friendly',
    cost: '~$0.0005/1K tokens'
  }
};

// System Prompt Examples
const systemPrompts = [
  {
    id: 'helper',
    title: 'Helpful Assistant',
    description: 'A general-purpose helpful assistant that provides clear and concise answers',
    content: 'You are a helpful AI assistant. Provide clear, concise, and accurate responses. Help the user with their questions and tasks.'
  },
  {
    id: 'coder',
    title: 'Code Reviewer & Developer',
    description: 'Specializes in code review, debugging, and software development advice',
    content: 'You are an expert software developer and code reviewer. Provide detailed code analysis, identify bugs, suggest improvements, and follow best practices. Include code examples when helpful. Focus on clarity, performance, and maintainability.'
  },
  {
    id: 'writer',
    title: 'Content Writer & Editor',
    description: 'Helps with writing, editing, and content creation tasks',
    content: 'You are a professional content writer and editor. Help with writing, editing, proofreading, and improving content quality. Maintain a clear, engaging tone. Consider grammar, style, clarity, and audience. Provide constructive feedback.'
  },
  {
    id: 'educator',
    title: 'Educator & Tutor',
    description: 'Teaches concepts clearly and helps with learning and understanding',
    content: 'You are a patient and knowledgeable educator. Explain concepts clearly and in simple terms. Provide examples, break down complex ideas, ask clarifying questions, and adapt your teaching style. Encourage learning and curiosity.'
  },
  {
    id: 'analyst',
    title: 'Data Analyst & Researcher',
    description: 'Analyzes data and provides research insights',
    content: 'You are a skilled data analyst and researcher. Analyze information thoroughly, identify patterns, draw evidence-based conclusions, and explain findings clearly. Ask clarifying questions about data sources and context. Be objective and highlight limitations.'
  },
  {
    id: 'creative',
    title: 'Creative Brainstormer',
    description: 'Generates creative ideas and helps with brainstorming',
    content: 'You are a creative and imaginative assistant. Help generate ideas, brainstorm solutions, think outside the box, and explore possibilities. Encourage creativity while remaining practical. Build on ideas and suggest variations.'
  },
  {
    id: 'professional',
    title: 'Professional Business Advisor',
    description: 'Provides business, career, and professional guidance',
    content: 'You are a professional business advisor with expertise in strategy, management, and career development. Provide practical advice grounded in business best practices. Consider industry standards and professional norms. Be concise and action-oriented.'
  },
  {
    id: 'interview',
    title: 'Job Interview Candidate',
    description: 'Acts as the interviewee and answers questions based on your CV',
    content: 'You are a job interview candidate being interviewed. Based on the CV or resume provided in the context, answer interview questions authentically and professionally as if you are the person described in the document. Draw from the information in your CV (education, experience, skills, projects) to provide specific, detailed answers. Be honest, confident, and personable. If asked about something not in your CV, acknowledge the gap professionally. Maintain a conversational tone appropriate for an interview setting.'
  }
];

// Setup streaming event listeners
window.electronAPI.onChatStreamChunk(({ chunk, isError }) => {
  if (isError) {
    console.error('Stream chunk error:', chunk);
    return;
  }

  if (!currentStreamElement) {
    // Create new response element on first chunk
    if (openaiResponse.innerHTML.includes('Start streaming to begin')) {
      openaiResponse.innerHTML = '';
    }

    const responseDiv = document.createElement('div');
    responseDiv.className = 'conversation-item ai';
    responseDiv.innerHTML = '<div class="conversation-label"></div>';
    openaiResponse.appendChild(responseDiv);
    currentStreamElement = responseDiv;
  }

  // Append chunk to current response
  currentStreamElement.textContent += chunk;
  openaiResponse.scrollTop = openaiResponse.scrollHeight;
});

window.electronAPI.onChatStreamComplete(({ success, fullResponse }) => {
  if (success) {
    isResponseStreaming = false;
    streamingStatus.textContent = '🎤 READY - Press SPACEBAR or click Record to continue!';
    streamingStatus.className = 'status success';
    currentStreamElement = null;
  }
});

window.electronAPI.onChatStreamError(({ error, category }) => {
  isResponseStreaming = false;
  const errorMsg = error || 'Chat error';
  log('Stream error: ' + errorMsg);

  streamingStatus.textContent = `❌ ${errorMsg}`;
  streamingStatus.className = 'status error';

  // Add error message to chat history
  if (!currentStreamElement) {
    if (openaiResponse.innerHTML.includes('Start streaming to begin')) {
      openaiResponse.innerHTML = '';
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'conversation-item error';
    errorDiv.innerHTML = `
      <div class="conversation-label">⚠️ Error</div>
      <strong>${category || 'API Error'}</strong><br>${errorMsg}
      <br><small>💡 ${getCategoryHint(category)}</small>
    `;
    openaiResponse.appendChild(errorDiv);
    openaiResponse.scrollTop = openaiResponse.scrollHeight;
  }

  currentStreamElement = null;
});

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

  // Show processing status
  apiKeyStatus.textContent = '🔄 Validating API key...';
  apiKeyStatus.className = 'status info';
  setApiKeyButton.disabled = true;

  try {
    const result = await window.electronAPI.setApiKey(apiKey);
    if (result.success) {
      apiKeyStatus.textContent = result.validated ? '✅ API key validated and set successfully!' : '✅ API key set successfully!';
      apiKeyStatus.className = 'status success';
      apiKeyInput.value = '';
      updateStreamButtonState();
      checkReadyStatus();
      log('API key configured successfully');
    } else {
      // Display detailed error message
      const errorMsg = result.error || 'Failed to set API key';
      const userAction = result.userAction ? `\n${result.userAction}` : '';
      const details = result.details ? `\n\nDetails: ${result.details}` : '';

      apiKeyStatus.innerHTML = `${errorMsg}${userAction}${details}`;
      apiKeyStatus.className = 'status error';

      // Keep the input filled so user can edit it
      log(`API key validation failed: ${result.errorType || 'unknown error'}`);
    }
  } catch (error) {
    apiKeyStatus.textContent = '❌ Error setting API key: ' + error.message;
    apiKeyStatus.className = 'status error';
    log('API key error: ' + error.message);
  } finally {
    setApiKeyButton.disabled = false;
  }
});

// Check API key status on load
async function checkApiKeyStatus() {
  try {
    const status = await window.electronAPI.getApiKeyStatus();
    if (status.hasApiKey) {
      apiKeyStatus.textContent = '✅ API key is configured';
      apiKeyStatus.className = 'status success';
      apiKeyConfigured = true;
    } else {
      apiKeyStatus.textContent = '⚠️ No API key configured';
      apiKeyStatus.className = 'status warning';
      apiKeyConfigured = false;
    }
    updateStreamButtonState();
    checkReadyStatus();
  } catch (error) {
    apiKeyStatus.textContent = '❌ Error checking API key status';
    apiKeyStatus.className = 'status error';
  }
}

function updateStreamButtonState() {
  window.electronAPI.getApiKeyStatus().then(status => {
    streamButton.disabled = !status.hasApiKey;
    apiKeyConfigured = status.hasApiKey;
    checkReadyStatus();
  });
}

// Model Selection Management
async function loadModelPreferences() {
  try {
    const result = await window.electronAPI.getSelectedModel();
    if (result.success) {
      modelSelected = result.model;
      modelSelect.value = modelSelected;
      updateModelInfo(modelSelected);
    }
  } catch (error) {
    log('Error loading model preference: ' + error.message);
  }
}

function updateModelInfo(model) {
  const info = modelDescriptions[model];
  if (info && modelInfo) {
    modelInfo.innerHTML = `
      <div class="model-description">${info.description}</div>
      <div class="model-cost">${info.category} - ${info.cost}</div>
    `;
  }
}

async function handleModelChange(event) {
  const newModel = event.target.value;
  try {
    const result = await window.electronAPI.setSelectedModel(newModel);
    if (result.success) {
      modelSelected = newModel;
      updateModelInfo(newModel);
      log(`Model changed to: ${newModel}`);
      checkReadyStatus();
    }
  } catch (error) {
    log('Error setting model: ' + error.message);
    modelSelect.value = modelSelected; // Revert selection
  }
}

function checkReadyStatus() {
  if (apiKeyConfigured && modelSelected) {
    if (readyStatus) {
      readyStatus.innerHTML = '✅ Everything is ready! Press "Start AI Stream" to begin.';
      readyStatus.className = 'status success';
      readyStatus.style.display = 'block';
    }
  } else {
    if (readyStatus) {
      readyStatus.style.display = 'none';
    }
  }
}

// Add model selection event listener
if (modelSelect) {
  modelSelect.addEventListener('change', handleModelChange);
}

// System Prompt Management
function initializeSystemPrompts() {
  // Populate dropdown with system prompt options
  if (systemPromptSelect) {
    systemPrompts.forEach(prompt => {
      const option = document.createElement('option');
      option.value = prompt.id;
      option.textContent = prompt.title;
      systemPromptSelect.appendChild(option);
    });
  }
}

function handleSystemPromptSelect(event) {
  const promptId = event.target.value;
  const selectedPrompt = systemPrompts.find(p => p.id === promptId);

  if (selectedPrompt) {
    systemPrompt = selectedPrompt.content;
    systemPromptInput.value = selectedPrompt.content;
    systemPromptInfo.innerHTML = `📋 ${selectedPrompt.description}`;
    contextStatus.textContent = `✅ System prompt applied: ${selectedPrompt.title}`;
    contextStatus.className = 'status success';
    log(`Applied system prompt: ${selectedPrompt.title}`);
  }
}

function applyCustomSystemPrompt() {
  const customPrompt = systemPromptInput.value.trim();

  if (!customPrompt) {
    contextStatus.textContent = '⚠️ Please enter a system prompt';
    contextStatus.className = 'status warning';
    return;
  }

  systemPrompt = customPrompt;
  systemPromptSelect.value = ''; // Clear dropdown since using custom
  systemPromptInfo.innerHTML = '📋 Custom system prompt';
  contextStatus.textContent = '✅ Custom system prompt applied!';
  contextStatus.className = 'status success';
  log('Applied custom system prompt: ' + customPrompt.substring(0, 50) + '...');
}

function resetSystemPrompt() {
  const defaultPrompt = systemPrompts[0]; // Helpful Assistant is default
  systemPrompt = defaultPrompt.content;
  systemPromptInput.value = defaultPrompt.content;
  systemPromptSelect.value = '';
  systemPromptInfo.innerHTML = `📋 ${defaultPrompt.description}`;
  contextStatus.textContent = '✅ System prompt reset to default!';
  contextStatus.className = 'status success';
  log('System prompt reset to default');
}

// Add system prompt event listeners
if (systemPromptSelect) {
  systemPromptSelect.addEventListener('change', handleSystemPromptSelect);
}

if (systemPromptInput) {
  systemPromptInput.addEventListener('change', applyCustomSystemPrompt);
  systemPromptInput.addEventListener('blur', applyCustomSystemPrompt);
}

if (saveSystemPromptButton) {
  saveSystemPromptButton.addEventListener('click', applyCustomSystemPrompt);
}

if (clearSystemPromptButton) {
  clearSystemPromptButton.addEventListener('click', resetSystemPrompt);
}

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

    // Show record buttons
    recordButton.disabled = false;
    recordButton.style.display = 'inline-flex';
    stopRecordButton.disabled = true;
    stopRecordButton.style.display = 'inline-flex';

    // Define recording functions
    const startRecording = async () => {
      if (isRecording || !isStreaming) return;

      isRecording = true;
      log('Starting recording...');
      streamingStatus.textContent = '🔴 RECORDING - Release SPACEBAR or click Stop to transcribe...';
      streamingStatus.className = 'status error';
      recordButton.disabled = true;
      stopRecordButton.disabled = false;

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
        isRecording = false;
        recordButton.disabled = false;
        stopRecordButton.disabled = true;

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

              // Add user message to chat history
              if (openaiResponse.innerHTML.includes('Start streaming to begin')) {
                openaiResponse.innerHTML = '';
              }

              const userMessageDiv = document.createElement('div');
              userMessageDiv.className = 'conversation-item user';
              userMessageDiv.innerHTML = `
                <div class="conversation-label">System Audio</div>
                ${transcriptionResult.text}
              `;
              openaiResponse.appendChild(userMessageDiv);

              // Start streaming response
              isResponseStreaming = true;
              streamingStatus.textContent = '🔄 Streaming response...';
              streamingStatus.className = 'status info';

              // Call streaming version - event listeners will handle the response
              window.electronAPI.chatCompletionStream(transcriptionResult.text, modelSelected, systemPrompt);
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

    // Button event listeners
    const recordButtonHandler = () => startRecording();
    const stopRecordButtonHandler = () => stopRecording();

    document.addEventListener('keydown', keydownHandler);
    document.addEventListener('keyup', keyupHandler);
    recordButton.addEventListener('click', recordButtonHandler);
    stopRecordButton.addEventListener('click', stopRecordButtonHandler);

    // Store cleanup function
    window.cleanupKeyboardListeners = () => {
      document.removeEventListener('keydown', keydownHandler);
      document.removeEventListener('keyup', keyupHandler);
      recordButton.removeEventListener('click', recordButtonHandler);
      stopRecordButton.removeEventListener('click', stopRecordButtonHandler);
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

  // Clean up keyboard listeners and button handlers
  if (window.cleanupKeyboardListeners) {
    window.cleanupKeyboardListeners();
    window.cleanupKeyboardListeners = null;
  }

  // Hide record buttons
  recordButton.style.display = 'none';
  stopRecordButton.style.display = 'none';
  recordButton.disabled = true;
  stopRecordButton.disabled = true;

  // Reset recording state
  isRecording = false;
  currentRecorder = null;

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

function getCategoryHint(category) {
  const hints = {
    'invalid_api_key': 'Check your API key is correct and starts with "sk-"',
    'expired_api_key': 'Your API key may have expired - try generating a new one in OpenAI dashboard',
    'rate_limit': 'You\'ve hit the API rate limit - wait a moment and try again',
    'insufficient_funds': 'Add credits or set up billing in your OpenAI account',
    'model_not_found': 'This model is not available with your API key - check your account access',
    'insufficient_quota': 'You\'ve exceeded your quota - upgrade your plan or wait for reset',
    'server_error': 'OpenAI servers are having issues - try again in a moment',
    'network_error': 'Check your internet connection and try again'
  };
  return hints[category] || 'Please check your API key and try again';
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

// Auto-check for updates on app start (silent if no update)
async function autoCheckForUpdates() {
  try {
    const result = await window.electronAPI.checkForUpdates();

    if (result.success && result.isUpdateAvailable) {
      // Only show notification if update is available
      const message = `🎉 New version ${result.latestVersion} is available!\nCurrent version: ${result.currentVersion}\n\nWould you like to visit the release page?`;

      if (confirm(message)) {
        await window.electronAPI.openExternalURL(result.releaseUrl);
      }
    }
    // Silent if no update available or error - don't bother the user
  } catch (error) {
    // Silently fail - don't show error on startup
    console.log('Silent auto-update check: ' + error.message);
  }
}



// Initialize the app

checkApiKeyStatus();
loadModelPreferences();
initializeSystemPrompts();
loadExistingContext();
checkFirstTime();

// Auto-check for updates on app start (silent)
autoCheckForUpdates();

// Check for updates button
if (updateBtn) {
  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.textContent = '⏳ Checking...';

    try {
      const result = await window.electronAPI.checkForUpdates();

      if (result.success) {
        if (result.isUpdateAvailable) {
          const message = `New version ${result.latestVersion} is available!\nCurrent version: ${result.currentVersion}\n\nWould you like to visit the release page?`;

          if (confirm(message)) {
            await window.electronAPI.openExternalURL(result.releaseUrl);
          }
        } else {
          alert(`✅ You are running the latest version (${result.currentVersion})!`);
        }
      } else {
        alert('⚠️ ' + (result.error || 'Could not check for updates. Please try again later.'));
      }
    } catch (error) {
      alert('❌ Error checking for updates: ' + error.message);
      log('Update check error: ' + error.message);
    } finally {
      updateBtn.disabled = false;
      updateBtn.textContent = '✨ Check Updates';
    }
  });
}

// Help button
if (helpBtn) {
  helpBtn.addEventListener('click', showGuide);
}

// Close button (X)
if (closeGuideBtn) {
  closeGuideBtn.addEventListener('click', closeGuide);
}

// Got it button
if (gotItBtn) {
  gotItBtn.addEventListener('click', closeGuide);
}

