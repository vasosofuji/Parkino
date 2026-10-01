param([string]$ApiUrl, [switch]$OfflinePreview)
# Local Windows APK build. Connected builds require the deployed HTTPS API.
$ErrorActionPreference = 'Stop'
if (-not $OfflinePreview) {
    $parkingApiUri = $null
    if (-not [Uri]::TryCreate($ApiUrl, [UriKind]::Absolute, [ref]$parkingApiUri) -or $parkingApiUri.Scheme -ne 'https' -or $parkingApiUri.IsLoopback) {
        throw 'Pass -ApiUrl with the deployed HTTPS API address, or explicitly use -OfflinePreview.'
    }
}
$parkingProjectRoot = Split-Path -Parent $PSScriptRoot
$parkingParentRoot = Split-Path -Parent $parkingProjectRoot
$parkingProjectName = Split-Path -Leaf $parkingProjectRoot
$parkingDriveName = @('P', 'Q', 'R') | Where-Object { -not (Test-Path -LiteralPath "${_}:\") } | Select-Object -First 1
if (-not $parkingDriveName) { throw 'No free temporary build drive is available.' }
$parkingSavedEnvironment = @{}
foreach ($name in @('ANDROID_HOME','ANDROID_SDK_ROOT','EXPO_PUBLIC_API_URL','EXPO_PUBLIC_OFFLINE_PREVIEW','NODE_ENV','CI')) {
    $parkingSavedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$parkingAliasCreated = $false
try {
    if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
    $env:EXPO_PUBLIC_OFFLINE_PREVIEW = $(if ($OfflinePreview) { '1' } else { '0' })
    if (-not $OfflinePreview) { $env:EXPO_PUBLIC_API_URL = $ApiUrl }
    $env:NODE_ENV = 'production'
    $env:CI = '1'
    Push-Location $parkingProjectRoot
    try {
        & npx.cmd expo prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) { throw 'Expo Android project generation failed.' }
    } finally { Pop-Location }
    & "$env:SystemRoot\System32\subst.exe" "${parkingDriveName}:" $parkingParentRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the temporary build alias.' }
    $parkingAliasCreated = $true
    Push-Location "${parkingDriveName}:\$parkingProjectName\android"
    try {
        & .\gradlew.bat app:assembleRelease --max-workers=2 --console=plain '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m'
        if ($LASTEXITCODE -ne 0) { throw 'Android APK compilation failed.' }
    } finally { Pop-Location }
    $parkingPreviewRoot = Join-Path $parkingProjectRoot 'preview'
    New-Item -ItemType Directory -Path $parkingPreviewRoot -Force | Out-Null
    $parkingApkPath = Join-Path $parkingPreviewRoot $(if ($OfflinePreview) { 'ParkSkopje-preview.apk' } else { 'Parkino-connected.apk' })
    Copy-Item -LiteralPath (Join-Path $parkingProjectRoot 'android\app\build\outputs\apk\release\app-release.apk') -Destination $parkingApkPath
    Get-FileHash -LiteralPath $parkingApkPath -Algorithm SHA256
} finally {
    if ($parkingAliasCreated) {
        $parkingAliases = (& "$env:SystemRoot\System32\subst.exe") -join "`n"
        $parkingExpectedAlias = [regex]::Escape("${parkingDriveName}:\: => $parkingParentRoot")
        if ($parkingAliases -match $parkingExpectedAlias) {
            & "$env:SystemRoot\System32\subst.exe" "${parkingDriveName}:" /D
        }
    }
    foreach ($name in $parkingSavedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $parkingSavedEnvironment[$name], 'Process')
    }
}
