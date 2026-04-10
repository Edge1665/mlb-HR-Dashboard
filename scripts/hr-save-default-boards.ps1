param(
  [string]$BaseUrl = "http://localhost:4028",
  [string]$TargetDate = "",
  [string]$TrainingStartDate = "",
  [int]$Limit = 10
)

if ($TargetDate -eq "") {
  $TargetDate = Get-Date -Format "yyyy-MM-dd"
}

$bodyObject = @{
  targetDate = $TargetDate
  limit      = $Limit
}

if ($TrainingStartDate -ne "") {
  $bodyObject.trainingStartDate = $TrainingStartDate
}

$body = $bodyObject | ConvertTo-Json

$result = Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/hr-board-snapshots/save-defaults" `
  -ContentType "application/json" `
  -Body $body

$outputDir = Join-Path (Get-Location) "output"
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$outputPath = Join-Path $outputDir "official_board_snapshots_default.json"
$result | ConvertTo-Json -Depth 10 | Out-File $outputPath -Encoding utf8
$result | ConvertTo-Json -Depth 10
