//#region src/main/index.js
var { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
var path = require("path");
var fs = require("fs").promises;
var fsSync = require("fs");
var { optimizer } = require("@electron-toolkit/utils");
require("dotenv").config();
var TMDB_API_KEY = process.env.TMDB_API_KEY || "";
process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
var dbPath = path.join(app.getPath("userData"), "library.json");
var configPath = path.join(app.getPath("userData"), "config.json");
async function loadDatabase() {
	try {
		return JSON.parse(await fs.readFile(dbPath, "utf8"));
	} catch {
		return {
			movieMetadata: {},
			movies: [],
			tvShows: []
		};
	}
}
async function saveDatabase(db) {
	await fs.writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}
function loadConfig() {
	try {
		if (fsSync.existsSync(configPath)) return JSON.parse(fsSync.readFileSync(configPath, "utf8"));
	} catch (e) {
		console.error(e);
	}
	return {
		movieFolder: "",
		playerPath: ""
	};
}
function saveConfig(cfg) {
	fsSync.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf8");
}
function isExtraOrBonusFolder(folderPath) {
	return [
		"extras",
		"featurettes",
		"bonus",
		"behind the scenes",
		"trailers",
		"deleted scenes",
		"sample",
		"subs"
	].some((keyword) => folderPath.toLowerCase().includes(keyword));
}
function normalizeShowTitle(title, folderPath) {
	let showTitle = title.replace(/[._]/g, " ").trim();
	if (showTitle.length <= 2 || /^(season|book)/i.test(showTitle)) {
		const segments = folderPath.split(path.sep).filter(Boolean);
		for (let i = segments.length - 1; i >= 0; i--) if (!/^(season|book)/i.test(segments[i])) {
			showTitle = segments[i].replace(/[._]/g, " ").trim();
			break;
		}
	}
	if (/^atla$|^avatar$/i.test(showTitle)) return "Avatar: The Last Airbender";
	return showTitle;
}
async function fetchMovieMetadata(title, year) {
	const defaultMeta = {
		genres: ["Uncategorized"],
		posterUrl: "",
		backdropUrl: "",
		overview: "No description available.",
		rating: 0,
		releaseDate: year,
		collectionName: null,
		collectionId: null
	};
	try {
		const cleanTitle = title.replace(/\b\d+\b/g, "").replace(/[^\w\s&]/gi, "").replace(/\s+/g, " ").trim();
		let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&year=${year}`;
		let res = await fetch(searchUrl);
		let data = await res.json();
		if ((!data.results || data.results.length === 0) && year) {
			res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`);
			data = await res.json();
		}
		if (data.results && data.results.length > 0) {
			const basic = data.results[0];
			const details = await (await fetch(`https://api.themoviedb.org/3/movie/${basic.id}?api_key=${TMDB_API_KEY}`)).json();
			const genres = (details.genres || []).map((g) => g.name).slice(0, 2);
			return {
				genres: genres.length > 0 ? genres : ["Action"],
				posterUrl: basic.poster_path ? `https://image.tmdb.org/t/p/w500${basic.poster_path}` : "",
				backdropUrl: basic.backdrop_path ? `https://image.tmdb.org/t/p/original${basic.backdrop_path}` : "",
				overview: basic.overview || "No description available.",
				rating: basic.vote_average || 0,
				releaseDate: basic.release_date || year,
				collectionName: details.belongs_to_collection ? details.belongs_to_collection.name : null,
				collectionId: details.belongs_to_collection ? details.belongs_to_collection.id : null
			};
		}
	} catch (error) {
		console.error("Movie API fetch failed:", error);
	}
	return defaultMeta;
}
function parseEpisodeInfo(fileName, folderPath) {
	for (const regex of [
		/(.+?)[._\s]+[Ss](\d+)[Ee](\d+)/i,
		/(.+?)[._\s]+(\d+)x(\d+)/i,
		/(.+?)[._\s]+[Ss]eason[._\s]*(\d+)[._\s]*[Ee]pisode[._\s]*(\d+)/i
	]) {
		const match = fileName.match(regex);
		if (match) return {
			showTitle: normalizeShowTitle(match[1], folderPath),
			seasonNumber: parseInt(match[2], 10),
			episodeNumber: parseInt(match[3], 10)
		};
	}
	const seasonMatch = folderPath.match(/(?:season|book)[._\s]*(\d+)/i);
	if (seasonMatch) {
		const epMatch = fileName.match(/(?:Ep\.?|Episode|Chapter|\b)[._\s]*(\d{1,2})\b/i);
		if (epMatch) return {
			showTitle: normalizeShowTitle("", folderPath),
			seasonNumber: parseInt(seasonMatch[1], 10),
			episodeNumber: parseInt(epMatch[1], 10)
		};
	}
	return null;
}
var tvSeasonCache = {};
async function fetchTVMetadata(showTitle, seasonNum, episodeNum) {
	const fallback = {
		showName: showTitle,
		showPoster: "",
		showBackdrop: "",
		rating: 0,
		episodeName: `Episode ${episodeNum}`,
		episodeOverview: "No description available.",
		stillUrl: ""
	};
	try {
		const yearQuery = showTitle.toLowerCase().includes("avatar") && showTitle.toLowerCase().includes("airbender") ? "&first_air_date_year=2005" : "";
		let res = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(showTitle)}${yearQuery}`);
		let data = await res.json();
		if ((!data.results || data.results.length === 0) && yearQuery) {
			res = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(showTitle)}`);
			data = await res.json();
		}
		if (data.results && data.results.length > 0) {
			const tvShow = data.results[0];
			let epName = `Episode ${episodeNum}`;
			let epOverview = "No description available.";
			let stillUrl = "";
			try {
				const epData = await (await fetch(`https://api.themoviedb.org/3/tv/${tvShow.id}/season/${seasonNum}/episode/${episodeNum}?api_key=${TMDB_API_KEY}`)).json();
				if (epData && epData.name) {
					epName = epData.name;
					epOverview = epData.overview || epOverview;
					if (epData.still_path) stillUrl = `https://image.tmdb.org/t/p/w500${epData.still_path}`;
				}
			} catch (e) {}
			if (!stillUrl || epName === `Episode ${episodeNum}`) {
				const cacheKey = `${tvShow.id}_S${seasonNum}`;
				if (!tvSeasonCache[cacheKey]) tvSeasonCache[cacheKey] = await (await fetch(`https://api.themoviedb.org/3/tv/${tvShow.id}/season/${seasonNum}?api_key=${TMDB_API_KEY}`)).json();
				const foundEp = (tvSeasonCache[cacheKey].episodes || []).find((e) => e.episode_number === episodeNum);
				if (foundEp) {
					epName = foundEp.name || epName;
					epOverview = foundEp.overview || epOverview;
					if (foundEp.still_path) stillUrl = `https://image.tmdb.org/t/p/w500${foundEp.still_path}`;
				}
			}
			return {
				showName: tvShow.name,
				showPoster: tvShow.poster_path ? `https://image.tmdb.org/t/p/w500${tvShow.poster_path}` : "",
				showBackdrop: tvShow.backdrop_path ? `https://image.tmdb.org/t/p/original${tvShow.backdrop_path}` : "",
				rating: tvShow.vote_average || 0,
				episodeName: epName,
				episodeOverview: epOverview,
				stillUrl
			};
		}
	} catch (err) {
		console.error("TV Metadata fetch failed:", err);
	}
	return fallback;
}
function cleanMovieName(folderName) {
	const cutIndex = Math.min(folderName.indexOf("(") !== -1 ? folderName.indexOf("(") : folderName.length, folderName.indexOf("[") !== -1 ? folderName.indexOf("[") : folderName.length);
	const title = folderName.substring(0, cutIndex).trim();
	const yearMatch = folderName.match(/\((\d{4})\)/);
	return {
		title: title || folderName,
		year: yearMatch ? yearMatch[1] : "2024"
	};
}
async function scanMediaFolder(folderPath) {
	if (!folderPath) return {
		movies: [],
		tvShows: []
	};
	const validExtensions = [
		".mp4",
		".mkv",
		".avi",
		".mov",
		".webm"
	];
	const db = await loadDatabase();
	const movieMetadataCache = db.movieMetadata || {};
	const movies = [];
	const tvShows = [];
	async function getAllFiles(dirPath) {
		let results = [];
		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name);
				if (isExtraOrBonusFolder(fullPath)) continue;
				if (entry.isDirectory()) results = results.concat(await getAllFiles(fullPath));
				else if (validExtensions.includes(path.extname(entry.name).toLowerCase())) {
					const stats = await fs.stat(fullPath);
					results.push({
						fileName: entry.name,
						filePath: fullPath,
						folderPath: dirPath,
						birthTime: stats.birthtimeMs
					});
				}
			}
		} catch (err) {
			console.error(`Error reading directory ${dirPath}:`, err);
		}
		return results;
	}
	try {
		const allFiles = await getAllFiles(folderPath);
		for (const file of allFiles) {
			const epInfo = parseEpisodeInfo(file.fileName, file.folderPath);
			if (epInfo) {
				const tvMeta = await fetchTVMetadata(epInfo.showTitle, epInfo.seasonNumber, epInfo.episodeNumber);
				tvShows.push({
					type: "tv",
					showTitle: tvMeta.showName,
					seasonNumber: epInfo.seasonNumber,
					episodeNumber: epInfo.episodeNumber,
					episodeName: tvMeta.episodeName,
					overview: tvMeta.episodeOverview,
					stillUrl: tvMeta.stillUrl,
					showPoster: tvMeta.showPoster,
					showBackdrop: tvMeta.showBackdrop,
					rating: tvMeta.rating,
					filePath: file.filePath,
					fileName: file.fileName,
					dateAdded: file.birthTime
				});
			} else {
				const segments = file.folderPath.split(path.sep).filter(Boolean);
				const parentFolder = segments[segments.length - 1] || file.fileName;
				if (/^(season|book|specials)/i.test(parentFolder)) continue;
				const { title, year } = cleanMovieName(file.folderPath === folderPath ? file.fileName : parentFolder);
				let metadata = movieMetadataCache[title];
				if (!metadata) {
					metadata = await fetchMovieMetadata(title, year);
					movieMetadataCache[title] = metadata;
				}
				movies.push({
					type: "movie",
					title,
					fileName: file.fileName,
					filePath: file.filePath,
					genres: metadata.genres || ["Uncategorized"],
					year,
					posterUrl: metadata.posterUrl,
					backdropUrl: metadata.backdropUrl,
					overview: metadata.overview,
					rating: metadata.rating,
					releaseDate: metadata.releaseDate,
					collectionName: metadata.collectionName,
					collectionId: metadata.collectionId,
					dateAdded: file.birthTime
				});
			}
		}
		db.movieMetadata = movieMetadataCache;
		db.movies = movies;
		db.tvShows = tvShows;
		await saveDatabase(db);
	} catch (error) {
		console.error("Error scanning media folder:", error);
	}
	return {
		movies,
		tvShows
	};
}
function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "../preload/index.js"),
			sandbox: false
		}
	});
	mainWindow.on("ready-to-show", () => mainWindow.show());
	mainWindow.webContents.setWindowOpenHandler((details) => {
		shell.openExternal(details.url);
		return { action: "deny" };
	});
	if (process.env["ELECTRON_RENDERER_URL"]) mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	else mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}
