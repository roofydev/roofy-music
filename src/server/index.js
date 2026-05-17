const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const { randomUUID, createHash } = require("crypto");

const ROOT = path.resolve(__dirname, "../..");
const PUBLIC_DIR = path.join(ROOT, "public");
const APP_DATA_DIR = path.join(ROOT, "app-data");
const DB_PATH = path.join(APP_DATA_DIR, "library.db.json");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4787);

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".opus",
  ".ogg",
  ".oga",
  ".m4a",
  ".aac",
  ".wav",
  ".alac",
  ".aiff",
  ".wma"
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".opus": "audio/ogg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav"
};

let activeImport = null;
let scanState = {
  active: false,
  startedAt: null,
  finishedAt: null,
  message: "Idle"
};

function defaultLibraryPath() {
  return path.join(os.homedir(), "Music", "Roofy Music");
}

function emptyDb() {
  const now = new Date().toISOString();
  return {
    version: 1,
    settings: {
      libraryPath: defaultLibraryPath(),
      createdAt: now,
      updatedAt: now
    },
    tracks: [],
    playlists: [],
    imports: []
  };
}

function ensureAppData() {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    writeDb(emptyDb());
  }
}

function readDb() {
  ensureAppData();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (error) {
    const backup = `${DB_PATH}.${Date.now()}.broken`;
    fs.copyFileSync(DB_PATH, backup);
    const db = emptyDb();
    db.recoveredFrom = backup;
    writeDb(db);
    return db;
  }
}

function writeDb(db) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(tmp, DB_PATH);
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function text(res, status, message) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

function notFound(res) {
  json(res, 404, { error: "Not found" });
}

function normalizeString(value) {
  return String(value || "").trim();
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

function normalizeImportInput(input) {
  const value = normalizeString(input);
  if (!value) return "";
  return isUrl(value) ? value : `ytsearch1:${value}`;
}

function sanitizePathSegment(value, fallback) {
  return normalizeString(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120) || fallback;
}

function idForPath(filePath) {
  return createHash("sha1").update(path.resolve(filePath).toLowerCase()).digest("hex");
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 4000 });
  return !result.error && result.status === 0;
}

