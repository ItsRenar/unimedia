const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const { optimizer } = require('@electron-toolkit/utils')

// Load environment variables from .env file locally
require('dotenv').config()
const TMDB_API_KEY = process.env.TMDB_API_KEY || ''

// Catch any stray unhandled promise rejections globally
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Path for our automatic local database cache
const dbPath = path.join(app.getPath('userData'), 'library.json');
// Config file path for user preferences
const configPath = path.join(app.getPath('userData'), 'config.json');

async function loadDatabase() {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { movieMetadata: {}, movies: [], tvShows: [] }; 
  }
}

async function saveDatabase(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

// Config Helpers
function loadConfig() {
  try {
    if (fsSync.existsSync(configPath)) {
      return JSON.parse(fsSync.readFileSync(configPath, 'utf8'));
    }
  } catch (e) { console.error(e); }
  return { movieFolder: '', playerPath: '' };
}

function saveConfig(cfg) {
  fsSync.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
}

// Helper to check for bonus / extra folders
function isExtraOrBonusFolder(folderPath) {
  const normalized = folderPath.toLowerCase();
  const extraKeywords = ['extras', 'featurettes', 'bonus', 'behind the scenes', 'trailers', 'deleted scenes', 'sample', 'subs'];
  return extraKeywords.some(keyword => normalized.includes(keyword));
}

// ==========================================
// MOVIE METADATA FETCHER (TMDb)
// ==========================================
async function fetchMovieMetadata(title, year) {
  try {
    const cleanTitle = title
      .replace(/\b\d+\b/g, '') 
      .replace(/[^\w\s&]/gi, '') 
      .replace(/\s+/g, ' ')
      .trim();

    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&year=${year}`;
    let searchRes = await fetch(searchUrl);
    let searchData = await searchRes.json();

    if ((!searchData.results || searchData.results.length === 0) && year) {
      const fallbackUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`;
      searchRes = await fetch(fallbackUrl);
      searchData = await searchRes.json();
    }

    if (searchData.results && searchData.results.length > 0) {
      const basicMovie = searchData.results[0];
      const movieId = basicMovie.id;

      const detailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();

      const genres = (detailsData.genres || []).map(g => g.name).slice(0, 2);

      return { 
        genres: genres.length > 0 ? genres : ["Action"],
        posterUrl: basicMovie.poster_path ? `https://image.tmdb.org/t/p/w500${basicMovie.poster_path}` : "",
        backdropUrl: basicMovie.backdrop_path ? `https://image.tmdb.org/t/p/original${basicMovie.backdrop_path}` : "",
        overview: basicMovie.overview || "No description available.",
        rating: basicMovie.vote_average || 0,
        releaseDate: basicMovie.release_date || year,
        collectionName: detailsData.belongs_to_collection ? detailsData.belongs_to_collection.name : null,
        collectionId: detailsData.belongs_to_collection ? detailsData.belongs_to_collection.id : null
      };
    }
  } catch (error) {
    console.error("Movie API fetch failed:", error);
  }

  return { 
    genres: ["Uncategorized"], posterUrl: "", backdropUrl: "", 
    overview: "No description available.", rating: 0, releaseDate: year,
    collectionName: null, collectionId: null
  };
}

// ==========================================
// STRICT TV SHOW & EPISODE PARSER
// ==========================================
function parseEpisodeInfo(fileName, folderPath) {
  const epRegexes = [
    /(.+?)[._\s]+[Ss](\d+)[Ee](\d+)/i,
    /(.+?)[._\s]+(\d+)x(\d+)/i,
    /(.+?)[._\s]+[Ss]eason[._\s]*(\d+)[._\s]*[Ee]pisode[._\s]*(\d+)/i
  ];

  for (const regex of epRegexes) {
    const match = fileName.match(regex);
    if (match) {
      let showTitle = match[1].replace(/[._]/g, ' ').trim();
      
      if (showTitle.length <= 2 || /^(season|book)/i.test(showTitle)) {
        const pathSegments = folderPath.split(path.sep).filter(Boolean);
        for (let i = pathSegments.length - 1; i >= 0; i--) {
          if (!/^(season|book)/i.test(pathSegments[i])) {
            showTitle = pathSegments[i].replace(/[._]/g, ' ').trim();
            break;
          }
        }
      }

      if (/^atla$/i.test(showTitle) || /^avatar$/i.test(showTitle)) {
        showTitle = "Avatar: The Last Airbender";
      }

      return {
        showTitle: showTitle,
        seasonNumber: parseInt(match[2], 10),
        episodeNumber: parseInt(match[3], 10)
      };
    }
  }

  const seasonFolderMatch = folderPath.match(/(?:season|book)[._\s]*(\d+)/i);
  if (seasonFolderMatch) {
    const epMatch = fileName.match(/(?:Ep\.?|Episode|Chapter|\b)[._\s]*(\d{1,2})\b/i);
    
    if (epMatch) {
      const seasonNumber = parseInt(seasonFolderMatch[1], 10);
      const episodeNumber = parseInt(epMatch[1], 10);

      const pathSegments = folderPath.split(path.sep).filter(Boolean);
      let showTitle = "Avatar: The Last Airbender";
      for (let i = pathSegments.length - 1; i >= 0; i--) {
        if (!/^(season|book)/i.test(pathSegments[i])) {
          showTitle = pathSegments[i].replace(/[._]/g, ' ').trim();
          break;
        }
      }

      if (/^atla$/i.test(showTitle) || /^avatar$/i.test(showTitle)) {
        showTitle = "Avatar: The Last Airbender";
      }

      return {
        showTitle: showTitle,
        seasonNumber: seasonNumber,
        episodeNumber: episodeNumber
      };
    }
  }

  return null;
}

