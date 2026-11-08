const {contextBridge, ipcRenderer, webUtils} = require("electron");

contextBridge.exposeInMainWorld("luminaDesktop", {
    isDesktop: true,
    pickModel: () => ipcRenderer.invoke("pick-model"),
    openPath: (p) => ipcRenderer.invoke("open-path", p),
    openUrl: (u) => ipcRenderer.invoke("open-url", u),
    quit: () => ipcRenderer.invoke("quit-app"),
    hideToTray: () => ipcRenderer.invoke("hide-to-tray"),
    pathForFile: (file) => {
        try { return webUtils.getPathForFile(file); } catch { return null; }
    }
});
