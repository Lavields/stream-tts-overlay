param(
  [Parameter(Mandatory=$true)] [string] $Version,
  [string] $PythonRuntime = ''
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'La versión debe tener formato X.Y.Z.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$oldCloud = $env:STREAMVOICE_CLOUD_CONTROL_URL
$oldFeed = $env:STREAMVOICE_UPDATE_FEED
$oldVersion = $env:STREAMVOICE_DESKTOP_VERSION
$oldId = $env:STREAMVOICE_TEST_PACKAGE_ID
$oldControl = $env:STREAMVOICE_CONTROL_URL
$oldPython = $env:STREAMVOICE_WINDOWS_PYTHON_RUNTIME
try {
  $env:STREAMVOICE_CLOUD_CONTROL_URL = 'https://control.streamvoice.workers.dev'
  $env:STREAMVOICE_UPDATE_FEED = 'https://streamvoice-actualizaciones-windows.streamvoice.workers.dev/'
  $env:STREAMVOICE_DESKTOP_VERSION = $Version
  Remove-Item Env:STREAMVOICE_TEST_PACKAGE_ID -ErrorAction SilentlyContinue
  Remove-Item Env:STREAMVOICE_CONTROL_URL -ErrorAction SilentlyContinue
  if ($PythonRuntime) { $env:STREAMVOICE_WINDOWS_PYTHON_RUNTIME = $PythonRuntime }
  Push-Location $projectRoot
  try {
    & node desktop/build-windows-installer.mjs
    if ($LASTEXITCODE -ne 0) { throw "Falló la construcción (código $LASTEXITCODE)." }
  } finally { Pop-Location }
} finally {
  $env:STREAMVOICE_CLOUD_CONTROL_URL = $oldCloud
  $env:STREAMVOICE_UPDATE_FEED = $oldFeed
  $env:STREAMVOICE_DESKTOP_VERSION = $oldVersion
  $env:STREAMVOICE_TEST_PACKAGE_ID = $oldId
  $env:STREAMVOICE_CONTROL_URL = $oldControl
  $env:STREAMVOICE_WINDOWS_PYTHON_RUNTIME = $oldPython
}
