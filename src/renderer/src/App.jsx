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
  const [showAllMovies, setShowAllMovies] = useState(false)
  const [activeMovieDetail, setActiveMovieDetail] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [movieFolderPath, setMovieFolderPath] = useState('')
  const [playerPath, setPlayerPath] = useState('')
  const [upNextEpisode, setUpNextEpisode] = useState(null)
  const [watchedPaths, setWatchedPaths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('unimedia_watched')) || [] } catch { return [] }
  })

  const searchRef = useRef(null)

  useEffect(() => {
    if (window.api.getCachedLibrary) {
      window.api.getCachedLibrary().then(c => {
        if (c?.movies?.length || c?.tvShows?.length) { setMovies(c.movies || []); setRawTvShows(c.tvShows || []) }
      }).catch(console.error)
    }

    window.api.scanMovies().then(d => { setMovies(d.movies || []); setRawTvShows(d.tvShows || []) }).catch(console.error)
    window.api.getMovieFolder?.().then(p => p && setMovieFolderPath(p)).catch(() => {})
    window.api.getPlayerPath?.().then(p => p && setPlayerPath(p)).catch(() => {})

    const handleClickOutside = (e) => searchRef.current && !searchRef.current.contains(e.target) && setIsSearchFocused(false)
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Derived TV Show Data Structure
  const tvShowsMap = {}
  rawTvShows.forEach(item => {
    if (!tvShowsMap[item.showTitle]) {
      tvShowsMap[item.showTitle] = { ...item, seasonsSet: new Set(), episodes: [] }
    }
    tvShowsMap[item.showTitle].seasonsSet.add(item.seasonNumber)
    tvShowsMap[item.showTitle].episodes.push(item)
  })
  const tvShows = Object.values(tvShowsMap).map(s => ({ ...s, seasons: Array.from(s.seasonsSet).sort((a, b) => a - b) }))

  // Derived Movie Collections & Genres (Only keep collections with 2 or more movies)
  const seriesMap = {}
  movies.forEach(m => {
    if (m.collectionName) {
      if (!seriesMap[m.collectionName]) seriesMap[m.collectionName] = { name: m.collectionName, posterUrl: m.posterUrl, movies: [] }
      seriesMap[m.collectionName].movies.push(m)
    }
  })
  const allSeries = Object.values(seriesMap).filter(series => series.movies.length > 1)
  const allGenres = Array.from(new Set(movies.flatMap(m => m.genres || []))).sort()

  const allMedia = [...movies, ...rawTvShows]
  const recentMovies = [...watchedPaths].reverse().map(p => allMedia.find(m => m.filePath === p)).filter(Boolean).slice(0, 10)

  // Derived Recently Added Summaries
  const tvLatestMap = {}
  rawTvShows.forEach(item => {
    if (!tvLatestMap[item.showTitle] || item.dateAdded > tvLatestMap[item.showTitle].dateAdded) {
      tvLatestMap[item.showTitle] = { type: 'tv_summary', ...item }
    }
  })
  const recentlyAddedMedia = [...movies.map(m => ({ ...m, type: 'movie' })), ...Object.values(tvLatestMap)]
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)).slice(0, 10)

  const searchResults = allMedia.filter(i => (i.title || i.showTitle || i.episodeName || '').toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
  const genreViewMovies = selectedGenre ? movies.filter(m => m.genres?.includes(selectedGenre)) : []

  const resetViews = () => { setSelectedShow(null); setSelectedGenre(null); setSelectedSeries(null); setShowAllMovies(false); setActiveMovieDetail(null); setSearchQuery('') }

  const handleOpenShow = (show) => { resetViews(); setSelectedShow(show); if (show.seasons?.length) setActiveSeason(show.seasons[0]) }
  const handleOpenSeries = (s) => { resetViews(); setSelectedSeries(s) }
  const handleOpenGenre = (g) => { resetViews(); setSelectedGenre(g) }

  const saveWatchHistory = (path) => {
    if (!watchedPaths.includes(path)) {
      const updated = [...watchedPaths, path]
      setWatchedPaths(updated)
      localStorage.setItem('unimedia_watched', JSON.stringify(updated))
    }
  }

  const handlePlayMovie = (movie) => {
    if (movie?.filePath) {
      window.api.playMovie(movie.filePath).then(() => saveWatchHistory(movie.filePath)).catch(console.error)
    }
  }

  const handlePlayEpisode = (ep, show) => {
    if (ep?.filePath) {
      window.api.playMovie(ep.filePath).then(() => {
        saveWatchHistory(ep.filePath)
        if (show?.episodes) {
          const sorted = [...show.episodes].sort((a, b) => a.seasonNumber !== b.seasonNumber ? a.seasonNumber - b.seasonNumber : a.episodeNumber - b.episodeNumber)
          const idx = sorted.findIndex(e => e.filePath === ep.filePath)
          if (idx !== -1 && idx + 1 < sorted.length) setUpNextEpisode(sorted[idx + 1])
        }
      }).catch(console.error)
    }
  }

  const handleSaveAndRefresh = async () => {
    setIsSettingsOpen(false)
    const data = await window.api.scanMovies()
    setMovies(data.movies || []); setRawTvShows(data.tvShows || [])
  }

  const renderWatchedBadge = (path) => watchedPaths.includes(path) && (
    <div className="absolute top-2 right-2 bg-cyan-600 text-white rounded-full p-1 shadow-md" title="Watched">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-white relative">
      {/* HEADER */}
      <div className="sticky top-0 z-40 bg-slate-950 -mx-8 -mt-8 px-8 pt-8 pb-4 mb-8 flex items-center justify-between border-b border-slate-900 shadow-xl">
        <div className="w-1/3 z-10">
          {(selectedGenre || selectedSeries || selectedShow || showAllMovies) && (
            <button onClick={resetViews} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-400 transition-colors shadow-sm cursor-pointer">
              ← Back to Main
            </button>
          )}
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img src={UniMediaLogo} alt="UniMedia Logo" className="h-12 w-auto cursor-pointer pointer-events-auto object-contain" onClick={resetViews} />
        </div>

        <div className="w-1/3 flex items-center justify-end gap-3 z-10">
          <div className="relative w-full max-w-xs" ref={searchRef}>
            <input 
              type="text" placeholder="Search movies & shows..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => setIsSearchFocused(true)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors shadow-lg"
            />
            {isSearchFocused && searchQuery.trim() !== '' && (
              <div className="absolute right-0 w-full mt-2 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-96 overflow-y-auto z-50">
                {searchResults.length ? searchResults.map((item, idx) => (
                  <div key={idx} onClick={() => { item.type === 'tv' || item.seasons ? handleOpenShow(item) : setActiveMovieDetail(item); setSearchQuery(''); setIsSearchFocused(false) }} className="flex items-center gap-3 p-3 hover:bg-slate-900 cursor-pointer border-b border-slate-900/50 last:border-none">
                    <img src={item.posterUrl || item.showPoster || "https://via.placeholder.com/40x60"} alt={item.title || item.showTitle} className="w-10 h-14 object-cover rounded flex-shrink-0" />
                    <div className="overflow-hidden">
                      <h4 className="text-sm font-semibold text-slate-100 truncate">{item.title || item.showTitle}</h4>
                      <p className="text-xs text-slate-400">{item.year || `${item.seasons?.length || 0} Seasons`}</p>
                    </div>
                  </div>
                )) : <div className="p-4 text-center text-slate-400 text-sm italic">No results found matching "{searchQuery}"</div>}
              </div>
            )}
          </div>

          <button onClick={() => setIsSettingsOpen(true)} className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2.5 rounded-lg text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer" title="Settings">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
      </div>

      {/* DYNAMIC VIEWS */}
      {selectedGenre || selectedSeries || showAllMovies ? (
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-cyan-400 border-b border-slate-800 pb-3 mb-6">
            {selectedGenre || (selectedSeries ? `${selectedSeries.name} Collection` : 'All Movies')}
          </h2>
          <div className="flex flex-wrap gap-6">
            {(showAllMovies ? movies : (selectedSeries ? selectedSeries.movies : genreViewMovies)).map((movie, idx) => (
              <div key={idx} onClick={() => setActiveMovieDetail(movie)} className="cursor-pointer hover:scale-105 relative transition-transform">
                <MovieCard title={movie.title} genres={movie.genres} year={movie.year} posterUrl={movie.posterUrl} />
                {renderWatchedBadge(movie.filePath)}
              </div>
            ))}
          </div>
        </section>
      ) : selectedShow ? (
        /* TV SHOW VIEW */
        <section className="mb-10">
          <div className="relative h-72 w-full rounded-2xl overflow-hidden mb-8 border border-slate-800 bg-slate-900 shadow-2xl">
            <img src={selectedShow.showBackdrop || selectedShow.showPoster} alt={selectedShow.showTitle} className="w-full h-full object-cover opacity-40 object-top" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-6 left-8 flex items-end gap-6">
              <img src={selectedShow.showPoster} alt={selectedShow.showTitle} className="w-28 h-40 object-cover rounded-xl border border-slate-700 shadow-2xl flex-shrink-0" />
              <div>
                <h2 className="text-3xl font-black text-white">{selectedShow.showTitle}</h2>
                <p className="text-xs text-cyan-400 font-medium mt-1">★ {selectedShow.rating.toFixed(1)} • {selectedShow.seasons.length} Seasons</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mb-6 overflow-x-auto border-b border-slate-800 pb-2">
            {selectedShow.seasons.map((sNum) => (
              <button key={sNum} onClick={() => setActiveSeason(sNum)} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeSeason === sNum ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>
                Season {sNum}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {selectedShow.episodes.filter(ep => ep.seasonNumber === activeSeason).sort((a, b) => a.episodeNumber - b.episodeNumber).map((ep) => (
              <div key={ep.filePath} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="h-40 bg-slate-950 relative">
                    <img src={ep.stillUrl || selectedShow.showBackdrop || "https://via.placeholder.com/400x225"} alt={ep.episodeName} className="w-full h-full object-cover" />
                    {renderWatchedBadge(ep.filePath)}
                  </div>
                  <div className="p-4">
                    <h4 className="text-sm font-bold text-slate-100 truncate">E{ep.episodeNumber < 10 ? `0${ep.episodeNumber}` : ep.episodeNumber} - {ep.episodeName}</h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ep.overview}</p>
                  </div>
                </div>
                <div className="p-4 pt-0">
                  <button onClick={() => handlePlayEpisode(ep, selectedShow)} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Watch Episode
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <>
          {/* MAIN DASHBOARD */}
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-cyan-400 border-b border-slate-800 pb-2 mb-4">Most Recently Watched</h2>
            {recentMovies.length ? (
              <div className="flex flex-wrap gap-6">
                {recentMovies.map((m, idx) => (
                  <div key={idx} onClick={() => m.type === 'tv' ? handleOpenShow(tvShows.find(s => s.showTitle === m.showTitle)) : setActiveMovieDetail(m)} className="cursor-pointer hover:scale-105 relative transition-transform">
                    {m.type === 'tv' ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden w-48 flex flex-col">
                        <div className="h-64 bg-slate-950 relative"><img src={m.stillUrl || m.showPoster} alt={m.episodeName} className="w-full h-full object-cover" /></div>
                        <div className="p-3 text-center"><h3 className="text-sm font-bold truncate">{m.showTitle}</h3><p className="text-xs text-cyan-400">S{m.seasonNumber} E{m.episodeNumber}</p></div>
                      </div>
                    ) : <MovieCard title={m.title} genres={m.genres} year={m.year} posterUrl={m.posterUrl} />}
                    {renderWatchedBadge(m.filePath)}
                  </div>
                ))}
              </div>
            ) : <div className="bg-slate-900/50 border border-slate-800/60 rounded-lg p-6 text-slate-400 text-sm italic">No recently watched media yet.</div>}
          </section>

          {recentlyAddedMedia.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-cyan-400 border-b border-slate-800 pb-2 mb-4">Recently Added</h2>
              <div className="flex flex-wrap gap-6">
                {recentlyAddedMedia.map((item, idx) => item.type === 'tv_summary' ? (
                  <div key={idx} onClick={() => handleOpenShow(tvShows.find(s => s.showTitle === item.showTitle))} className="cursor-pointer hover:scale-105 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden w-48 flex flex-col">
                    <div className="h-64 bg-slate-950 relative"><img src={item.showPoster || "https://via.placeholder.com/200x300"} alt={item.showTitle} className="w-full h-full object-cover" /></div>
                    <div className="p-3 text-center"><h3 className="text-sm font-bold truncate">{item.showTitle}</h3><p className="text-xs text-cyan-400 mt-0.5">TV Series</p></div>
                  </div>
                ) : (
                  <div key={idx} onClick={() => setActiveMovieDetail(item)} className="cursor-pointer hover:scale-105 relative transition-transform">
                    <MovieCard title={item.title} genres={item.genres} year={item.year} posterUrl={item.posterUrl} />
                    {renderWatchedBadge(item.filePath)}
                  </div>
                ))}
              </div>
            </section>
          )}

          {tvShows.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-cyan-400 border-b border-slate-800 pb-2 mb-4">TV Shows</h2>
              <div className="flex flex-wrap gap-6">
                {tvShows.map((show) => (
                  <div key={show.showTitle} onClick={() => handleOpenShow(show)} className="cursor-pointer hover:scale-105 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden w-48 flex flex-col">
                    <div className="h-64 bg-slate-950 relative"><img src={show.showPoster || "https://via.placeholder.com/200x300"} alt={show.showTitle} className="w-full h-full object-cover" /></div>
                    <div className="p-3 text-center"><h3 className="text-sm font-bold truncate">{show.showTitle}</h3><p className="text-xs text-slate-400 mt-0.5">{show.seasons.length} Seasons</p></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {allSeries.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-semibold text-cyan-400 border-b border-slate-800 pb-2 mb-4">Movie Series</h2>
              <div className="flex flex-wrap gap-6">
                {allSeries.map((series) => (
                  <div key={series.name} onClick={() => handleOpenSeries(series)} className="cursor-pointer hover:scale-105 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden w-48 flex flex-col">
                    <div className="h-64 bg-slate-950 relative"><img src={series.posterUrl || "https://via.placeholder.com/200x300"} alt={series.name} className="w-full h-full object-cover" /></div>
                    <div className="p-3 text-center"><h3 className="text-sm font-bold truncate">{series.name}</h3><p className="text-xs text-slate-400 mt-0.5">{series.movies.length} movies</p></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-10">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4">
              <h2 className="text-xl font-semibold text-cyan-400">Library Catalog</h2>
              <button onClick={() => { resetViews(); setShowAllMovies(true) }} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer">
                🎬 View All Movies ({movies.length})
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              {allGenres.map((genre) => (
                <div key={genre} onClick={() => handleOpenGenre(genre)} className="bg-slate-900 hover:bg-cyan-500 hover:text-slate-950 border border-slate-800 px-5 py-3 rounded-xl cursor-pointer text-sm font-semibold transition-all min-w-[120px] text-center">
                  {genre}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* UP NEXT BANNER */}
      {upNextEpisode && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-cyan-500/50 p-4 rounded-2xl shadow-2xl max-w-sm flex items-center gap-4">
          <img src={upNextEpisode.stillUrl || upNextEpisode.showPoster} alt="Next Episode" className="w-20 h-14 object-cover rounded-lg flex-shrink-0" />
          <div className="overflow-hidden">
            <p className="text-[10px] uppercase font-bold text-cyan-400">Up Next</p>
            <h5 className="text-xs font-bold truncate">S{upNextEpisode.seasonNumber}E{upNextEpisode.episodeNumber} - {upNextEpisode.episodeName}</h5>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => { const next = upNextEpisode; setUpNextEpisode(null); handlePlayEpisode(next, tvShows.find(s => s.showTitle === next.showTitle)) }} className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1 rounded-md text-xs font-semibold cursor-pointer">Play Next</button>
              <button onClick={() => setUpNextEpisode(null)} className="text-xs text-slate-400 hover:text-white px-2 py-1 cursor-pointer">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* MOVIE MODAL */}
      {activeMovieDetail && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col min-h-[500px]">
            <div className="relative h-72 w-full bg-slate-950 flex-shrink-0">
              <img src={activeMovieDetail.backdropUrl || activeMovieDetail.posterUrl || "https://via.placeholder.com/600x400"} alt={activeMovieDetail.title} className="w-full h-full object-cover opacity-70" />
              <button onClick={() => setActiveMovieDetail(null)} className="absolute top-4 right-4 bg-slate-950/80 hover:bg-slate-800 text-white rounded-full p-2 border border-slate-700 cursor-pointer">✕</button>
              <div className="absolute bottom-4 left-6 right-6">
                <h2 className="text-2xl font-black text-slate-100">{activeMovieDetail.title}</h2>
                <p className="text-xs text-cyan-400 font-medium mt-1">{activeMovieDetail.year} • {(activeMovieDetail.genres || []).join(', ')} {activeMovieDetail.rating ? `• ★ ${activeMovieDetail.rating.toFixed(1)}` : ''}</p>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-grow"><p className="text-sm text-slate-300 leading-relaxed">{activeMovieDetail.overview || "No description available."}</p></div>
            <div className="flex justify-end gap-3 px-6 py-4 bg-slate-950/60 border-t border-slate-800">
              <button onClick={() => setActiveMovieDetail(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white cursor-pointer">Close</button>
              <button onClick={() => { handlePlayMovie(activeMovieDetail); setActiveMovieDetail(null) }} className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-6 py-2 rounded-xl text-sm shadow-lg flex items-center gap-2 cursor-pointer">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Watch Movie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold">UniMedia Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Media Directory Path</label>
              <div className="flex gap-3">
                <input type="text" readOnly value={movieFolderPath || "No folder selected..."} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 truncate" />
                <button onClick={async () => { const f = await window.api.selectMovieFolder?.(); if (f) setMovieFolderPath(f) }} className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-lg text-sm flex-shrink-0 cursor-pointer">Browse...</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Custom Video Player (Optional)</label>
              <div className="flex gap-3">
                <input type="text" readOnly value={playerPath || "Using default system player..."} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 truncate" />
                <button onClick={async () => { const p = await window.api.selectPlayerExecutable?.(); if (p) setPlayerPath(p) }} className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-lg text-sm flex-shrink-0 cursor-pointer">Browse...</button>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white cursor-pointer">Cancel</button>
              <button onClick={handleSaveAndRefresh} className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-5 py-2 rounded-lg text-sm cursor-pointer">Save & Refresh Library</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}