# Backend Services

Outline's backend is split into several distinct [services](../server/services)
that combined form the application. When running the official Docker container
it will run all of the production services by default.

You can choose which services to run through either a comma separated CLI flag,
`--services`, or the `SERVICES` environment variable. For example:

```bash
yarn start --services=web,worker
```

## Admin

Currently this service is only used in development to view and debug the queues.
It can be viewed at `/admin` when enabled.

## Web

The web server hosts the Application and API, as such this is the main service
and must be run by at least one process.

## Websockets

The websocket server is used to communicate with the frontend, it can be ran on
the same box as the web server or separately.

## Worker

At least one worker process is required to process the [queues](../server/queues).

## Collaboration

The collaboration server coordinates all realtime editing and updating of documents,
it can be ran on the same box as the web server or separately.

```bash
yarn start --services=collaboration
```

If the collaboration service is hosted on a separate domain then the `COLLABORATION_URL`
env must be set to the publicly accessible URL. For example, if the app is hosted at
`https://docs.example.com` you may use something like:
`COLLABORATION_URL=wss://docs-collaboration.example.com`.

## Recommended Railway Topology

When running Outline on Railway, keep `WEB_CONCURRENCY=1` and assign database
pool budgets per service so collaborative editing, worker jobs, and HTTP traffic
do not contend for the same small pool:

- `outline-web`
  - `SERVICES=web,websockets`
  - `WEB_CONCURRENCY=1`
  - `DATABASE_CONNECTION_POOL_MIN=0`
  - `DATABASE_CONNECTION_POOL_MAX=10`
  - `COLLABORATION_URL=<public collaboration URL>`
- `outline-worker`
  - `SERVICES=worker`
  - `WEB_CONCURRENCY=1`
  - `DATABASE_CONNECTION_POOL_MIN=0`
  - `DATABASE_CONNECTION_POOL_MAX=2`
- `outline-collaboration`
  - `SERVICES=collaboration`
  - `WEB_CONCURRENCY=1`
  - `DATABASE_CONNECTION_POOL_MIN=0`
  - `DATABASE_CONNECTION_POOL_MAX=2`

Leave `REDIS_COLLABORATION_URL` unset while collaboration runs as a singleton.
Only configure it when you scale the collaboration service beyond one instance.

## Railway Database Stabilization

For the xFoundry production deployment, keep Railway Postgres tuned to reduce
short checkpoint stalls before increasing application pools further:

- `checkpoint_timeout=15min`
- `checkpoint_completion_target=0.9`
- `max_wal_size=4GB`
- `min_wal_size=1GB`
- `effective_cache_size=16GB`
- keep `shared_buffers` at the Railway image default unless the container
  shared-memory limit has been tested in a maintenance window.

If `shared_buffers` is increased, set Railway's `RAILWAY_SHM_SIZE_BYTES` on the
Postgres service before restart. The production service currently keeps
`RAILWAY_SHM_SIZE_BYTES=8589934592` as recovery headroom, while
`shared_buffers` remains at the image default.
