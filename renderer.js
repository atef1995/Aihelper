// renderer.js
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const downloadButton = document.getElementById('downloadButton');
const downloadLink = document.getElementById('downloadLink');
const streamButton = document.getElementById('streamButton');
const stopStreamButton = document.getElementById('stopStreamButton');
const openaiResponse = document.getElementById('openaiResponse');
const streamingStatus = document.getElementById('streamingStatus');
const apiKeyInput = document.getElementById('apiKeyInput');
const setApiKeyButton = document.getElementById('setApiKeyButton');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const audio = document.querySelector('audio');
const logElement = document.getElementById('info');

let recordingTimeMS = 5000;
let recordedBlob = null;
let isStreaming = false;
let mediaRecorder = null;
let audioChunks = [];
let streamingInterval = null;
let audioContext = null;
let analyser = null;
let audioLevelThreshold = 5; // Minimum audio level to process (0-100)
let speechStartTime = null; // When speech started
let speechEndTime = null; // When speech ended
let silenceDuration = 2000; // Wait 2 seconds of silence before processing
let minSpeechDuration = 1000; // Minimum speech duration (1 second)
let isSpeaking = false;


startButton.addEventListener('click', () => {
  navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true
  }).then(stream => {
    audio.srcObject = stream
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error('No audio tracks available in stream');
    }
    const audioStream = new MediaStream(audioTracks);
    return startRecording(audioStream, recordingTimeMS);
  }).then((recordedChunks) => {
    recordedBlob = new Blob(recordedChunks, { type: "audio/wav" });
    const recordedUrl = URL.createObjectURL(recordedBlob);
    downloadLink.href = recordedUrl;
    downloadLink.download = "RecordedAudio.wav";

    log(
      `Successfully recorded ${Math.trunc(recordedBlob.size / 1000000)} MB of ${recordedBlob.type} media.`,
    );
    downloadButton.removeAttribute('disabled');
    startButton.disabled = false;
    stopButton.disabled = true;
  }).catch(error => {
    if (error.name === "NotFoundError") {
      log("Camera or microphone not found. Can't record.");
    } else {
      log(error);
    }
    startButton.disabled = false;
    stopButton.disabled = true;
  })

  startButton.disabled = true;
  stopButton.disabled = false;
})

stopButton.addEventListener('click', () => {
  audio.pause()
  if (audio.srcObject) {
    stop(audio.srcObject);
    audio.srcObject = null;
  }
})

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

function startRecording(stream, lengthInMS) {
  let recorder = new MediaRecorder(stream);
  let data = [];

  recorder.ondataavailable = (event) => data.push(event.data);
  recorder.start();
  log(`${recorder.state} for ${lengthInMS / 1000} seconds…`);

  let stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (event) => reject(event.name);
  });

  let recorded = wait(lengthInMS).then(() => {
    if (recorder.state === "recording") {
      recorder.stop();
    }
  });

  return Promise.all([stopped, recorded]).then(() => data);
}

// Real-time streaming functions
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

    // Set up audio analysis for silence detection
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(audioStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    isStreaming = true;
    streamButton.disabled = true;
    stopStreamButton.disabled = false;

    streamingStatus.textContent = '🔴 Initializing system audio...';
    streamingStatus.className = 'status info';

    // Create MediaRecorder for real-time processing with MP3 format if supported
    let options = { audioBitsPerSecond: 128000 };

    // Try MP3 first as it's most compatible with OpenAI
    if (MediaRecorder.isTypeSupported('audio/mpeg')) {
      options.mimeType = 'audio/mpeg';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      options.mimeType = 'audio/mp4';
    } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      options.mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      options.mimeType = 'audio/webm';
    }

    log(`Using audio format: ${options.mimeType || 'default'}`);
    mediaRecorder = new MediaRecorder(audioStream, options);

    audioChunks = [];

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && isStreaming) {
        audioChunks.push(event.data);

        // Check audio level and implement voice activity detection
        const audioLevel = getAudioLevel();
        const currentTime = Date.now();
        
        // Voice Activity Detection Logic
        if (audioLevel > audioLevelThreshold) {
          if (!isSpeaking) {
            // Speech just started
            isSpeaking = true;
            speechStartTime = currentTime;
            speechEndTime = null;
            log(`Speech started - level: ${audioLevel}%`);
          }
          // Update status during speech
          streamingStatus.textContent = `🔴 Speech detected (${audioLevel}%) - Recording...`;
          streamingStatus.className = 'status success';
        } else {
          if (isSpeaking) {
            // We were speaking, now silence - mark potential end
            if (!speechEndTime) {
              speechEndTime = currentTime;
              log(`Speech might have ended - waiting for ${silenceDuration}ms silence`);
            } else {
              // Check if we've been silent long enough
              const silenceTime = currentTime - speechEndTime;
              if (silenceTime >= silenceDuration) {
                // Speech has definitely ended
                const speechDuration = speechEndTime - speechStartTime;
                
                if (speechDuration >= minSpeechDuration && audioChunks.length > 0) {
                  // We have a valid speech segment, process it
                  streamingStatus.textContent = '🔴 Processing speech with OpenAI...';
                  streamingStatus.className = 'status info';
                  log(`Processing speech segment (${speechDuration}ms duration, ${audioChunks.length} chunks)`);
                  await processAudioChunks();
                } else {
                  log(`Speech too short (${speechDuration}ms) or no audio chunks, discarding`);
                  audioChunks = []; // Clear short speech segments
                }
                
                // Reset speech detection
                isSpeaking = false;
                speechStartTime = null;
                speechEndTime = null;
              }
            }
          }
          
          // Update status during silence
          if (!isSpeaking) {
            streamingStatus.textContent = `🔴 Listening... (${audioLevel}%)`;
            streamingStatus.className = 'status info';
          } else {
            const silenceTime = speechEndTime ? (currentTime - speechEndTime) : 0;
            const remaining = Math.max(0, silenceDuration - silenceTime);
            streamingStatus.textContent = `🔴 Speech paused... waiting ${Math.ceil(remaining/1000)}s`;
            streamingStatus.className = 'status warning';
          }
        }
      }
    };

    mediaRecorder.start(500); // Record in 500ms chunks for real-time processing
    log('Real-time streaming started');

  } catch (error) {
    log('Error starting stream: ' + error.message);
    streamingStatus.textContent = '❌ Error: ' + error.message;
    streamingStatus.className = 'status error';
    resetStreamButtons();
  }
}

