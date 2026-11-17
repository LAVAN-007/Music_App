# MusicSync

Listen to music on your own or together, in sync. Sign in and play straight away, keep your own
playlists, add friends, or start a room and share the 6-character code or invite link so everyone in
the room hears the same song at the same second. Anyone in the room can play, pause,
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

1. **Database.** Create a project at https://neon.com and copy its connection string
   (`postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require`).
2. **App.** Push the code to GitHub. At https://render.com choose **New → Blueprint**, pick the
   repository and branch, and paste the connection string as `DATABASE_URL` when asked. On an existing
   service, add `DATABASE_URL` under **Environment** instead. The first build takes several minutes.
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
| `DATABASE_URL` (environment or `.env`) | not set | Postgres connection string; without it accounts go in a local H2 file |
| `musicsync.jwt.secret` | random per start | Signs login tokens; set `MUSICSYNC_JWT_SECRET` when hosting |
| `musicsync.catalog.remote` | `true` | `false` runs offline with a few royalty-free demo tracks |
| `musicsync.catalog.cache-file` | `./data/catalog.json` | Where the song library is cached |

The dev server proxies to `http://localhost:8080`; set `BACKEND_URL` to point it elsewhere.

## How it works

- **Accounts.** Passwords are stored as BCrypt hashes. Signing in returns a 15-minute access token
  (a JWT signed with `MUSICSYNC_JWT_SECRET`) and a refresh token; only the refresh token's SHA-256 is
  stored. The app renews the access token by itself, so a user stays signed in until they sign out or
  stay away for 30 days. Every `/api` call and every WebSocket connection must present the access token.
- **Listening alone.** After signing in you land in your own player; no room is needed. "Listen
  together" starts a room (carrying over the song that is playing) or joins one by code.
- **Playlists and friends.** Both are stored in the database with the account. A playlist keeps each
  song's details, so it survives the library being rebuilt. Friends are added by username; the list
  shows who is online and lets you join a friend's room.
- **Mute and message sound.** Mute is local to the device and never sent to the room. A short chime
  plays when someone else sends a chat message or a friend request.
- **Rooms.** A room lives in server memory and holds the current song, position, play/pause state,
  queue, listeners and the last 100 chat messages. Empty rooms are kept for 30 minutes, then removed.
  Restarting the server ends all rooms.
- **Sync.** The server is the single source of truth. Clients send commands (`PLAY`, `PAUSE`, `SEEK`,
  `SELECT`, `NEXT`, …) to `/app/room/{code}`; the server applies them and broadcasts the new state on
  `/topic/room/{code}` as *position at server time T*. Each client estimates its clock offset from
  the server and computes where playback should be right now, so network delay does not turn into
  audio delay. Small drift is corrected by nudging playback speed, large drift by seeking.
  A new song is scheduled to start one second ahead (a seek, 0.6 s ahead), so every listener has
  time to buffer and all of them begin together.
- **End of track.** Every listener reports when a track ends; the server advances once, to the next
  queued song or the next song in the library.

## Layout

```
backend/music-sync-backend/   Spring Boot: auth/, room/, service/SongCatalog, controller/
frontend/src/                 React: hooks/useRoom (connection), hooks/usePlayer (audio sync), components/
```
