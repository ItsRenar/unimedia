import React  from 'react'

export default function MovieCard({ title, genres = [], year, posterUrl }) {
  return (
    <div className="bg-slate-900 rounded-lg overflow-hidden shadow-xl w-48 flex flex-col border border-slate-800 flex-shrink-0">
      {/* Poster Container */}
      <div className="h-72 w-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
        {posterUrl ? (
          <img 
            src={posterUrl} 
            alt={title} 
            className="absolute inset-0 w-full h-full object-cover" 
          />
        ) : (
          <span className="text-slate-500 text-xs text-center p-2">No Poster Available</span>
        )}
      </div>

      {/* Movie Info */}
      <div className="p-3 flex flex-col justify-between flex-grow bg-slate-900 text-white">
        <h3 className="font-semibold text-sm truncate" title={title}>
          {title}
        </h3>
        <div className="mt-3 flex items-center justify-between text-xs">
          {/* Container for Genre Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {genres.map((g, idx) => (
              <span key={idx} className="bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800/50">
                {g}
              </span>
            ))}
          </div>
          <span className="text-slate-400">{year}</span>
        </div>
      </div>
    </div>
  )
}