# Existing MongoDB and isolated tests

## Current connect-only development configuration

The latest read-only inspection confirms the user's process is running MongoDB 8.2.2 with `mongod --dbpath "I:\My downloads\data"` on 127.0.0.1:27017. The `hello` response confirms **standalone**, with no replica-set name. Binary support for replica sets does not mean the running server is configured as one.

`npm.cmd run dev:local` now connects to `mongodb://127.0.0.1:27017/storepilot` without managing any MongoDB process. No binary download, installation, `replSetInitiate`, `replSetReconfig`, seeding, implicit collection creation, or index creation occurs. The previous MongoMemoryReplSet development startup caused the ConfigurationInProgress error and has been removed from that runner. `server/.env` and its example no longer request `replicaSet=rs0`. Existing MongoDB files and system configuration are untouched.

Project temp files stay at `.cache/local-tmp`, test temp files at `.cache/test-tmp`, and npm cache at `.cache/npm`, all on I:. Shutdown only disconnects the client; the manually started MongoDB server remains under user control. Older `.cache/local-mongo` files are left intact and unused.

Refresh rotation now uses an atomic compare-and-swap on a single session document, including replay detection and revocation, and fulfillment status/history updates are atomic on one order document. These operations work without replica sets. Multi-document cancellation/stock restoration, team membership updates, password changes, and the original replica-set seed fail explicitly before writes when transactions are unavailable. The separate `npm.cmd run seed:demo` command imports historical products/orders on standalone MongoDB using deterministic IDs and insert-only writes; it does not change existing inventory or accounts. It is resumable rather than transactional. The app never reconfigures the server or emulates live checkout transactions with partial writes.

Read-only verification returned HTTP 200 from the API health endpoint and frontend, and confirmed that collection/index metadata in `storepilot` stayed unchanged. This database has zero collections; no accounts or seed data were provisioned. Standalone safety regression tests run with mocks and do not start another server. The full isolated integration suite described below is optional and was not run for this fix.

## Earlier isolated-test setup (historical; not used by dev:local)

Read-only inspection on 2026-10-20 found MongoDB Server **8.2.2** at:

```text
I:\My downloads\mongodbshell\mongodb-windows-x86_64-8.2.2\mongodb-win32-x86_64-windows-8.2.2\bin\mongod.exe
```

`mongod --version` succeeded and `mongod --help` exposes `--replSet`, confirming binary support. At the earlier inspection, no running server was found; the current running standalone process is documented above. Compass and mongosh are clients; `mongod.exe` is the server.

The integration tests reuse this executable to launch an isolated one-node replica set bound to loopback on a temporary port. They never connect to an existing database. The installed binary and server configuration are read without modification. Automatic downloads are disabled by default. Test database files, journals, and temporary directories are under the repository’s `.cache/test-tmp` on I:. Download cache, if explicitly enabled later, is `.cache/mongodb` on I:. Test data is retained after shutdown; tests do not automatically delete it.

Run with the existing executable (adjust its path on another machine):

```powershell
$env:MONGOMS_SYSTEM_BINARY='I:\My downloads\mongodbshell\mongodb-windows-x86_64-8.2.2\mongodb-win32-x86_64-windows-8.2.2\bin\mongod.exe'
$env:MONGOMS_VERSION='8.2.2'
$env:MONGOMS_RUNTIME_DOWNLOAD='false'
npm.cmd run test:integration -w server
```

No installation or download is needed. Each test run starts its own isolated dataset; previous test files are retained. Cleanup requires the user’s permission. Do not point tests at an existing business database or change an existing standalone server into a replica set for testing.

For a future authorized download, explicitly set `MONGOMS_RUNTIME_DOWNLOAD=true`. Keep the repository on I: and keep `TEMP`, `TMP`, and `TMPDIR` there; the server Vitest configuration sets these before launching its workers and MongoDB. The project `.npmrc` uses `.cache/npm` to keep future npm cache activity on I:. No further package installation is needed for the current build.