function runJsonCommand(command, args, timeout = 30000) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout
  });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} exited ${result.status}`).trim());
  }
  return JSON.parse(result.stdout);
}

function readMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const fallback = metadataFromPath(filePath);
  let probe = null;

  if (commandExists("ffprobe")) {
    try {
      probe = runJsonCommand("ffprobe", [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        filePath
      ], 15000);
    } catch (_error) {
      probe = null;
    }
  }

  const tags = (probe && probe.format && probe.format.tags) || {};
  const duration = probe && probe.format && probe.format.duration
    ? Number(probe.format.duration)
    : null;

  return {
    id: idForPath(filePath),
    path: filePath,
    title: normalizeString(tags.title) || fallback.title,
    artist: normalizeString(tags.artist) || normalizeString(tags.ARTIST) || fallback.artist,
    album: normalizeString(tags.album) || normalizeString(tags.ALBUM) || fallback.album,
    albumArtist: normalizeString(tags.album_artist) || normalizeString(tags.albumartist) || normalizeString(tags.ALBUMARTIST) || normalizeString(tags.artist) || fallback.artist,
    genre: normalizeString(tags.genre) || "",
    year: normalizeString(tags.date || tags.year).slice(0, 4),
    trackNumber: normalizeString(tags.track || tags.TRACKNUMBER),
    discNumber: normalizeString(tags.disc || tags.DISCNUMBER),
    duration,
    ext,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    addedAt: new Date(stat.birthtimeMs || stat.ctimeMs || Date.now()).toISOString(),
    updatedAt: new Date().toISOString(),
    sourceUrl: normalizeString(tags.comment).startsWith("http") ? normalizeString(tags.comment) : ""
  };
}

function metadataFromPath(filePath) {
  const parts = path.normalize(filePath).split(path.sep);
  const file = path.basename(filePath, path.extname(filePath));
  const title = file.replace(/^\d+[\s._-]+/, "").replace(/\s+/g, " ").trim();
  const album = parts.length >= 2 ? parts[parts.length - 2] : "Unknown Album";
  const artist = parts.length >= 3 ? parts[parts.length - 3] : "Unknown Artist";
  return {
    title: title || "Untitled",
    album: album || "Unknown Album",
    artist: artist || "Unknown Artist"
  };
}

async function walkAudioFiles(dir, found = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (_error) {
    return found;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.isDirectory()) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAudioFiles(fullPath, found);
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      found.push(fullPath);
    }
  }

  return found;
}

async function scanLibrary() {
  if (scanState.active) return scanState;

  scanState = {
    active: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: "Scanning library"
  };

  try {
    const db = readDb();
    const libraryPath = path.resolve(db.settings.libraryPath || defaultLibraryPath());
    await fsp.mkdir(libraryPath, { recursive: true });
    const files = await walkAudioFiles(libraryPath);
    const previous = new Map(db.tracks.map((track) => [path.resolve(track.path).toLowerCase(), track]));
    const tracks = [];

    for (const file of files) {
      const key = path.resolve(file).toLowerCase();
      const stat = fs.statSync(file);
      const existing = previous.get(key);
      if (existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) {
        tracks.push(existing);
      } else {
        tracks.push(readMetadata(file));
      }
    }

    tracks.sort((a, b) => {
      const artist = a.artist.localeCompare(b.artist);
      if (artist) return artist;
      const album = a.album.localeCompare(b.album);
      if (album) return album;
      return a.title.localeCompare(b.title);
    });

    db.tracks = tracks;
    db.settings.updatedAt = new Date().toISOString();
    writeDb(db);

    scanState = {
      active: false,
      startedAt: scanState.startedAt,
      finishedAt: new Date().toISOString(),
      message: `Indexed ${tracks.length} tracks`
    };
  } catch (error) {
    scanState = {
      active: false,
      startedAt: scanState.startedAt,
      finishedAt: new Date().toISOString(),
      message: error.message
    };
  }

  return scanState;
}

function publicTrack(track) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    genre: track.genre,
    year: track.year,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    duration: track.duration,
    ext: track.ext,
    size: track.size,
    addedAt: track.addedAt,
    updatedAt: track.updatedAt,
    sourceUrl: track.sourceUrl
  };
}

function groupByAlbum(tracks) {
  const map = new Map();
  for (const track of tracks) {
    const key = `${track.albumArtist || track.artist}\u0000${track.album}`;
    if (!map.has(key)) {
      map.set(key, {
        id: createHash("sha1").update(key).digest("hex"),
        title: track.album || "Unknown Album",
        artist: track.albumArtist || track.artist || "Unknown Artist",
        year: track.year || "",
        tracks: []
      });
    }
    map.get(key).tracks.push(publicTrack(track));
  }
  return [...map.values()].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
}

function groupByArtist(tracks) {
  const map = new Map();
  for (const track of tracks) {
    const name = track.albumArtist || track.artist || "Unknown Artist";
    if (!map.has(name)) {
      map.set(name, { id: createHash("sha1").update(name).digest("hex"), name, trackCount: 0, albums: new Set() });
    }
    const artist = map.get(name);
    artist.trackCount += 1;
    artist.albums.add(track.album || "Unknown Album");
  }
  return [...map.values()]
    .map((artist) => ({ ...artist, albumCount: artist.albums.size, albums: undefined }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function getTrackById(id) {
  const db = readDb();
  return db.tracks.find((track) => track.id === id);
}

function streamTrack(req, res, id) {
  const track = getTrackById(id);
  if (!track || !fs.existsSync(track.path)) {
    return text(res, 404, "Track not found");
  }

  const stat = fs.statSync(track.path);
  const range = req.headers.range;
  const ext = path.extname(track.path).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  if (!range) {
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": stat.size,
      "accept-ranges": "bytes"
    });
    fs.createReadStream(track.path).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416, { "content-range": `bytes */${stat.size}` });
    res.end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stat.size - 1;
  if (start >= stat.size || end >= stat.size || start > end) {
    res.writeHead(416, { "content-range": `bytes */${stat.size}` });
    res.end();
    return;
  }

  res.writeHead(206, {
    "content-type": contentType,
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${stat.size}`,
    "accept-ranges": "bytes"
  });
  fs.createReadStream(track.path, { start, end }).pipe(res);
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(PUBLIC_DIR, `.${decodeURIComponent(requested)}`);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return text(res, 404, "Not found");
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function importerPreview(input, playlist) {
  if (!commandExists("yt-dlp")) {
    throw new Error("yt-dlp was not found on PATH. Install yt-dlp or configure a bundled binary.");
  }

  const normalized = normalizeImportInput(input);
  if (!normalized) throw new Error("Enter a URL or search query.");

  const args = [
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    playlist ? "--yes-playlist" : "--no-playlist",
    normalized
  ];

  const data = runJsonCommand("yt-dlp", args, 45000);
  const entries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [data];
  const first = entries[0] || data;
  const isPlaylistResult = Boolean(data.entries);

  return {
    input,
    normalizedInput: normalized,
    isPlaylist: isPlaylistResult,
    count: entries.length,
    title: (isPlaylistResult ? data.title : first.title) || data.title || "Untitled",
    uploader: first.uploader || first.channel || data.uploader || data.channel || "Unknown",
    duration: first.duration || null,
    thumbnail: first.thumbnail || data.thumbnail || "",
    webpageUrl: first.webpage_url || data.webpage_url || (isUrl(input) ? input : ""),
    formats: summarizeFormats(first.formats || [])
  };
}

