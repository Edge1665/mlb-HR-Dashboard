param(
  [string]$BaseUrl = "http://localhost:4028",
  [string]$TargetDate = "",
  [string]$BoardType = "model",
  [string]$LineupMode = "",
  [int]$Limit = 10
)

if ($TargetDate -eq "") {
  $TargetDate = Get-Date -Format "yyyy-MM-dd"
}

$bodyObject = @{
  targetDate = $TargetDate
  sortMode   = $BoardType
  limit      = $Limit
}

if ($LineupMode -ne "") {
  $bodyObject.lineupMode = $LineupMode
}

$body = $bodyObject | ConvertTo-Json

$result = Invoke-RestMethod `
  -Method Post `
  -Uri "$BaseUrl/api/hr-board-snapshots" `
  -ContentType "application/json" `
  -Body $body

$outputDir = Join-Path (Get-Location) "output"
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$safeBoardType = $BoardType.Replace(" ", "_")
$outputPath = Join-Path $outputDir "official_board_snapshot_${safeBoardType}.json"
$result | ConvertTo-Json -Depth 10 | Out-File $outputPath -Encoding utf8
$result | ConvertTo-Json -Depth 10
