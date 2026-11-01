//#region src/preload/index.js
var { contextBridge, ipcRenderer } = require("electron");
var { electronAPI } = require("@electron-toolkit/preload");
var api = {
	getCachedLibrary: () => ipcRenderer.invoke("library:getCached"),
	scanMovies: () => ipcRenderer.invoke("scan-movies"),
	playMovie: (filePath) => ipcRenderer.invoke("play-movie", filePath),
	selectMovieFolder: () => ipcRenderer.invoke("dialog:openMovieFolder"),
	getMovieFolder: () => ipcRenderer.invoke("config:getMovieFolder"),
	selectPlayerExecutable: () => ipcRenderer.invoke("dialog:openPlayerExecutable"),
	getPlayerPath: () => ipcRenderer.invoke("config:getPlayerPath"),
	openDefaultApps: () => ipcRenderer.invoke("system:openDefaultApps")
};
if (process.contextIsolated) try {
	contextBridge.exposeInMainWorld("electron", electronAPI);
	contextBridge.exposeInMainWorld("api", api);
} catch (error) {
	console.error(error);
}
else {
	window.electron = electronAPI;
	window.api = api;
}
//#endregion
