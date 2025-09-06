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
  chatCompletion: (text) => ipcRenderer.invoke('chat-completion', text),
  setApiKey: (apiKey) => ipcRenderer.invoke('set-api-key', apiKey),
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
  
  // Context management methods
  saveContext: (context) => ipcRenderer.invoke('save-context', context),
  getContext: () => ipcRenderer.invoke('get-context'),
  clearContext: () => ipcRenderer.invoke('clear-context'),
  
  // File management methods
  uploadFile: (fileName, fileBuffer) => ipcRenderer.invoke('upload-file', fileName, fileBuffer),
  removeFile: (fileName) => ipcRenderer.invoke('remove-file', fileName),
  getUploadedFiles: () => ipcRenderer.invoke('get-uploaded-files')
});
