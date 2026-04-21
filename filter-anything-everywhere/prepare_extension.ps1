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

# Run rollup
Start-Process -FilePath "rollup" -ArgumentList "-c" -NoNewWindow -Wait

# Create a ZIP file for the extension
Set-Location $ExtCopy
Compress-Archive -Path * -DestinationPath "$BuildDir\extension.zip"

# Move the ZIP file to the build directory
Move-Item -Path "$ExtCopy\extension.zip" -Destination "$BuildDir\extension.zip"

Write-Host "The extension has been created at '$BuildDir\extension.zip'."
