[CmdletBinding()]
param([switch]$Local)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute machi-npo $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) { throw "D1 metrics query failed with exit code $LASTEXITCODE" }
$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) { throw "D1 metrics query returned no result" }

function Get-Percent {
    param([int]$Numerator, [int]$Denominator)
    if ($Denominator -eq 0) { return $null }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "machi-npo"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        prefecture_selectors = [int]$Row.prefecture_selectors
        searchers = [int]$Row.searchers
        filterers = [int]$Row.filterers
        savers = [int]$Row.savers
        official_openers = [int]$Row.official_openers
        copiers = [int]$Row.copiers
        returned = [int]$Row.returned
        official_openers_7d = [int]$Row.official_openers_7d
        copiers_7d = [int]$Row.copiers_7d
        qa_rows = [int]$Row.qa_rows
    }
    rates = [ordered]@{
        search_percent = Get-Percent ([int]$Row.searchers) $Users
        prefecture_selection_percent = Get-Percent ([int]$Row.prefecture_selectors) $Users
        filter_percent = Get-Percent ([int]$Row.filterers) $Users
        official_open_percent = Get-Percent ([int]$Row.official_openers) $Users
        copy_percent = Get-Percent ([int]$Row.copiers) $Users
        return_percent = Get-Percent ([int]$Row.returned) $Users
    }
} | ConvertTo-Json -Depth 4
