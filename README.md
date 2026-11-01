# UniMedia 🎬

UniMedia is a modern, fast, and lightweight desktop local media manager built with **Electron**, **React**, and **Node.js**. It automatically scans your local media folders, fetches rich metadata and artwork via the TMDb API, and lets you organize and stream your personal movie and TV show library seamlessly.

---

## ✨ Features

- **Deep Recursive Scanner:** Automatically indexes movie and TV show folders while intelligently ignoring extras, featurettes, and sample folders.
- **Smart TV Show Grouping:** Automatically groups episodes by show title with dynamic season selectors and episode overview thumbnails.
- **TMDb Metadata Integration:** Fetches high-resolution posters, backdrops, ratings, synopses, release dates, and genres via the TMDb API.
- **Movie Collections:** Groups movie franchises and multi-part series chronologically (showing only collections with 2 or more titles).
- **Instant Local Caching:** Saves your scanned library locally (`library.json`) for instant, zero-delay app startup.
- **Watch History & "Up Next":** Tracks watched media with checkmark badges and prompts a floating "Up Next" banner to play consecutive TV episodes seamlessly.
- **Custom Player Integration:** Play media via your system's default video player or configure a custom executable path (e.g., VLC).
- **Library Search & Filtering:** Quick global search across all titles, genre categorization, and an "All Movies" catalog view.

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone (https://github.com/ItsRenar/unimedia.git)
   cd unimedia
    ```
2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
    ```bash
    # Create a .env file in the root directory and add your TMDb API key:
    TMDB_API_KEY=your_tmdb_api_key_here
    ```

4.  **Launch Development Mode**
    ```bash
    npm run dev
    ```