function stopRealTimeStream() {
  isStreaming = false;

  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }

  if (streamingInterval) {
    clearInterval(streamingInterval);
    streamingInterval = null;
  }

  // Clean up audio context
  if (audioContext) {
    audioContext.close();
    audioContext = null;
    analyser = null;
  }

  // Reset speech detection variables
  isSpeaking = false;
  speechStartTime = null;
  speechEndTime = null;
  audioChunks = [];

  resetStreamButtons();
  streamingStatus.textContent = '⏸️ Streaming stopped';
  streamingStatus.className = 'status';
  log('Real-time streaming stopped');
}

function resetStreamButtons() {
  streamButton.disabled = false;
  stopStreamButton.disabled = true;
  updateStreamButtonState();
}

// Function to get current audio level for silence detection
function getAudioLevel() {
  if (!analyser) return 0;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  // Calculate average volume
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  const average = sum / bufferLength;

  // Convert to percentage (0-100)
  return Math.round((average / 255) * 100);
}

async function processAudioChunks() {
  if (audioChunks.length === 0) return;

  try {
    // Combine chunks into a single blob - determine the correct MIME type
    let mimeType = 'audio/webm';
    if (mediaRecorder && mediaRecorder.mimeType) {
      mimeType = mediaRecorder.mimeType;
    }

    const audioBlob = new Blob(audioChunks, { type: mimeType });
    audioChunks = []; // Clear processed chunks

    // Convert blob to array buffer for transmission
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Send to OpenAI for transcription
    const transcriptionResult = await window.electronAPI.transcribeAudio(uint8Array);

    if (transcriptionResult.success && transcriptionResult.text.trim()) {
      log(`Transcribed: "${transcriptionResult.text}"`);

      // Get AI response
      const chatResult = await window.electronAPI.chatCompletion(transcriptionResult.text);

      if (chatResult.success) {
        // Clear placeholder message if it exists
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
        
        // Update status to show successful processing
        streamingStatus.textContent = '🔴 Ready for more audio...';
        streamingStatus.className = 'status success';
      } else {
        log('Chat error: ' + chatResult.error);
        streamingStatus.textContent = '🔴 Chat error - continuing to listen...';
        streamingStatus.className = 'status warning';
      }
    } else if (!transcriptionResult.success) {
      // Log the error but continue processing
      log('Transcription failed: ' + transcriptionResult.error);
      streamingStatus.textContent = '🔴 Audio format issue - continuing...';
      streamingStatus.className = 'status warning';
    } else {
      log('No transcription text received');
    }

  } catch (error) {
    log('Processing error: ' + error.message);
    streamingStatus.textContent = '🔴 Processing error - continuing...';
    streamingStatus.className = 'status warning';
  }
}

function log(msg) {
  logElement.innerText += `${msg}\n`;
}

function wait(delayInMS) {
  return new Promise((resolve) => setTimeout(resolve, delayInMS));
}
function stop(stream) {
  stream.getTracks().forEach((track) => track.stop());
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  checkApiKeyStatus();
});