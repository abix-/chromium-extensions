# Exit on error
$ErrorActionPreference = "Stop"

# Define the build directory
$BuildDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "build"

# Check if the build directory exists
if (-Not (Test-Path $BuildDir)) {
    Write-Host "Please create a build directory at $BuildDir."
    Exit 1
}

# Remove all contents of the build directory
Remove-Item -Recurse -Force "$BuildDir\*"

# Define the extension copy directory
$ExtCopy = Join-Path $BuildDir "extension"

# Copy files excluding *.ts and .DS_Store
Get-ChildItem -Path "extension" -Recurse | Where-Object {
    $_.Extension -notmatch "\.ts$" -and $_.Name -ne ".DS_Store"
} | ForEach-Object {
    $Destination = $_.FullName.Replace((Get-Item "extension").FullName, $ExtCopy)
    if (-Not (Test-Path -Path (Split-Path -Parent $Destination))) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) | Out-Null
    }
    Copy-Item -Path $_.FullName -Destination $Destination
}

# Run rollup. On Windows, the rollup bin is a .cmd wrapper that
# Start-Process won't execute directly — route through npx so it
# resolves node_modules/.bin/rollup(.cmd) correctly. `npx --no
# -install` avoids an accidental network fetch if it's missing.
& npx --no-install rollup -c
if ($LASTEXITCODE -ne 0) {
    Write-Host "rollup failed with exit code $LASTEXITCODE"
    Exit $LASTEXITCODE
}

# Create a ZIP file at build/extension.zip. Compress-Archive
# writes to the absolute destination path directly so no move
# step is needed — the prior version had a dead Move-Item call
# that failed because the file was never staged at that path.
Compress-Archive -Path "$ExtCopy\*" -DestinationPath "$BuildDir\extension.zip" -Force

Write-Host "The extension has been created at '$BuildDir\extension.zip'."
