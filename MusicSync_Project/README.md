# MusicSync

Listen to music together, in sync. Sign in, start a room, share the 6-character code or invite link,
and everyone in the room hears the same song at the same second. Anyone in the room can play, pause,
seek, skip, queue songs and chat.

## Requirements

- Java 17 or newer (Java 21 recommended). On macOS, if `java -version` shows something older:
  `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`
- Node.js 20 or newer

## Run it

### Development (hot reload)

```bash
npm run setup          # once: installs frontend dependencies
npm run dev:backend    # terminal 1: API + WebSocket on http://localhost:8080
npm run dev:frontend   # terminal 2: UI on http://localhost:5173
```

Open http://localhost:5173. To try it with two people on one machine, use a second browser or a
private window for the second account.

The first backend start downloads the song library (about a minute); the UI fills in as it loads.
After that it is cached in `backend/music-sync-backend/data/catalog.json` for 24 hours.

### Production (one jar)

```bash
npm run build   # builds the UI into the backend and packages the jar (runs the tests too)
npm start       # serves everything on http://localhost:8080
```

To let friends outside your network join, expose port 8080 with a tunnel (for example
`ngrok http 8080`) and share the invite link from that address. Use an HTTPS address: browsers only
allow one-tap copy and the share sheet on secure pages.

### Deploy for free (Render + Neon)

The repo has a `Dockerfile` (here) and a `render.yaml` (repository root) for a free Render web
service. Render's free disk is wiped on every restart, so accounts go in a free Neon Postgres database.

1. **Database.** Create a project at https://neon.com and open its connection details. From
   `postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require` you need three values:
   - `SPRING_DATASOURCE_URL` = `jdbc:postgresql://HOST/DBNAME?sslmode=require`
   - `SPRING_DATASOURCE_USERNAME` = `USER`
   - `SPRING_DATASOURCE_PASSWORD` = `PASSWORD`
2. **App.** Push the code to GitHub. At https://render.com choose **New → Blueprint**, pick the
   repository and branch, and enter the three values when asked. The first build takes several minutes.
3. Open the `https://<name>.onrender.com` address Render shows and share invite links from there.

Free-plan behaviour: the service sleeps after 15 minutes with nobody connected and takes about a
minute to wake, which also ends any rooms. Accounts survive because they are in Postgres.

### Tests

```bash
npm test        # frontend lint + backend unit and API tests
```

## Configuration

Set in `backend/music-sync-backend/src/main/resources/application.properties`, or pass on the command
line as `--name=value`.

| Property | Default | Purpose |
| --- | --- | --- |
| `server.port` | `8080` | HTTP and WebSocket port |
| `spring.datasource.url` | `jdbc:h2:file:./data/musicsync` | Accounts and sessions database |
| `musicsync.catalog.remote` | `true` | `false` runs offline with a few royalty-free demo tracks |
| `musicsync.catalog.cache-file` | `./data/catalog.json` | Where the song library is cached |

The dev server proxies to `http://localhost:8080`; set `BACKEND_URL` to point it elsewhere.

## How it works

- **Accounts.** Passwords are stored as BCrypt hashes. Signing in returns a random bearer token; only
  its SHA-256 is stored, it expires after 30 days, and signing out deletes it. Every `/api` call and
  every WebSocket connection must present it.
- **Rooms.** A room lives in server memory and holds the current song, position, play/pause state,
  queue, listeners and the last 100 chat messages. Empty rooms are kept for 30 minutes, then removed.
  Restarting the server ends all rooms.
- **Sync.** The server is the single source of truth. Clients send commands (`PLAY`, `PAUSE`, `SEEK`,
  `SELECT`, `NEXT`, …) to `/app/room/{code}`; the server applies them and broadcasts the new state on
  `/topic/room/{code}` as *position at server time T*. Each client estimates its clock offset from
  the server and computes where playback should be right now, so network delay does not turn into
  audio delay. Small drift is corrected by nudging playback speed, large drift by seeking.
- **End of track.** Every listener reports when a track ends; the server advances once, to the next
  queued song or the next song in the library.

## Layout

```
backend/music-sync-backend/   Spring Boot: auth/, room/, service/SongCatalog, controller/
frontend/src/                 React: hooks/useRoom (connection), hooks/usePlayer (audio sync), components/
```
