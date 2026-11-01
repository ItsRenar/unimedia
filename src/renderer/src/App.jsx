import React, { useState, useEffect, useRef } from 'react'
import MovieCard from './components/MovieCard'
import UniMediaLogo from './assets/unimedia_logo.png'

export default function App() {
  const [movies, setMovies] = useState([])
  const [rawTvShows, setRawTvShows] = useState([])
  const [selectedShow, setSelectedShow] = useState(null)
  const [activeSeason, setActiveSeason] = useState(1)
  const [selectedGenre, setSelectedGenre] = useState(null)
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [activeMovieDetail, setActiveMovieDetail] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [movieFolderPath, setMovieFolderPath] = useState('')
  const [playerPath, setPlayerPath] = useState('')
  const [watchedPaths, setWatchedPaths] = useState(() => {
    try {
      const saved = localStorage.getItem('unimedia_watched')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [upNextEpisode, setUpNextEpisode] = useState(null)

  const searchRef = useRef(null)

  useEffect(() => {
    // 1. Instantly load cached media from local database
    if (window.api.getCachedLibrary) {
      window.api.getCachedLibrary().then((cached) => {
        if (cached.movies.length > 0 || cached.tvShows.length > 0) {
          setMovies(cached.movies || [])
          setRawTvShows(cached.tvShows || [])
        }
      }).catch((err) => console.error("Failed to load instant cache:", err))
    }

    // 2. Perform background rescan to fetch new files without blocking startup UI
    window.api.scanMovies().then((data) => {
      setMovies(data.movies || [])
      setRawTvShows(data.tvShows || [])
    }).catch((err) => {
      console.error("Failed to sync media library:", err)
    })

    if (window.api.getMovieFolder) {
      window.api.getMovieFolder().then(path => { if (path) setMovieFolderPath(path) }).catch(() => {})
    }
    if (window.api.getPlayerPath) {
      window.api.getPlayerPath().then(path => { if (path) setPlayerPath(path) }).catch(() => {})
    }

    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Group raw TV show episodes into unique shows
  const tvShowsMap = {}
  rawTvShows.forEach(item => {
    if (!tvShowsMap[item.showTitle]) {
      tvShowsMap[item.showTitle] = {
        showTitle: item.showTitle,
        showPoster: item.showPoster,
        showBackdrop: item.showBackdrop,
        rating: item.rating,
        seasonsSet: new Set(),
        episodes: []
      }
    }
    tvShowsMap[item.showTitle].seasonsSet.add(item.seasonNumber)
    tvShowsMap[item.showTitle].episodes.push(item)
  })

  const tvShows = Object.values(tvShowsMap).map(show => ({
    ...show,
    seasons: Array.from(show.seasonsSet).sort((a, b) => a - b)
  }))

  // Compute movie series / collections
  const seriesMap = {}
  movies.forEach(movie => {
    if (movie.collectionName) {
      if (!seriesMap[movie.collectionName]) {
        seriesMap[movie.collectionName] = {
          name: movie.collectionName,
          posterUrl: movie.posterUrl,
          movies: []
        }
      }
      seriesMap[movie.collectionName].movies.push(movie)
    }
  })
  const allSeries = Object.values(seriesMap)

  // Compute unique genres
  const genreSet = new Set()
  movies.forEach(movie => {
    if (movie.genres) {
      movie.genres.forEach(g => genreSet.add(g))
    }
  })
  const allGenres = Array.from(genreSet).sort()

  const allMedia = [...movies, ...rawTvShows]
  // Sort watched media by the order of watchedPaths in reverse (most recent first)
  const recentMovies = [...watchedPaths]
    .reverse()
    .map(path => allMedia.find(m => m.filePath === path))
    .filter(Boolean)
    .slice(0, 10)

  // Group TV shows for Recently Added so each show appears only once
  const tvShowLatestAddedMap = {}
  rawTvShows.forEach(item => {
    if (!tvShowLatestAddedMap[item.showTitle] || item.dateAdded > tvShowLatestAddedMap[item.showTitle].dateAdded) {
      tvShowLatestAddedMap[item.showTitle] = {
        type: 'tv_summary',
        showTitle: item.showTitle,
        showPoster: item.showPoster,
        showBackdrop: item.showBackdrop,
        rating: item.rating,
        dateAdded: item.dateAdded
      }
    }
  })
  const recentTvShowSummaries = Object.values(tvShowLatestAddedMap)
  const recentMoviesList = movies.map(m => ({ ...m, type: 'movie' }))

  const recentlyAddedMedia = [...recentMoviesList, ...recentTvShowSummaries]
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
    .slice(0, 10)

  const searchResults = allMedia.filter(item => {
    const title = item.title || item.showTitle || item.episodeName || ''
    return title.toLowerCase().includes(searchQuery.toLowerCase())
  }).slice(0, 8)

  const genreViewMovies = selectedGenre ? movies.filter(m => m.genres && m.genres.includes(selectedGenre)) : []

  const handleBackToMain = () => {
    setSelectedShow(null)
    setSelectedGenre(null)
    setSelectedSeries(null)
    setActiveMovieDetail(null)
    setSearchQuery('')
  }

  const handleOpenShow = (show) => {
    setSelectedShow(show)
    if (show.seasons && show.seasons.length > 0) {
      setActiveSeason(show.seasons[0])
    }
    setSelectedGenre(null)
    setSelectedSeries(null)
  }

  const handleOpenSeries = (series) => {
    setSelectedSeries(series)
    setSelectedShow(null)
    setSelectedGenre(null)
  }

  const handleOpenGenre = (genre) => {
    setSelectedGenre(genre)
    setSelectedShow(null)
    setSelectedSeries(null)
  }

  const handlePlayMovie = (movie) => {
    if (movie && movie.filePath) {
      window.api.playMovie(movie.filePath).then(() => {
        if (!watchedPaths.includes(movie.filePath)) {
          const updated = [...watchedPaths, movie.filePath]
          setWatchedPaths(updated)
          localStorage.setItem('unimedia_watched', JSON.stringify(updated))
        }
      }).catch(err => console.error("Failed to play movie:", err))
    } else {
      console.error("Movie file path is missing or invalid:", movie)
    }
  }

  const handlePlayEpisode = (ep, show) => {
    if (ep && ep.filePath) {
      window.api.playMovie(ep.filePath).then(() => {
        if (!watchedPaths.includes(ep.filePath)) {
          const updated = [...watchedPaths, ep.filePath]
          setWatchedPaths(updated)
          localStorage.setItem('unimedia_watched', JSON.stringify(updated))
        }

        if (show && show.episodes) {
          const sortedEps = [...show.episodes].sort((a, b) => {
            if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber
            return a.episodeNumber - b.episodeNumber
          })
          const currentIndex = sortedEps.findIndex(e => e.filePath === ep.filePath)
          if (currentIndex !== -1 && currentIndex + 1 < sortedEps.length) {
            setUpNextEpisode(sortedEps[currentIndex + 1])
          }
        }
      }).catch(err => console.error("Failed to play episode:", err))
    } else {
      console.error("Episode file path is missing or invalid:", ep)
    }
  }

  const handleSelectFolder = async () => {
    if (window.api.selectMovieFolder) {
      const folder = await window.api.selectMovieFolder()
      if (folder) setMovieFolderPath(folder)
    }
  }

  const handleSelectPlayer = async () => {
    if (window.api.selectPlayerExecutable) {
      const player = await window.api.selectPlayerExecutable()
      if (player) setPlayerPath(player)
    }
  }

  const handleOpenDefaultApps = async () => {
    if (window.api.openDefaultApps) {
      await window.api.openDefaultApps()
    }
  }

  const handleSaveAndRefresh = async () => {
    setIsSettingsOpen(false)
    const data = await window.api.scanMovies()
    setMovies(data.movies || [])
    setRawTvShows(data.tvShows || [])
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white relative">
      {/* SOLID STICKY HEADER */}
      <div className="sticky top-0 z-40 bg-slate-950 -mx-8 -mt-8 px-8 pt-8 pb-4 mb-8 flex items-center justify-between border-b border-slate-900 shadow-xl">
        <div className="w-1/3 flex items-center justify-start z-10">
          {(selectedGenre || selectedSeries || selectedShow) && (
            <button 
              onClick={handleBackToMain}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-400 transition-colors shadow-sm cursor-pointer"
            >
              ← Back to Main
            </button>
          )}
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img 
            src={UniMediaLogo} 
            alt="UniMedia Logo"
            className="h-12 w-auto cursor-pointer pointer-events-auto object-contain"
            onClick={handleBackToMain}
          />
        </div>

        <div className="w-1/3 flex items-center justify-end gap-3 z-10">
          <div className="relative w-full max-w-xs" ref={searchRef}>
            <input 
              type="text"
              placeholder="Search movies & shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors shadow-lg"
            />

            {isSearchFocused && searchQuery.trim() !== '' && (
              <div className="absolute right-0 w-full mt-2 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-96 overflow-y-auto z-50">
                {searchResults.length > 0 ? (
                  searchResults.map((item, index) => (
                    <div 
                      key={`search-result-${index}`}
                      onClick={() => {
                        if (item.type === 'tv' || item.seasons) {
                          handleOpenShow(item);
                        } else {
                          setActiveMovieDetail(item);
                        }
                        setSearchQuery('');
                        setIsSearchFocused(false);
                      }}
                      className="flex items-center gap-3 p-3 hover:bg-slate-900 cursor-pointer border-b border-slate-900/50 last:border-none transition-colors"
                    >
                      <img 
                        src={item.posterUrl || item.showPoster || "https://via.placeholder.com/40x60?text=No+Poster"} 
                        alt={item.title || item.showTitle} 
                        className="w-10 h-14 object-cover rounded bg-slate-900 flex-shrink-0"
                      />
                      <div className="overflow-hidden">
                        <h4 className="text-sm font-semibold text-slate-100 truncate">{item.title || item.showTitle}</h4>
                        <p className="text-xs text-slate-400">{item.year || `${item.seasons?.length || 0} Seasons`}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-slate-400 text-sm italic">
                    No results found matching "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2.5 rounded-lg text-slate-400 hover:text-cyan-400 transition-colors shadow-lg flex items-center justify-center flex-shrink-0 cursor-pointer"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* DYNAMIC VIEWS */}
      {selectedGenre ? (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-3">
            <h2 className="text-2xl font-bold text-cyan-400">
              {selectedGenre} <span className="text-xs font-normal text-slate-400 ml-2">({genreViewMovies.length} movies)</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-6">
            {genreViewMovies.map((movie, index) => {
              const isWatched = watchedPaths.includes(movie.filePath);
              return (
                <div key={`genre-view-${index}`} onClick={() => setActiveMovieDetail(movie)} className="cursor-pointer transition-transform hover:scale-105 relative">
                  <MovieCard title={movie.title} genres={movie.genres} year={movie.year} posterUrl={movie.posterUrl} />
                  {isWatched && (
                    <div className="absolute top-2 right-2 bg-cyan-600 text-white rounded-full p-1 shadow-md" title="Watched">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : selectedSeries ? (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-3">
            <h2 className="text-2xl font-bold text-cyan-400">
              {selectedSeries.name} Collection <span className="text-xs font-normal text-slate-400 ml-2">({selectedSeries.movies.length} movies)</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-6">
            {selectedSeries.movies.map((movie, index) => {
              const isWatched = watchedPaths.includes(movie.filePath);
              return (
                <div key={`series-view-${index}`} onClick={() => setActiveMovieDetail(movie)} className="cursor-pointer transition-transform hover:scale-105 relative">
                  <MovieCard title={movie.title} genres={movie.genres} year={movie.year} posterUrl={movie.posterUrl} />
                  {isWatched && (
                    <div className="absolute top-2 right-2 bg-cyan-600 text-white rounded-full p-1 shadow-md" title="Watched">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : selectedShow ? (
        /* DEDICATED TV SHOW VIEW */
        <section className="mb-10">
          <div className="relative h-72 w-full rounded-2xl overflow-hidden mb-8 border border-slate-800 bg-slate-900 shadow-2xl">
            <img 
              src={selectedShow.showBackdrop || selectedShow.showPoster} 
              alt={selectedShow.showTitle}
              className="w-full h-full object-cover opacity-40 object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-6 left-8 flex items-end gap-6">
              <img 
                src={selectedShow.showPoster} 
                alt={selectedShow.showTitle}
                className="w-28 h-40 object-cover rounded-xl border border-slate-700 shadow-2xl flex-shrink-0"
              />
              <div>
                <h2 className="text-3xl font-black text-white">{selectedShow.showTitle}</h2>
                <p className="text-xs text-cyan-400 font-medium mt-1">
                  ★ {selectedShow.rating.toFixed(1)} • {selectedShow.seasons.length} Seasons
                </p>
              </div>
            </div>
          </div>

          {/* Season Tabs */}
          <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2 border-b border-slate-800">
            {selectedShow.seasons.map((seasonNum) => (
              <button
                key={`season-tab-${seasonNum}`}
                onClick={() => setActiveSeason(seasonNum)}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                  activeSeason === seasonNum
                    ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/20'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                Season {seasonNum}
              </button>
            ))}
          </div>

          {/* Episode Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {selectedShow.episodes
              .filter(ep => ep.seasonNumber === activeSeason)
              .sort((a, b) => a.episodeNumber - b.episodeNumber)
              .map((ep) => {
                const isWatched = watchedPaths.includes(ep.filePath);
                return (
                  <div key={ep.filePath} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col justify-between">
                    <div>
                      <div className="h-40 w-full bg-slate-950 relative">
                        <img 
                          src={ep.stillUrl || selectedShow.showBackdrop || "https://via.placeholder.com/400x225?text=No+Thumbnail"} 
                          alt={ep.episodeName}
                          className="w-full h-full object-cover"
                        />
                        {isWatched && (
                          <div className="absolute top-2 right-2 bg-cyan-600 text-white rounded-full p-1 shadow-md" title="Watched">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h4 className="text-sm font-bold text-slate-100 truncate">
                          E{ep.episodeNumber < 10 ? `0${ep.episodeNumber}` : ep.episodeNumber} - {ep.episodeName}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {ep.overview}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 pt-0">
                      <button
                        onClick={() => handlePlayEpisode(ep, selectedShow)}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        Watch Episode
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ) : (
        <>
          {/* MAIN DASHBOARD */}
          
          {/* 1. Most Recently Watched */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-2 text-cyan-400 border-b border-slate-800 pb-2">Most Recently Watched</h2>
            <p className="text-xs text-slate-400 mb-4">Quickly resume media files you have recently opened.</p>
            {recentMovies.length > 0 ? (
              <div className="flex flex-wrap gap-6">
                {recentMovies.map((movie, index) => {
                  const isWatched = watchedPaths.includes(movie.filePath);
                  return (
                    <div key={`recent-${index}`} onClick={() => {
                      if (movie.type === 'tv') {
                        const parentShow = tvShows.find(s => s.showTitle === movie.showTitle);
                        if (parentShow) handleOpenShow(parentShow);
                      } else {
                        setActiveMovieDetail(movie);
                      }
                    }} className="cursor-pointer transition-transform hover:scale-105 relative">
                      {movie.type === 'tv' ? (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg w-48 flex flex-col">
                          <div className="h-64 w-full bg-slate-950 relative">
                            <img src={movie.stillUrl || movie.showPoster} alt={movie.episodeName} className="w-full h-full object-cover" />
                          </div>
                          <div className="p-3 bg-slate-900 text-center">
                            <h3 className="text-sm font-bold text-slate-100 truncate">{movie.showTitle}</h3>
                            <p className="text-xs text-cyan-400 mt-0.5">S{movie.seasonNumber} E{movie.episodeNumber}</p>
                          </div>
                        </div>
                      ) : (
                        <MovieCard title={movie.title} genres={movie.genres} year={movie.year} posterUrl={movie.posterUrl} />
                      )}
                      {isWatched && (
                        <div className="absolute top-2 right-2 bg-cyan-600 text-white rounded-full p-1 shadow-md" title="Watched">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-900/50 border border-slate-800/60 rounded-lg p-6 text-slate-400 text-sm italic">
                No recently watched media yet. Click any movie or episode below to view details and watch it!
              </div>
            )}
          </section>

          {/* 2. RECENTLY ADDED MEDIA */}
          {recentlyAddedMedia.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400 border-b border-slate-800 pb-2">Recently Added</h2>
              <p className="text-xs text-slate-400 mb-4">Newly detected movies and TV shows added to your library.</p>
              <div className="flex flex-wrap gap-6">
                {recentlyAddedMedia.map((item, index) => {
                  if (item.type === 'tv_summary') {
                    return (
                      <div
                        key={`recently-added-tv-${index}`}
                        onClick={() => {
                          const parentShow = tvShows.find(s => s.showTitle === item.showTitle);
                          if (parentShow) handleOpenShow(parentShow);
                        }}
                        className="cursor-pointer transition-transform hover:scale-105 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg w-48 flex flex-col"
                      >
                        <div className="h-64 w-full bg-slate-950 relative">
                          <img 
                            src={item.showPoster || "https://via.placeholder.com/200x300?text=TV+Show"} 
                            alt={item.showTitle}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                        </div>
                        <div className="p-3 bg-slate-900 text-center">
                          <h3 className="text-sm font-bold text-slate-100 truncate">{item.showTitle}</h3>
                          <p className="text-xs text-cyan-400 font-medium mt-0.5">TV Series</p>
                        </div>
                      </div>
                    );
                  } else {
                    const isWatched = watchedPaths.includes(item.filePath);
                    return (
                      <div key={`recently-added-movie-${index}`} onClick={() => setActiveMovieDetail(item)} className="cursor-pointer transition-transform hover:scale-105 relative">
                        <MovieCard title={item.title} genres={item.genres} year={item.year} posterUrl={item.posterUrl} />
                        {isWatched && (
                          <div className="absolute top-2 right-2 bg-cyan-600 text-white rounded-full p-1 shadow-md" title="Watched">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                          </div>
                        )}
                      </div>
                    );
                  }
                })}
              </div>
            </section>
          )}

          {/* 3. TV Shows Row */}
          {tvShows.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400 border-b border-slate-800 pb-2">TV Shows</h2>
              <p className="text-xs text-slate-400 mb-4">Explore your television series library.</p>
              <div className="flex flex-wrap gap-6">
                {tvShows.map((show) => (
                  <div
                    key={show.showTitle}
                    onClick={() => handleOpenShow(show)}
                    className="cursor-pointer transition-transform hover:scale-105 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg w-48 flex flex-col"
                  >
                    <div className="h-64 w-full bg-slate-950 relative">
                      <img 
                        src={show.showPoster || "https://via.placeholder.com/200x300?text=TV+Show"} 
                        alt={show.showTitle}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                    </div>
                    <div className="p-3 bg-slate-900 text-center">
                      <h3 className="text-sm font-bold text-slate-100 truncate">{show.showTitle}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{show.seasons.length} Seasons</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4. Movie Series / Collections */}
          {allSeries.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400 border-b border-slate-800 pb-2">Movie Series</h2>
              <p className="text-xs text-slate-400 mb-4">Explore related movie collections and franchises in chronological order.</p>
              <div className="flex flex-wrap gap-6">
                {allSeries.map((series) => (
                  <div
                    key={series.name}
                    onClick={() => handleOpenSeries(series)}
                    className="cursor-pointer transition-transform hover:scale-105 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg w-48 flex flex-col"
                  >
                    <div className="h-64 w-full bg-slate-950 relative">
                      <img 
                        src={series.posterUrl || "https://via.placeholder.com/200x300?text=Series"} 
                        alt={series.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                    </div>
                    <div className="p-3 bg-slate-900 text-center">
                      <h3 className="text-sm font-bold text-slate-100 truncate">{series.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{series.movies.length} movies</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5. Categories / Genres */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-2 text-cyan-400 border-b border-slate-800 pb-2">Categories</h2>
            <p className="text-xs text-slate-400 mb-4">Browse your library by genre.</p>
            {allGenres.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {allGenres.map((genre) => (
                  <div
                    key={genre}
                    onClick={() => handleOpenGenre(genre)}
                    className="bg-slate-900 hover:bg-cyan-500 hover:text-slate-950 border border-slate-800 hover:border-cyan-400 px-5 py-3 rounded-xl cursor-pointer transition-all duration-200 text-sm font-semibold text-slate-200 shadow-md flex items-center justify-center min-w-[120px]"
                  >
                    {genre}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400 text-sm italic">Scanning library genres...</div>
            )}
          </section>
        </>
      )}

      {/* FLOATING "UP NEXT" QUICK CONTINUATION BANNER */}
      {upNextEpisode && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-cyan-500/50 p-4 rounded-2xl shadow-2xl max-w-sm flex items-center gap-4 animate-fade-in">
          <img 
            src={upNextEpisode.stillUrl || upNextEpisode.showPoster} 
            alt="Next Episode" 
            className="w-20 h-14 object-cover rounded-lg border border-slate-800 flex-shrink-0"
          />
          <div className="overflow-hidden">
            <p className="text-[10px] uppercase tracking-wider font-bold text-cyan-400">Up Next</p>
            <h5 className="text-xs font-bold text-white truncate">
              S{upNextEpisode.seasonNumber}E{upNextEpisode.episodeNumber} - {upNextEpisode.episodeName}
            </h5>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => {
                  const next = upNextEpisode;
                  setUpNextEpisode(null);
                  const parentShow = tvShows.find(s => s.showTitle === next.showTitle);
                  handlePlayEpisode(next, parentShow);
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1 rounded-md text-xs font-semibold shadow transition-colors cursor-pointer"
              >
                Play Next
              </button>
              <button
                onClick={() => setUpNextEpisode(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOVIE DETAILS MODAL */}
      {activeMovieDetail && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col min-h-[600px] max-h-[90vh]">
            <div className="relative h-90 w-full bg-slate-950 flex-shrink-0">
              <img 
                src={activeMovieDetail.backdropUrl || activeMovieDetail.posterUrl || "https://via.placeholder.com/600x400?text=No+Backdrop"} 
                alt={activeMovieDetail.title} 
                className="w-full h-full object-cover object-top opacity-70"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
              <button 
                onClick={() => setActiveMovieDetail(null)}
                className="absolute top-4 right-4 bg-slate-950/80 hover:bg-slate-800 text-white rounded-full p-2 transition-colors border border-slate-700 shadow-lg cursor-pointer"
              >
                ✕
              </button>
              <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-100 drop-shadow-md">{activeMovieDetail.title}</h2>
                  <p className="text-xs text-cyan-400 font-medium mt-1">
                    {activeMovieDetail.year} • {(activeMovieDetail.genres || []).join(', ')} {activeMovieDetail.rating ? `• ★ ${activeMovieDetail.rating.toFixed(1)}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-grow">
              <div>
                <h4 className="text-xs font-bold tracking-wider text-slate-400 uppercase mb-2">Overview</h4>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {activeMovieDetail.overview || "No description available for this movie."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-950/60 border-t border-slate-800 flex-shrink-0">
              <button 
                onClick={() => setActiveMovieDetail(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  handlePlayMovie(activeMovieDetail);
                  setActiveMovieDetail(null);
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-lg flex items-center gap-2 cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                Watch Movie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-100">UniMedia Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Media Directory Path</label>
                <p className="text-xs text-slate-400 mb-3">Select the folder where your movies and TV shows are stored.</p>
                <div className="flex items-center gap-3">
                  <input 
                    type="text" 
                    readOnly 
                    value={movieFolderPath || "No folder selected..."}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none truncate"
                  />
                  <button onClick={handleSelectFolder} className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium px-4 py-2.5 rounded-lg text-sm transition-colors flex-shrink-0 shadow-md cursor-pointer">
                    Browse...
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Custom Video Player (Optional)</label>
                <p className="text-xs text-slate-400 mb-3">Select an executable (e.g. VLC) to play media. Leave empty to use system default.</p>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <input 
                      type="text" 
                      readOnly 
                      value={playerPath || "Using default system player..."}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none truncate"
                    />
                    <button onClick={handleSelectPlayer} className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium px-4 py-2.5 rounded-lg text-sm transition-colors flex-shrink-0 shadow-md cursor-pointer">
                      Browse...
                    </button>
                  </div>

                  <button 
                    onClick={handleOpenDefaultApps} 
                    className="w-full bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 hover:border-cyan-500/50 font-medium px-4 py-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    Open Windows Default Apps Settings
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-950/50 border-t border-slate-800">
              <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white transition-colors cursor-pointer">Cancel</button>
              <button onClick={handleSaveAndRefresh} className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors shadow-lg cursor-pointer">Save & Refresh Library</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}