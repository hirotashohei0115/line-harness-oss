# deploy-prod.ps1
# Deploy to production: macbook-repair-admin (Vercel) + macbook-repair-worker (Cloudflare)

$TEST_PROJECT  = '{"projectId":"prj_lYUSaL4mqvWvV2AUipvAsZXMNPHc","orgId":"team_4IbCtSV2BEd1FEQ6rKLxvATJ","projectName":"line-harness-oss"}'
$PROJECT_FILE  = Join-Path $PSScriptRoot ".vercel\project.json"
$VERCEL_TOKEN  = [System.Environment]::GetEnvironmentVariable("VERCEL_TOKEN", "User")

if (-not $VERCEL_TOKEN) {
    Write-Host "ERROR: VERCEL_TOKEN not found." -ForegroundColor Red
    Write-Host "Run: [System.Environment]::SetEnvironmentVariable('VERCEL_TOKEN','vcp_...', 'User')"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Production Deploy"
Write-Host "  Admin:  macbook-repair-admin.vercel.app"
Write-Host "  Worker: macbook-repair-worker.empower-repair.workers.dev"
Write-Host "========================================"
Write-Host ""

# [1/2] Cloudflare Worker
Write-Host "[1/2] Deploying Worker..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "apps\worker")
cmd /c "npx wrangler@latest deploy 2>&1"
$workerExit = $LASTEXITCODE
Pop-Location

if ($workerExit -ne 0) {
    Write-Host "Worker deploy failed (exit $workerExit)" -ForegroundColor Red
    exit 1
}
Write-Host "  OK Worker deployed" -ForegroundColor Green
Write-Host ""

# [2/2] Vercel (macbook-repair-admin)
Write-Host "[2/2] Deploying Admin Panel..." -ForegroundColor Yellow

$env:VERCEL_TOKEN = $VERCEL_TOKEN

# link to production project
cmd /c "vercel link --yes --project macbook-repair-admin 2>&1"

# deploy
cmd /c "vercel deploy --prod 2>&1"
$vercelExit = $LASTEXITCODE

# restore link to test project
[System.IO.File]::WriteAllText($PROJECT_FILE, $TEST_PROJECT, [System.Text.UTF8Encoding]::new($false))
$env:VERCEL_TOKEN = $null

if ($vercelExit -ne 0) {
    Write-Host "Admin deploy failed (exit $vercelExit)" -ForegroundColor Red
    exit 1
}
Write-Host "  OK Admin Panel deployed" -ForegroundColor Green

Write-Host ""
Write-Host "========================================"
Write-Host "  All done! Production is up to date."
Write-Host "========================================"
Write-Host ""
