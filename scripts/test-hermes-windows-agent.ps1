param(
  [Parameter(Mandatory = $true)]
  [string]$BridgeUrl,

  [Parameter(Mandatory = $true)]
  [string]$Token
)

$ErrorActionPreference = "Stop"
$headers = @{ Authorization = "Bearer $Token" }
$jsonHeaders = @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" }

function Invoke-BridgeTool {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Tool,
    [hashtable]$InputObject = @{}
  )
  $body = @{ tool = $Tool; input = $InputObject } | ConvertTo-Json -Depth 8
  Invoke-RestMethod -Method Post -Uri "$BridgeUrl/v1/tool" -Headers $jsonHeaders -Body $body
}

$report = [ordered]@{}
$report.health = Invoke-RestMethod -Method Get -Uri "$BridgeUrl/v1/health" -Headers $headers
$report.manifest = Invoke-RestMethod -Method Get -Uri "$BridgeUrl/v1/manifest" -Headers $headers
$desktop = Invoke-BridgeTool -Tool "windows.system.getDesktopPath"
$desktopPath = $desktop.path
$filePath = Join-Path $desktopPath "hermes-windows-agent-smoke.txt"
$report.writeText = Invoke-BridgeTool -Tool "windows.files.writeText" -InputObject @{ path = $filePath; content = "hello bridge" }
$report.readText = Invoke-BridgeTool -Tool "windows.files.readText" -InputObject @{ path = $filePath }
$report.clipboardWrite = Invoke-BridgeTool -Tool "windows.clipboard.write" -InputObject @{ text = "hello bridge" }
$report.clipboardRead = Invoke-BridgeTool -Tool "windows.clipboard.read"
$report.powershell = Invoke-BridgeTool -Tool "windows.powershell.run" -InputObject @{ script = '$env:USERNAME'; timeoutMs = 15000 }
$report.screenshot = Invoke-BridgeTool -Tool "windows.screenshot.capture"
$report.windowsList = Invoke-BridgeTool -Tool "windows.windows.list"

$report | ConvertTo-Json -Depth 12