// Local cache for fetched TMDb Season data to avoid redundant API calls
const tvSeasonCache = {};

async function fetchTVMetadata(showTitle, seasonNum, episodeNum) {
  try {
    let yearQuery = '';
    if (showTitle.toLowerCase().includes('avatar') && showTitle.toLowerCase().includes('airbender')) {
      yearQuery = '&first_air_date_year=2005';
    }

    const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(showTitle)}${yearQuery}`;
    let searchRes = await fetch(searchUrl);
    let searchData = await searchRes.json();

    if ((!searchData.results || searchData.results.length === 0) && yearQuery !== '') {
      const fallbackUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(showTitle)}`;
      searchRes = await fetch(fallbackUrl);
      searchData = await searchRes.json();
    }

    if (searchData.results && searchData.results.length > 0) {
      const tvShow = searchData.results[0];
      const showId = tvShow.id;

      let epName = `Episode ${episodeNum}`;
      let epOverview = "No description available.";
      let stillUrl = '';

      try {
        const epUrl = `https://api.themoviedb.org/3/tv/${showId}/season/${seasonNum}/episode/${episodeNum}?api_key=${TMDB_API_KEY}`;
        const epRes = await fetch(epUrl);
        const epData = await epRes.json();

        if (epData && epData.name) {
          epName = epData.name;
          epOverview = epData.overview || epOverview;
          if (epData.still_path) {
            stillUrl = `https://image.tmdb.org/t/p/w500${epData.still_path}`;
          }
        }
      } catch (e) {
        console.warn(`Individual episode fetch failed for S${seasonNum}E${episodeNum}, trying season fallback...`);
      }

      if (!stillUrl || epName === `Episode ${episodeNum}`) {
        const seasonCacheKey = `${showId}_S${seasonNum}`;
        let seasonData = tvSeasonCache[seasonCacheKey];

        if (!seasonData) {
          const seasonUrl = `https://api.themoviedb.org/3/tv/${showId}/season/${seasonNum}?api_key=${TMDB_API_KEY}`;
          const seasonRes = await fetch(seasonUrl);
          seasonData = await seasonRes.json();
          if (seasonData && seasonData.episodes) {
            tvSeasonCache[seasonCacheKey] = seasonData;
          }
        }

        if (seasonData && seasonData.episodes) {
          const foundEp = seasonData.episodes.find(e => e.episode_number === episodeNum);
          if (foundEp) {
            epName = foundEp.name || epName;
            epOverview = foundEp.overview || epOverview;
            if (foundEp.still_path) {
              stillUrl = `https://image.tmdb.org/t/p/w500${foundEp.still_path}`;
            }
          }
        }
      }

      return {
        showName: tvShow.name,
        showPoster: tvShow.poster_path ? `https://image.tmdb.org/t/p/w500${tvShow.poster_path}` : '',
        showBackdrop: tvShow.backdrop_path ? `https://image.tmdb.org/t/p/original${tvShow.backdrop_path}` : '',
        rating: tvShow.vote_average || 0,
        episodeName: epName,
        episodeOverview: epOverview,
        stillUrl: stillUrl
      };
    }
  } catch (err) {
    console.error("TV Metadata fetch failed:", err);
  }

  return {
    showName: showTitle,
    showPoster: '',
    showBackdrop: '',
    rating: 0,
    episodeName: `Episode ${episodeNum}`,
    episodeOverview: "No description available.",
    stillUrl: ''
  };
}

function cleanMovieName(folderName) {
  const parenIndex = folderName.indexOf('(');
  const bracketIndex = folderName.indexOf('[');
  let cutIndex = folderName.length;
  if (parenIndex !== -1) cutIndex = Math.min(cutIndex, parenIndex);
  if (bracketIndex !== -1) cutIndex = Math.min(cutIndex, bracketIndex);
  
  const title = folderName.substring(0, cutIndex).trim();
  const yearMatch = folderName.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : "2024";
  return { title: title || folderName, year: year };
}

