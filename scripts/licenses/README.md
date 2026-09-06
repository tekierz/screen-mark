# Bundled license supplements

These are offline, version-specific supplements for published packages that omit
standalone license files. `manifest.json` binds each supplement to the exact
published `package.json` bytes and package version. Each attribution file records
the registry source and release commit used for review on 2026-09-05.

- `MIT.txt`: standard MIT terms from
  https://raw.githubusercontent.com/spdx/license-list-data/v3.26.0/text/MIT.txt.
  The unfilled `Copyright (c) <year> <copyright holders>` template line is omitted;
  package author metadata is preserved separately without inventing ownership.
- `Apache-2.0.txt`: verbatim https://www.apache.org/licenses/LICENSE-2.0.txt,
  referenced by Brotli's original Google decoder notice.
- `SWC-REPOSITORY-LICENSE.txt`: verbatim SWC root LICENSE at helper publish commit
  `a239a7b34864d49c8bbbd2345c617b9046eb80b7`. The helper's own package metadata
  explicitly declares MIT. Both source declarations remain separately identified.

Normal builds read only these local files and installed package notices. A missing
license, empty supplement, or changed fallback package version/metadata fails the
build. Review upstream attribution and update the manifest when these packages
change; do not substitute ScreenMark's own copyright/license.