app.whenReady().then(() => {
	ipcMain.handle("library:getCached", async () => {
		try {
			const db = await loadDatabase();
			return {
				movies: db.movies || [],
				tvShows: db.tvShows || []
			};
		} catch {
			return {
				movies: [],
				tvShows: []
			};
		}
	});
	ipcMain.handle("scan-movies", async () => {
		return await scanMediaFolder(loadConfig().movieFolder || "");
	});
	ipcMain.handle("play-movie", async (_, filePath) => {
		try {
			const config = loadConfig();
			if (config.playerPath && config.playerPath.trim() !== "") require("child_process").spawn(config.playerPath, [filePath], {
				detached: true,
				stdio: "ignore"
			}).unref();
			else await shell.openPath(filePath);
			return true;
		} catch (error) {
			console.error("Failed to open file with player:", error);
			return false;
		}
	});
	ipcMain.handle("system:openDefaultApps", async () => {
		if (process.platform === "win32") {
			await shell.openExternal("ms-settings:defaultapps");
			return true;
		}
		return false;
	});
	ipcMain.handle("dialog:openMovieFolder", async () => {
		const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ["openDirectory"] });
		if (!canceled && filePaths.length > 0) {
			let config = loadConfig();
			config.movieFolder = filePaths[0];
			saveConfig(config);
			return filePaths[0];
		}
		return null;
	});
	ipcMain.handle("dialog:openPlayerExecutable", async () => {
		const { canceled, filePaths } = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{
				name: "Executables",
				extensions: [
					"exe",
					"app",
					"bin"
				]
			}, {
				name: "All Files",
				extensions: ["*"]
			}]
		});
		if (!canceled && filePaths.length > 0) {
			let config = loadConfig();
			config.playerPath = filePaths[0];
			saveConfig(config);
			return filePaths[0];
		}
		return null;
	});
	ipcMain.handle("config:getMovieFolder", async () => loadConfig().movieFolder);
	ipcMain.handle("config:getPlayerPath", async () => loadConfig().playerPath);
	app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));
	ipcMain.on("ping", () => console.log("pong"));
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
//#endregion
