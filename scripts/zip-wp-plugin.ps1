# Builds apps/web/public/downloads/msscore-connector.zip from integrations/wordpress/msscore-connector.
# Run after changing the plugin: powershell -File scripts/zip-wp-plugin.ps1
# Entries use forward slashes (Compress-Archive in Windows PowerShell 5.1 writes backslashes, which
# Linux servers unpack as one long file name).
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'integrations\wordpress\msscore-connector'
$outDir = Join-Path $root 'apps\web\public\downloads'
$out = Join-Path $outDir 'msscore-connector.zip'
New-Item -ItemType Directory -Force $outDir | Out-Null
if (Test-Path $out) { Remove-Item $out -Force }
$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, "msscore-connector/$rel") | Out-Null
  }
} finally {
  $zip.Dispose()
}
