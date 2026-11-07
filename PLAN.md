# JellyRate plan

## Overview
Jellyfin 12.x plugin: users rate movies and series (1–10), optionally add a review, and see the average plus every user's rating/review on the item detail page.
Names: **JellyRate** (user-facing), `jellyrate` (developer/admin-facing: repo, assembly, routes, data file). License: GPL-3.0.

## Decisions
- Target: Jellyfin 12.x only (.NET 10; `latest` Docker tag is 12.4 as of 2026-11). Pin exact `Jellyfin.Controller` / `Jellyfin.Model` versions (floating versions broke other plugins). `targetAbi` `12.0.0.0`. The official template looks stale (10.11/net9.0), so adjust it.
- Items: movies and series only. No seasons/episodes.
- Rating: integer 1–10. One entry per (user, item). Change or remove at any time (clicking a clear button removes it).
- Review: optional text attached to the rating. Edited in place; the list shows an "edited" label. No length limit.
- Display: item detail page: average + count, and a per-user list (username, score, review) sorted newest first, no cap. Title cards (home, grids, search) show a small badge "★ 7.0 (3)" (average + count, hidden without ratings), fed by the bulk endpoint, cached 60 s client-side.
- Access: only users who can see an item can rate it or read its ratings (Jellyfin library access / parental rules).
- Moderation: none in code; admins edit the JSON file by hand.
- UI language: English only (strings in one place).
- Storage: one JSON file in the plugin data folder.

## Architecture
### Storage
`jellyrate.json` in the plugin data path. Single process-wide lock; write to temp file then atomic rename.
```json
{
  "version": 1,
  "items": {
    "<itemId-guid>": {
      "<userId-guid>": { "score": 8, "review": "text or null", "createdAt": "ISO-8601", "updatedAt": "ISO-8601", "edited": false }
    }
  }
}
```
`edited` becomes true only when a previously stored review is changed to different text (adding a review to a score-only rating, changing only the score, or re-saving the same text does not set it); it stays true. Usernames are resolved at read time from the user ID (not stored).

### REST API (plugin controller, `/JellyRate/...`)
- `GET /JellyRate/Items/{itemId}` returns `{ average, count, mine, entries: [{ userId, userName, score, review, updatedAt, edited }] }`, newest first.
- `PUT /JellyRate/Items/{itemId}` with body `{ score (1–10), review? }` creates or updates the caller's entry.
- `DELETE /JellyRate/Items/{itemId}` removes the caller's entry.
- `GET /JellyRate/Summaries?ids=a,b,c` (max 100 ids, invalid ones ignored; more is a 400) returns `{itemId: {average, count}}` for the visible movies/series that have ratings (others omitted, no 404s). Used for card badges; one read of the store per request.
- Auth: Jellyfin's `MediaBrowser` Authorization scheme (legacy `api_key` / `X-Emby-Token` are disabled in 12). The user ID comes from the auth claims, never from the request.
- Every route checks the item exists, is a Movie or Series, and is visible to the caller (library access); otherwise 404.

### Web UI injection
- Depends on the File Transformation plugin (>= 3.0.3.0, supports 12). Declared as a required dependency in docs.
- On startup, register a transformation by reflection (`Jellyfin.Plugin.FileTransformation.PluginInterface.RegisterTransformation` with `id`, `fileNamePattern`, `callbackAssembly`, `callbackClass`, `callbackMethod`) that appends our script to the web client's JS.
- Script: on item detail view navigation, for Movie/Series items, fetch `GET /JellyRate/Items/{id}` and render: 1–10 clickable row, clear button, review textarea (edit in place, save/cancel), average + count, and the per-user list with "edited" labels. Uses `ApiClient` for auth headers.

## Testing
- Unit tests (xUnit): JSON store (create, change, remove, edited flag, score validation, atomic write, corrupt/missing file).
- API integration tests: run against a real Jellyfin 12 container in CI (auth scheme, library-access 404s, CRUD, ordering, average).
- Manual check of the injected UI against Docker Jellyfin 12.

## Distribution
GitHub Actions builds with `jprm`, publishes a release zip, and updates a custom plugin repository manifest (hosted on GitHub Pages or in the repo). Admins add the manifest URL in the Jellyfin dashboard.

Release: set `version` in `build.yaml`, push tag `v<version>` (e.g. `v1.0.0.0`); `release.yml` builds with jprm (`-p:Version` from build.yaml), creates the GitHub release and commits `manifest.json` to the `manifest` branch. Admin adds in Dashboard > Plugins > Repositories: `https://raw.githubusercontent.com/emilia-ghdt/jellyrate/manifest/manifest.json`.

## Non-goals
Episodes/seasons, importing existing ratings, notifications, translations, moderation UI, review length limits, external databases.

## Risks / open items
- Jellyfin 12 rewrites data on first boot; there's no official note on plugin data folders. Verify early that `jellyrate.json` survives an upgrade and the plugin data path is stable.
- Findings (source-verified at v12.4; no Docker, so no empirical test): no migration in Jellyfin.Server/Migrations (Routines/PreStartupRoutines) touches `plugins/`. `BasePlugin.DataFolderPath` = `<PluginsPath>/<DllName>` (unversioned; the `_<version>` fallback is effectively dead since `Version` is null in the ctor). Install dirs `<Name>_<ver>` are deleted by PluginManager when a newer version loads, so never store JSON there. Store `jellyrate.json` in `DataFolderPath` (or `PluginConfigurationsPath`, also unversioned); write atomically (temp + move). Residual risk: not run against a real 10.11 to 12 upgrade.
- No native 12 UI-extension API was found; File Transformation is the only injection path and is a third-party dependency.
- Official plugin catalog name check was incomplete. Similar names exist (a Kodi add-on `c0def0rc0ffee/JellyRate`); several plugins already offer per-user ratings (`Jellyfin.Plugin.UserRating`, `Jellyfin-Enhanced`).
