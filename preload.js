const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld("versions", {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.invoke('ping'),
  startRecording: () => ipcRenderer.send("start-recording")
});

contextBridge.exposeInMainWorld('electronAPI', {
  transcribeAudio: (audioBlob, mimeType) => ipcRenderer.invoke('transcribe-audio', audioBlob, mimeType),
  chatCompletion: (text, model) => ipcRenderer.invoke('chat-completion', text, model),
  chatCompletionStream: (text, model, systemPrompt) => ipcRenderer.invoke('chat-completion-stream', text, model, systemPrompt),
  setApiKey: (apiKey) => ipcRenderer.invoke('set-api-key', apiKey),
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),

  // Streaming event listeners
  onChatStreamChunk: (callback) => ipcRenderer.on('chat-stream-chunk', (event, data) => callback(data)),
  onChatStreamComplete: (callback) => ipcRenderer.on('chat-stream-complete', (event, data) => callback(data)),
  onChatStreamError: (callback) => ipcRenderer.on('chat-stream-error', (event, data) => callback(data)),

  // Model management methods
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  setSelectedModel: (model) => ipcRenderer.invoke('set-selected-model', model),
  getSelectedModel: () => ipcRenderer.invoke('get-selected-model'),

  // Context management methods
  saveContext: (context) => ipcRenderer.invoke('save-context', context),
  getContext: () => ipcRenderer.invoke('get-context'),
  clearContext: () => ipcRenderer.invoke('clear-context'),

  // File management methods
  uploadFile: (fileName, fileBuffer) => ipcRenderer.invoke('upload-file', fileName, fileBuffer),
  removeFile: (fileName) => ipcRenderer.invoke('remove-file', fileName),
  getUploadedFiles: () => ipcRenderer.invoke('get-uploaded-files')
});