function summarizeFormats(formats) {
  return formats
    .filter((format) => format.acodec && format.acodec !== "none")
    .slice(0, 20)
    .map((format) => ({
      id: format.format_id,
      ext: format.ext,
      audioCodec: format.acodec,
      abr: format.abr || null,
      filesize: format.filesize || format.filesize_approx || null,
      note: format.format_note || ""
    }));
}

function enqueueImport(payload) {
  const db = readDb();
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    input: normalizeString(payload.input),
    normalizedInput: normalizeImportInput(payload.input),
    audioFormat: normalizeString(payload.audioFormat) || "best",
    audioQuality: normalizeString(payload.audioQuality) || "0",
    playlist: Boolean(payload.playlist),
    status: "queued",
    progress: 0,
    message: "Queued",
    outputPath: "",
    createdAt: now,
    updatedAt: now,
    error: ""
  };

  if (!job.normalizedInput) throw new Error("Enter a URL or search query.");
  db.imports.unshift(job);
  writeDb(db);
  processImportQueue();
  return job;
}

function updateJob(id, patch) {
  const db = readDb();
  const job = db.imports.find((item) => item.id === id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  writeDb(db);
  return job;
}

function nextQueuedJob() {
  const db = readDb();
  return db.imports.slice().reverse().find((job) => job.status === "queued" || job.status === "retrying");
}

function processImportQueue() {
  if (activeImport) return;
  const job = nextQueuedJob();
  if (!job) return;
  runImport(job).catch(() => {
    activeImport = null;
    processImportQueue();
  });
}

async function runImport(job) {
  if (!commandExists("yt-dlp")) {
    updateJob(job.id, { status: "failed", error: "yt-dlp was not found on PATH.", message: "yt-dlp missing" });
    return;
  }

  const db = readDb();
  const libraryPath = path.resolve(db.settings.libraryPath || defaultLibraryPath());
  await fsp.mkdir(libraryPath, { recursive: true });

  const outputTemplate = path.join(
    libraryPath,
    "Downloads",
    "%(uploader|Unknown Artist)s",
    "%(title).200B [%(id)s].%(ext)s"
  );

  const args = [
    "--newline",
    "--progress",
    "--extract-audio",
    "--embed-thumbnail",
    "--convert-thumbnails",
    "jpg",
    "--add-metadata",
    "--no-mtime",
    job.playlist ? "--yes-playlist" : "--no-playlist",
    "-o",
    outputTemplate
  ];

  if (job.audioFormat && job.audioFormat !== "best") {
    args.push("--audio-format", job.audioFormat);
  }
  if (job.audioQuality && job.audioQuality !== "best") {
    args.push("--audio-quality", job.audioQuality);
  }

  args.push(job.normalizedInput);

  updateJob(job.id, { status: "running", progress: 1, message: "Starting download", error: "" });

  await new Promise((resolve) => {
    const child = spawn("yt-dlp", args, {
      cwd: libraryPath,
      windowsHide: true
    });
    activeImport = { id: job.id, child };

    const handleLine = (line) => {
      const clean = line.toString().trim();
      if (!clean) return;

      const percent = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(clean);
      if (percent) {
        updateJob(job.id, {
          progress: Math.min(99, Math.max(1, Number(percent[1]))),
          message: clean
        });
        return;
      }

      const destination = /\[download\]\s+Destination:\s+(.+)$/.exec(clean);
      if (destination) {
        updateJob(job.id, { outputPath: destination[1], message: clean });
        return;
      }

      if (clean.includes("[ExtractAudio]") || clean.includes("[Metadata]") || clean.includes("[EmbedThumbnail]")) {
        updateJob(job.id, { message: clean });
      }
    };

    child.stdout.on("data", (chunk) => chunk.toString().split(/\r?\n/).forEach(handleLine));
    child.stderr.on("data", (chunk) => chunk.toString().split(/\r?\n/).forEach(handleLine));

    child.on("close", async (code) => {
      activeImport = null;
      if (code === 0) {
        updateJob(job.id, { status: "completed", progress: 100, message: "Import complete" });
        await scanLibrary();
      } else {
        const current = readDb().imports.find((item) => item.id === job.id);
        if (current && current.status === "cancelled") {
          updateJob(job.id, { message: "Cancelled" });
        } else {
          updateJob(job.id, { status: "failed", error: `yt-dlp exited with code ${code}`, message: "Import failed" });
        }
      }
      processImportQueue();
      resolve();
    });

    child.on("error", (error) => {
      activeImport = null;
      updateJob(job.id, { status: "failed", error: error.message, message: "Import failed" });
      processImportQueue();
      resolve();
    });
  });
}

function cancelImport(id) {
  const job = updateJob(id, { status: "cancelled", message: "Cancelling" });
  if (activeImport && activeImport.id === id) {
    activeImport.child.kill();
  }
  return job;
}

function retryImport(id) {
  const job = updateJob(id, {
    status: "queued",
    progress: 0,
    message: "Queued for retry",
    error: ""
  });
  processImportQueue();
  return job;
}

async function handleApi(req, res, url) {
  try {
    const db = readDb();

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        scan: scanState,
        tools: {
          ytDlp: commandExists("yt-dlp"),
          ffmpeg: commandExists("ffmpeg"),
          ffprobe: commandExists("ffprobe")
        }
      });
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, { settings: db.settings, scan: scanState });
    }

    if (req.method === "POST" && url.pathname === "/api/config") {
      const body = await readBody(req);
      const libraryPath = path.resolve(normalizeString(body.libraryPath) || defaultLibraryPath());
      await fsp.mkdir(libraryPath, { recursive: true });
      db.settings.libraryPath = libraryPath;
      db.settings.updatedAt = new Date().toISOString();
      writeDb(db);
      return json(res, 200, { settings: db.settings });
    }

    if (req.method === "POST" && url.pathname === "/api/scan") {
      scanLibrary();
      return json(res, 202, { scan: scanState });
    }

    if (req.method === "GET" && url.pathname === "/api/tracks") {
      const q = normalizeString(url.searchParams.get("q")).toLowerCase();
      const tracks = db.tracks.filter((track) => {
        if (!q) return true;
        return [track.title, track.artist, track.album, track.genre, track.path]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
      return json(res, 200, { tracks: tracks.map(publicTrack), total: db.tracks.length });
    }

    if (req.method === "GET" && url.pathname === "/api/albums") {
      return json(res, 200, { albums: groupByAlbum(db.tracks) });
    }

    if (req.method === "GET" && url.pathname === "/api/artists") {
      return json(res, 200, { artists: groupByArtist(db.tracks) });
    }

    if (req.method === "GET" && url.pathname === "/api/playlists") {
      return json(res, 200, { playlists: db.playlists });
    }

    if (req.method === "POST" && url.pathname === "/api/playlists") {
      const body = await readBody(req);
      const now = new Date().toISOString();
      const playlist = {
        id: randomUUID(),
        name: normalizeString(body.name) || "New Playlist",
        trackIds: Array.isArray(body.trackIds) ? body.trackIds : [],
        createdAt: now,
        updatedAt: now
      };
      db.playlists.unshift(playlist);
      writeDb(db);
      return json(res, 201, { playlist });
    }

    const playlistMatch = /^\/api\/playlists\/([^/]+)$/.exec(url.pathname);
    if (playlistMatch && req.method === "PUT") {
      const body = await readBody(req);
      const playlist = db.playlists.find((item) => item.id === playlistMatch[1]);
      if (!playlist) return notFound(res);
      if (body.name !== undefined) playlist.name = normalizeString(body.name) || playlist.name;
      if (Array.isArray(body.trackIds)) playlist.trackIds = body.trackIds;
      playlist.updatedAt = new Date().toISOString();
      writeDb(db);
      return json(res, 200, { playlist });
    }

    if (playlistMatch && req.method === "DELETE") {
      db.playlists = db.playlists.filter((item) => item.id !== playlistMatch[1]);
      writeDb(db);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/import/preview") {
      const body = await readBody(req);
      return json(res, 200, { preview: importerPreview(body.input, body.playlist) });
    }

    if (req.method === "GET" && url.pathname === "/api/import/jobs") {
      return json(res, 200, { jobs: db.imports });
    }

    if (req.method === "POST" && url.pathname === "/api/import/jobs") {
      const body = await readBody(req);
      return json(res, 201, { job: enqueueImport(body) });
    }

    const importMatch = /^\/api\/import\/jobs\/([^/]+)\/(cancel|retry)$/.exec(url.pathname);
    if (importMatch && req.method === "POST") {
      const job = importMatch[2] === "cancel" ? cancelImport(importMatch[1]) : retryImport(importMatch[1]);
      if (!job) return notFound(res);
      return json(res, 200, { job });
    }

    return notFound(res);
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
}

function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }

  const mediaMatch = /^\/media\/([^/]+)$/.exec(url.pathname);
  if (mediaMatch) {
    streamTrack(req, res, mediaMatch[1]);
    return;
  }

  serveStatic(req, res, url.pathname);
}

async function main() {
  ensureAppData();
  const db = readDb();
  await fsp.mkdir(db.settings.libraryPath || defaultLibraryPath(), { recursive: true });

  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => {
    console.log(`Roofy Music running at http://${HOST}:${PORT}`);
    console.log(`Library: ${readDb().settings.libraryPath}`);
    console.log("Optional tools:", {
      ytDlp: commandExists("yt-dlp"),
      ffmpeg: commandExists("ffmpeg"),
      ffprobe: commandExists("ffprobe")
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