// ==========================================
// RECURSIVE DEEP FOLDER SCANNER
// ==========================================
async function scanMediaFolder(folderPath) {
  if (!folderPath) return { movies: [], tvShows: [] };

  const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
  let db = await loadDatabase();
  let movieMetadataCache = db.movieMetadata || {};
  let movies = [];
  let tvShows = [];

  async function getAllFiles(dirPath) {
    let results = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (isExtraOrBonusFolder(fullPath)) continue;

        if (entry.isDirectory()) {
          const subResults = await getAllFiles(fullPath);
          results = results.concat(subResults);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (validExtensions.includes(ext)) {
            const stats = await fs.stat(fullPath);
            results.push({
              fileName: entry.name,
              filePath: fullPath,
              folderPath: dirPath,
              birthTime: stats.birthtimeMs
            });
          }
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
        let tvMeta = await fetchTVMetadata(epInfo.showTitle, epInfo.seasonNumber, epInfo.episodeNumber);
        tvShows.push({
          type: 'tv',
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
        const pathSegments = file.folderPath.split(path.sep).filter(Boolean);
        const parentFolderName = pathSegments[pathSegments.length - 1] || file.fileName;
        
        if (/^(season|book|specials)/i.test(parentFolderName)) {
          continue; 
        }

        const targetString = file.folderPath === folderPath ? file.fileName : parentFolderName;
        const { title, year } = cleanMovieName(targetString);
        let metadata = movieMetadataCache[title];

        if (!metadata) {
          console.log(`Fetching online metadata for movie: ${title}`);
          metadata = await fetchMovieMetadata(title, year);
          movieMetadataCache[title] = metadata;
        }

        movies.push({
          type: 'movie',
          title: title,
          fileName: file.fileName,
          filePath: file.filePath,
          genres: metadata.genres || ["Uncategorized"],
          year: year,
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

    // Save complete scanned library and metadata cache
    db.movieMetadata = movieMetadataCache;
    db.movies = movies;
    db.tvShows = tvShows;
    await saveDatabase(db);
  } catch (error) {
    console.error("Error scanning media folder:", error);
  }

  return { movies, tvShows };
}

// ==========================================
// CREATE MAIN WINDOW FUNCTION
// ==========================================
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ==========================================
// APP READY & IPC HANDLERS
// ==========================================
app.whenReady().then(() => {
  // GET CACHED MEDIA INSTANTLY WITH FULL FILE PATHS
  ipcMain.handle('library:getCached', async () => {
    try {
      const db = await loadDatabase();
      return {
        movies: db.movies || [],
        tvShows: db.tvShows || []
      };
    } catch (err) {
      console.error("Failed to load cached library:", err);
      return { movies: [], tvShows: [] };
    }
  });

  ipcMain.handle('scan-movies', async () => {
    const config = loadConfig();
    const targetFolder = config.movieFolder || ''; 
    return await scanMediaFolder(targetFolder);
  });

  ipcMain.handle('play-movie', async (_, filePath) => {
    try {
      const config = loadConfig();
      const customPlayer = config.playerPath;

      if (customPlayer && customPlayer.trim() !== '') {
        const { spawn } = require('child_process');
        spawn(customPlayer, [filePath], { detached: true, stdio: 'ignore' }).unref();
        return true;
      } else {
        await shell.openPath(filePath);
        return true;
      }
    } catch (error) {
      console.error("Failed to open file with player:", error);
      return false;
    }
  });

  ipcMain.handle('system:openDefaultApps', async () => {
    try {
      if (process.platform === 'win32') {
        await shell.openExternal('ms-settings:defaultapps');
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to open Windows default apps settings:", error);
      return false;
    }
  });

  ipcMain.handle('dialog:openMovieFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (!canceled && filePaths.length > 0) {
      const chosenPath = filePaths[0];
      let config = loadConfig();
      config.movieFolder = chosenPath;
      saveConfig(config);
      return chosenPath;
    }
    return null;
  });

  ipcMain.handle('dialog:openPlayerExecutable', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Executables', extensions: ['exe', 'app', 'bin'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (!canceled && filePaths.length > 0) {
      const chosenPath = filePaths[0];
      let config = loadConfig();
      config.playerPath = chosenPath;
      saveConfig(config);
      return chosenPath;
    }
    return null;
  });

  ipcMain.handle('config:getMovieFolder', async () => { return loadConfig().movieFolder; });
  ipcMain.handle('config:getPlayerPath', async () => { return loadConfig().playerPath; });

  app.on('browser-window-created', (_, window) => { optimizer.watchWindowShortcuts(window) })
  ipcMain.on('ping', () => console.log('pong'))
  
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})