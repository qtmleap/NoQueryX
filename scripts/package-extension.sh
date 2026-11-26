#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
version=$(git show HEAD:extension/manifest.json | node -e '
  const { version } = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (typeof version !== "string" || !/^(0|[1-9][0-9]{0,4})(\.(0|[1-9][0-9]{0,4})){2}$/.test(version)
      || version.split(".").some(part => Number(part) > 65535) || version === "0.0.0") {
    console.error("Expected an extension version in X.Y.Z format");
    process.exit(1);
  }
  console.log(version);
')
tag="v$version"
if [[ $# -gt 0 && $1 != "$tag" ]]; then
  echo "Tag $1 does not match manifest version $tag" >&2
  exit 1
fi

asset="NoQueryX-$tag.zip"
mkdir -p release
git archive --format=zip --output="release/$asset" HEAD:extension
(
  cd release
  shasum -a 256 "$asset" > SHA256SUMS
)
