const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveProject: (jsonString) => ipcRenderer.invoke('save-project', jsonString),
  openProject: () => ipcRenderer.invoke('open-project'),
  saveBot: (jsString) => ipcRenderer.invoke('save-bot', jsString),
});
