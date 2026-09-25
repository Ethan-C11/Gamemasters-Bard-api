# Backend — Gamemaster's Bard API

Server handling user sessions, audio track selection based on zone/ambiance criteria, real-time playback synchronization, and storage of imported files.

## Technologies

| Tool                                                               | Role |
|--------------------------------------------------------------------|---|
| [Node.js](https://nodejs.org)                                      | Runtime |
| [Fastify](https://fastify.dev)                                     | HTTP framework |
| [TypeScript](https://www.typescriptlang.org)                       | Static typing |
| [Socket.io](https://socket.io)                                     | Real-time (playback sync, soundboard) |
| [PostgreSQL](https://www.postgresql.org)                           | Persistence (sessions, audio library) |
| [MinIO](https://min.io/)                                            | Audio file storage (S3-compatible) |
| [@fastify/multipart](https://github.com/fastify/fastify-multipart) | Audio file uploads |


## Audio Synchronization

The server is the time authority. On every track change, it broadcasts a command:

```json
{
  "action": "play",
  "trackId": "abc123",
  "serverTimestamp": 1720000000000,
  "offsetMs": 0
}
```

Clients compensate for network latency and align playback via the Web Audio API.

## Installation

```bash
npm install
```

## Development

Run the whole stack in Docker (see [Local Infrastructure](#local-infrastructure)):

```bash
docker compose up -d
```

Or run just the API on the host, against the containerised PostgreSQL and MinIO:

```bash
npm run dev
```

Type stripping goes through [tsx](https://tsx.is), which does **not** type-check —
it only strips types. Type errors therefore surface via `tsc`, not at startup:

```bash
npx tsc --noEmit
```

> `ts-node` is not usable here: TypeScript 7 is the native Go port and no longer
> exposes the JavaScript compiler API that `ts-node` is built on.

## Build

```bash
npm run build
npm start
```

> **Not functional yet.** `rootDir` and `outDir` are commented out in
> `tsconfig.json`, so `tsc` emits JavaScript next to the sources in `src/` and
> never populates `dist/` — which is where `npm start` looks. Set both options
> before relying on the production build or the `prod` stage of the Dockerfile.

## Environment Variables

Copy `.env.example` to `.env` and fill in the S3 credentials produced by the
MinIO bootstrap below. The file is git-ignored.

```env
PORT=3000
HOST=0.0.0.0

DATABASE_URL=postgresql://gm:gm_password@postgres:5432/gm_sound_manager

# Generate with: openssl rand -hex 32 (or any strong password)
MINIO_ROOT_USER=
MINIO_ROOT_PASSWORD=

S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=audio
S3_ACCESS_KEY=
S3_SECRET_KEY=


POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=

JWT_SECRET=

ADMIN_KEY=
SOUND_CREATOR_KEY=

TOKEN_HMAC_SECRET=

BREVO_SMTP_HOST=
BREVO_SMTP_PORT=
BREVO_SMTP_LOGIN=
BREVO_SMTP_KEY=
EMAIL_FROM=
FRONTEND_URL=
```

`MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` are the admin credentials for the
MinIO container itself; generate a strong value for each. Compose refuses to
start MinIO if either is unset. In dev, `S3_ACCESS_KEY` / `S3_SECRET_KEY` can
simply be set to the same values as the root user/password — see
"Bootstrapping MinIO" below for a more restricted setup.

`PORT` and `HOST` default to `3001` and `127.0.0.1` when unset. Inside a
container the server must bind `0.0.0.0`, otherwise the published port is
unreachable from the host.

The hostnames `postgres` and `minio` only resolve on the Compose network. To
run the API on the host (`npm run dev`) against the containerised services, use
`localhost:5432` and `http://localhost:9000` instead.

## Local Infrastructure

The Compose stack runs three services: the API, PostgreSQL, and MinIO. Fastify,
Socket.io, TypeScript and `@fastify/multipart` are libraries inside the API
container, not separate services — Socket.io shares the Fastify HTTP port.

| Service    | Port                   |
|------------|------------------------|
| API        | 3000                   |
| PostgreSQL | 5432                   |
| MinIO      | 9000 (S3 API), 9001 (console) |

```bash
docker compose up -d
```

Source edits on the host trigger a reload inside the API container: the watcher
polls, because bind mounts on Windows and macOS do not forward filesystem events
into containers.

### Bootstrapping MinIO

MinIO takes its admin credentials directly from environment variables
(`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`) — no cluster layout to apply. The
only manual step left is creating the bucket, since MinIO doesn't auto-create
it.

**Quick path (dev):** open the MinIO Console at
[http://localhost:9001](http://localhost:9001), log in with
`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, and create a bucket named `audio`.
Then set `S3_ACCESS_KEY` / `S3_SECRET_KEY` in `.env` to the same values as
`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, and restart the API.

**CLI path**, using the bundled `mc` binary inside the container:

```bash
docker compose exec gm-minio mc alias set local http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
docker compose exec gm-minio mc mb local/audio
```

**Restricted setup (recommended beyond local dev):** create a dedicated
service account instead of reusing the root credentials, so the API doesn't
hold admin rights over the whole MinIO instance:

```bash
docker compose exec gm-minio mc admin user add local gm-api-key <a-strong-secret>
docker compose exec gm-minio mc admin policy attach local readwrite --user gm-api-key
```

Use `gm-api-key` / `<a-strong-secret>` as `S3_ACCESS_KEY` / `S3_SECRET_KEY` in
`.env` in that case, instead of the root credentials.

This state lives in the `gm_minio_data` volume: `docker compose down -v`
destroys it, and the bucket (and any dedicated user) has to be recreated.
