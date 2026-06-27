# Import Android screenshots into docs/screenshots/android/
# Usage: place your PNG files in a folder, then run:
#   .\scripts\import-android-screenshots.ps1 -SourceFolder "C:\Users\shareef01\Pictures\Screenshots"

param(
    [Parameter(Mandatory = $true)]
    [string]$SourceFolder
)

$dest = Join-Path $PSScriptRoot "..\docs\screenshots\android"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# Map by partial name in filename (case-insensitive). Adjust if your files are named differently.
$map = @{
    "record"                 = "record.png"
    "income"                 = "add-transaction-income.png"
    "expense"                = "add-transaction-expense.png"
    "bills"                  = "bills-overview.png"
    "categor"                = "bills-categories.png"
    "account"                = "settings-account.png"
    "settings"               = "settings-more.png"
}

Get-ChildItem -Path $SourceFolder -Filter *.png | ForEach-Object {
    $name = $_.Name.ToLower()
    foreach ($key in $map.Keys) {
        if ($name -match $key) {
            $target = Join-Path $dest $map[$key]
            Copy-Item $_.FullName $target -Force
            Write-Host "Copied $($_.Name) -> $($map[$key])"
            break
        }
    }
}

Write-Host ""
Write-Host "Done. Review docs/screenshots/android/ then:"
Write-Host "  git add docs/screenshots/android/"
Write-Host "  git commit -m ""Add Android app screenshots"""
Write-Host "  git push origin main"
