[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_telemetry.sql"
$AppPath = Join-Path $RepoRoot "public\app.js"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$SourcePath = Join-Path $RepoRoot "SOURCE.md"
$WranglerPath = Join-Path $RepoRoot "wrangler.jsonc"
$PublicDirectory = Join-Path $RepoRoot "public"
$DataDirectory = Join-Path $PublicDirectory "data"

$RequiredFiles = @(
    "DECISIONS.md", "EXPERIMENT.md", "LICENSE", "METRICS.md", "PRIVACY.md", "README.md", "SECURITY.md", "SOURCE.md", "STACK.md",
    ".github\workflows\ci.yml", "migrations\0001_telemetry.sql", "ops\product-metrics.ps1", "ops\product-metrics.sql",
    "ops\submit-indexnow.ps1", "public\app.js", "public\data\index.json", "public\favicon.svg", "public\manifest.webmanifest", "public\og.svg", "public\robots.txt",
    "scripts\build-data.mjs", "src\worker.tsx", "test\directory-data.test.ts", "test\surface.test.ts"
)
foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $RelativePath))) { throw "Missing required release file: $RelativePath" }
}

$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$App = Get-Content -Raw -LiteralPath $AppPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath
$Source = Get-Content -Raw -LiteralPath $SourcePath
$Wrangler = Get-Content -Raw -LiteralPath $WranglerPath
$DataIndex = Get-Content -Raw -LiteralPath (Join-Path $DataDirectory "index.json") | ConvertFrom-Json
$ProductSurface = @($Worker, $App) -join "`n"

if (-not $Worker.Contains('class="directory-scene"') -or -not $Worker.Contains('class="map-board"') -or -not $Worker.Contains('class="card-cabinet"') -or -not $Worker.Contains('class="region-grid"') -or -not $App.Contains('card.className = "organization-card"') -or -not $App.Contains('fields.className = "field-tags"')) { throw "Expected the map, pins, regional drawers, and organization-card visual system" }
if ($ProductSurface -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性') { throw "Research copy must not appear on the product surface" }
if ($Styles -match '(?i)gradient') { throw "Product CSS must not use gradients" }
if ($Styles -match '(?s)h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px') { throw "Primary heading is too large" }
if ($ProductSurface -match '(?i)innerHTML|eval\(|new Function|dangerouslySetInnerHTML') { throw "Official data must not be interpreted as markup or code" }
if (-not $Worker.Contains('app.post("/api/telemetry"') -or $Worker.Contains('app.post("/api/search"') -or -not $App.Contains('fetch("/data/index.json"') -or -not $App.Contains('fetch(`/data/${code}.json`')) { throw "Directory search must stay in the browser and load one regional shard" }
if ($App -match 'history\.(pushState|replaceState)|location\.search\s*=') { throw "Search and organization details must not enter product URLs" }
if ($Migration -match '(?i)prefecture_id|query|search_term|activity_id|organization_id|corporation_number|email|phone_number|telephone|address|advertising_id|password') { throw "Directory details, contact, advertising, and authentication data do not belong in telemetry storage" }
if (-not $Migration.Contains("CHECK(event_name IN") -or -not $Worker.Contains("35 * 86400")) { throw "Expected allowlisted telemetry and 35-day retention" }
if (-not $Source.Contains("NPO法人ポータルサイト") -or -not $Source.Contains("2026年7月31日") -or -not $Source.Contains("公共データ利用規約第1.0版") -or -not $Source.Contains("加工内容") -or -not $Source.Contains("代表者名")) { throw "Official source, terms, date, transformation, and exclusions are incomplete" }
if (-not $App.Contains('shortlist.length >= 12') -or -not $App.Contains('shortlist.slice(0, 12)')) { throw "Expected a twelve-organization local shortlist limit" }
if ($ProductSurface -match '(?i)better-auth|betterAuth') { throw "Account authentication is not needed for a local shortlist" }
if ($Wrangler.Contains("00000000-0000-0000-0000-000000000000")) { throw "The production D1 database ID has not been configured" }

if ($DataIndex.source.totalRows -ne 60162 -or $DataIndex.source.activeRows -ne 49062 -or $DataIndex.source.excludedDissolvedRows -ne 11100 -or $DataIndex.prefectures.Count -ne 47 -or $DataIndex.activities.Count -ne 20) { throw "Official NPO dataset dimensions are incorrect" }
if ($DataIndex.source.asOf -ne "2026-07-31" -or $DataIndex.source.zipSha256 -ne "fea270d92b6a725364e5a12256dd019b5488887a66be576a9fc4a11dfc6a9f07") { throw "Official NPO source date or hash is incorrect" }
if ($DataIndex.source.purposeRows -ne 48919 -or $DataIndex.source.locationRows -ne 49005 -or $DataIndex.source.numberRows -ne 47590) { throw "Official NPO coverage dimensions are incorrect" }

$ShardFiles = @(Get-ChildItem -LiteralPath $DataDirectory -File | Where-Object { $_.Name -match '^\d{2}\.json$' } | Sort-Object Name)
if ($ShardFiles.Count -ne 47) { throw "Expected 47 prefecture shards, found $($ShardFiles.Count)" }
$ExpectedIds = 1..47 | ForEach-Object { $_.ToString("00") }
$ActualIds = $ShardFiles | ForEach-Object { $_.BaseName }
if (($ExpectedIds -join ",") -ne ($ActualIds -join ",")) { throw "Prefecture shard IDs are incomplete" }
$IndexCount = [int](($DataIndex.prefectures | Measure-Object -Property count -Sum).Sum)
if ($IndexCount -ne 49062) { throw "Prefecture index does not sum to 49,062 organizations" }
$TotalBytes = (Get-Item -LiteralPath (Join-Path $DataDirectory "index.json")).Length
foreach ($ShardFile in $ShardFiles) {
    if ($ShardFile.Length -gt 6000000) { throw "Prefecture shard $($ShardFile.Name) exceeds 6 MB" }
    $TotalBytes += $ShardFile.Length
}
if ($TotalBytes -gt 30000000) { throw "Static directory data exceeds 30 MB" }
if ((Get-Item -LiteralPath (Join-Path $PublicDirectory "og.svg")).Length -lt 1500) { throw "Expected a product-specific OG SVG larger than 1.5 KB" }
if ((Get-Item -LiteralPath $AppPath).Length -lt 14000) { throw "Expected a substantial regional-directory client" }

$KeyFiles = @(Get-ChildItem -LiteralPath $PublicDirectory -File | Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" })
if ($KeyFiles.Count -ne 1) { throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)" }
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) { throw "IndexNow key file name and content do not match" }

Write-Output "Product release contract is satisfied"
