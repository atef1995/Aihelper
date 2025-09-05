const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld("versions", {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.invoke('ping'),
  startRecording: () => ipcRenderer.send("start-recording")
});

contextBridge.exposeInMainWorld('electronAPI', {
  transcribeAudio: (audioBlob) => ipcRenderer.invoke('transcribe-audio', audioBlob),
  chatCompletion: (text) => ipcRenderer.invoke('chat-completion', text),
  setApiKey: (apiKey) => ipcRenderer.invoke('set-api-key', apiKey),
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status')
});
