param(
    [switch]$Local,
    [switch]$Dev,
    [int]$FrontendPort = 3000,
    [int]$BackendPort = 8000
)

function Test-Docker {
    try {
        Get-Command docker -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Host "Taskly runner starting..." -ForegroundColor Cyan

# Prefer Docker Compose unless -Local is provided or docker is missing
if (-not $Local -and (Test-Docker)) {
    Push-Location $PSScriptRoot
    try {
        if ($Dev) {
            Write-Host "Using Dev Compose (hot reload)" -ForegroundColor Green
            docker compose -f "$PSScriptRoot\docker-compose.dev.yml" up -d
            Write-Host "\nDev services are starting in background:" -ForegroundColor Green
            Write-Host "- Frontend (Vite): http://localhost:5173"
            Write-Host "- Backend (Uvicorn): http://localhost:$BackendPort"
            Write-Host "\nFollow logs: docker compose -f docker-compose.dev.yml logs -f"
            Write-Host "Stop services: docker compose -f docker-compose.dev.yml down"
        } else {
            Write-Host "Using Docker Compose to build and run services" -ForegroundColor Green
            docker compose up --build -d
            Write-Host "\nServices are starting in background:" -ForegroundColor Green
            Write-Host "- Frontend: http://localhost:$FrontendPort"
            Write-Host "- Backend:  http://localhost:$BackendPort"
            Write-Host "\nFollow logs: docker compose logs -f"
            Write-Host "Stop services: docker compose down"
        }
    } finally {
        Pop-Location
    }
    exit 0
}

Write-Host "Docker not available or -Local specified. Running locally." -ForegroundColor Yellow

# --- Backend (FastAPI) ---
$backendRoot = Join-Path $PSScriptRoot "backend"
$venvPath = Join-Path $backendRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

Push-Location $backendRoot
try {
    if (-not (Test-Path $venvPath)) {
        Write-Host "Creating Python virtual environment" -ForegroundColor Green
        py -3 -m venv ".venv"
    }
    if (-not (Test-Path $venvPython)) {
        throw "Virtual environment not created successfully at $venvPath"
    }

    Write-Host "Installing backend dependencies" -ForegroundColor Green
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r "requirements.txt"

    $firebaseCreds = Join-Path $backendRoot "firebase-credentials.json"
    if (-not (Test-Path $firebaseCreds)) {
        Write-Warning "Missing backend\\firebase-credentials.json. Notifications may be disabled."
    }

    Write-Host "Starting FastAPI (uvicorn) on port $BackendPort" -ForegroundColor Green
    $backendCmd = "$venvPython -m uvicorn app.main:app --reload --port $BackendPort"
    Start-Job -Name "taskly-backend" -ScriptBlock {
        param($cmd, $wd)
        $env:PYTHONPATH = $wd
        Push-Location $wd
        try { Invoke-Expression $cmd } finally { Pop-Location }
    } -ArgumentList $backendCmd, $backendRoot | Out-Null
} finally {
    Pop-Location
}

# --- Frontend (Vite dev server) ---
$frontendRoot = Join-Path $PSScriptRoot "frontend"
Push-Location $frontendRoot
try {
    Write-Host "Installing frontend dependencies" -ForegroundColor Green
    if (Test-Path "package-lock.json") { npm ci } else { npm install }

    $env:VITE_API_URL = "http://localhost:$BackendPort"
    Write-Host "Starting Vite dev server on port $FrontendPort" -ForegroundColor Green
    $devCmd = "npm run dev -- --port $FrontendPort"
    Start-Job -Name "taskly-frontend" -ScriptBlock {
        param($cmd, $wd, $apiUrl)
        $env:VITE_API_URL = $apiUrl
        Push-Location $wd
        try { Invoke-Expression $cmd } finally { Pop-Location }
    } -ArgumentList $devCmd, $frontendRoot, "http://localhost:$BackendPort" | Out-Null
} finally {
    Pop-Location
}

Write-Host "\nAll set!" -ForegroundColor Cyan
Write-Host "- Frontend: http://localhost:$FrontendPort"
Write-Host "- Backend:  http://localhost:$BackendPort"
Write-Host "\nView logs: Receive-Job taskly-backend; Receive-Job taskly-frontend"
Write-Host "Stop jobs: Get-Job | Remove-Job"