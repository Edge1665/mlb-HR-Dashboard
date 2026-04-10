param(
  [string]$BaseUrl = "http://localhost:4028",
  [string]$TrainingStartDate = "2024-03-28",
  [string]$SnapshotDate = "",
  [string]$TrainingEndDate = ""
)

$startedAt = Get-Date

Write-Host ""
Write-Host "HR daily refresh starting..." -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl"
Write-Host "Training start date: $TrainingStartDate"
if ($SnapshotDate -ne "") {
  Write-Host "Snapshot date override: $SnapshotDate"
}
if ($TrainingEndDate -ne "") {
  Write-Host "Training end date override: $TrainingEndDate"
}
Write-Host ""
Write-Host "Stages:" -ForegroundColor DarkCyan
Write-Host "1. Save yesterday's snapshots"
Write-Host "2. Sync outcomes"
Write-Host "3. Score saved official boards"
Write-Host "4. Retrain the model artifact"
Write-Host ""

$bodyObject = @{
  trainingStartDate = $TrainingStartDate
}

if ($SnapshotDate -ne "") {
  $bodyObject.snapshotDate = $SnapshotDate
}

if ($TrainingEndDate -ne "") {
  $bodyObject.trainingEndDate = $TrainingEndDate
}

$body = $bodyObject | ConvertTo-Json

Write-Host "Calling /api/hr-daily-refresh ..." -ForegroundColor Yellow
$result = Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/hr-daily-refresh" `
  -ContentType "application/json" `
  -Body $body

$outputDir = Join-Path (Get-Location) "output"
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$outputPath = Join-Path $outputDir "daily_refresh_latest.json"
$result | ConvertTo-Json -Depth 10 | Out-File $outputPath -Encoding utf8
$finishedAt = Get-Date
$elapsed = $finishedAt - $startedAt

Write-Host ""
Write-Host "HR daily refresh completed." -ForegroundColor Green
Write-Host ("Elapsed: {0:mm}m {0:ss}s" -f $elapsed)
Write-Host "Output file: $outputPath"

if ($result.snapshotSave) {
  Write-Host ""
  Write-Host "Snapshot save:" -ForegroundColor DarkCyan
  Write-Host "  Success: $($result.snapshotSave.success)"
  Write-Host "  Rows saved: $($result.snapshotSave.savedCount)"
}

if ($result.outcomeSync) {
  Write-Host ""
  Write-Host "Outcome sync:" -ForegroundColor DarkCyan
  Write-Host "  Success: $($result.outcomeSync.success)"
  Write-Host "  Updated: $($result.outcomeSync.updatedCount)"
  Write-Host "  Positives: $($result.outcomeSync.positiveCount)"
  Write-Host "  Missing: $($result.outcomeSync.missingCount)"
}

if ($result.scoring) {
  Write-Host ""
  Write-Host "History scoring:" -ForegroundColor DarkCyan
  Write-Host "  Snapshots scored: $($result.scoring.snapshotCount)"
}

if ($result.artifact) {
  Write-Host ""
  Write-Host "Artifact retrain:" -ForegroundColor DarkCyan
  Write-Host "  Trained at: $($result.artifact.trainedAt)"
  Write-Host "  Training examples: $($result.artifact.trainingExampleCount)"
  Write-Host "  Feature count: $($result.artifact.featureCount)"
}

Write-Host ""
$result | ConvertTo-Json -Depth 10
