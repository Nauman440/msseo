#!/usr/bin/env bash
# Builds apps/web/public/downloads/msscore-connector.zip from integrations/wordpress/msscore-connector
# (Linux/macOS twin of zip-wp-plugin.ps1). Run after changing the plugin: bash scripts/zip-wp-plugin.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/apps/web/public/downloads/msscore-connector.zip"
mkdir -p "$(dirname "$out")"
rm -f "$out"
cd "$root/integrations/wordpress"
for f in $(find msscore-connector -name '*.php'); do php -l "$f" >/dev/null; done
zip -qrX "$out" msscore-connector
echo "Built $out"
