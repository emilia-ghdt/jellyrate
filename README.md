# JellyRate

A Jellyfin plugin for rating movies and series from 1 to 10 and optionally writing a review.

## What it does

- On movie and series detail pages, users give a 1-10 rating and an optional review. Both can be edited or deleted later.
- The page shows the average rating and every user's rating and review. Edited reviews carry an "edited" flag.
- Respects library access: an item that a user cannot see is not rated, read or listed for that user.
- Episodes and seasons are not supported.

## Requirements

- Jellyfin 12.x (`targetAbi` 12.0.0.0, .NET 10).
- The [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin, version 3.0.3.0 or newer (3.x). JellyRate uses it to add its script to the web client's `index.html`.
- Without File Transformation, the plugin still loads and its REST API works, but the web UI does not appear. A warning is written to the Jellyfin log.

## Install

1. In Dashboard > Plugins > Repositories, add two repositories:
   - JellyRate:
     `https://raw.githubusercontent.com/emilia-ghdt/jellyrate/manifest/manifest.json`
   - File Transformation:
     `https://www.iamparadox.dev/jellyfin/plugins/manifest.json`
2. In the plugin catalog, install **JellyRate** and **File Transformation**. File Transformation needs no configuration.
3. Restart Jellyfin.

## Usage

Open a movie or series, pick a score from 1 to 10 (it stays pending until you click "Save review"), optionally write a review, and save. Saving again changes your rating; deleting removes it.

## Data and moderation

Ratings are stored in one file, `jellyrate.json`, in the plugin's data folder: `<Jellyfin data dir>/plugins/Jellyfin.Plugin.JellyRate/jellyrate.json`. This folder is unversioned, so it survives plugin updates. The file is written atomically (temp file, then move).

There is no moderation UI and no review length limit. To delete a rating or review, stop Jellyfin, edit the file, and start it again.

```json
{
  "version": 1,
  "items": {
    "<item id (GUID)>": {
      "<user id (GUID)>": {
        "score": 8,
        "review": "Text, or null",
        "createdAt": "2026-01-01T12:00:00+00:00",
        "updatedAt": "2026-01-02T12:00:00+00:00",
        "edited": false
      }
    }
  }
}
```

- To remove one user's rating, delete their `<user id>` entry. To remove only a review, set `review` to `null`.
- `edited` becomes `true` only when a previously stored review is changed to different text (clearing it counts), and stays `true`. Adding a first review, changing only the score or re-saving the same text does not set it.
- Keep the JSON valid. If an item has no users left, delete the item entry as well.

## REST API

All endpoints require a normal Jellyfin authenticated user (`[Authorize]`). They return 404 for unknown items, non-movie/series items, and items not visible to the caller.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/JellyRate/Items/{itemId}` | Average, count, the caller's rating (`mine`) and all entries |
| PUT | `/JellyRate/Items/{itemId}` | Body `{"score": 1-10, "review": "optional"}`; 400 if the score is out of range |
| DELETE | `/JellyRate/Items/{itemId}` | Remove the caller's rating |
| GET | `/JellyRate/Summaries?ids=a,b,c` | Up to 100 comma-separated IDs; returns `{itemId: {average, count}}` only for visible movies/series with ratings (400 if more than 100 IDs) |
| GET | `/JellyRate/ui.js` | The injected web UI script |

The Items routes return `{average, count, mine, entries[]}`; each entry has `userId`, `userName`, `score`, `review`, `updatedAt` and `edited`.

## Building and testing

Requires the plain .NET 10 SDK (nix-shell is not needed).

```sh
dotnet build jellyrate.slnx
dotnet test Jellyfin.Plugin.JellyRate.Tests          # unit tests
integration/run.sh                                    # integration tests
```

`integration/run.sh` builds the plugin, starts a throwaway native Jellyfin server (downloaded tarball, no Docker; `JELLYFIN_VERSION` defaults to 12.4) on port 8096, and runs `Jellyfin.Plugin.JellyRate.IntegrationTests` against it.

## Release

1. Set `version` in `build.yaml` (e.g. `1.0.0.0`).
2. Push a tag `v<version>` (e.g. `v1.0.0.0`). It must match `build.yaml`, or the workflow fails.
3. `.github/workflows/release.yml` builds with `jprm`, creates the GitHub release and updates `manifest.json` on the `manifest` branch.

## License

GPL-3.0. See [LICENSE](LICENSE).
