$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$playwrightScript = Join-Path $projectRoot "node_modules\@playwright\test\cli.js"

$preview = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList @(".\node_modules\vite\bin\vite.js", "preview", "--host", "127.0.0.1", "--port", "4173") `
  -WorkingDirectory $projectRoot `
  -PassThru `
  -WindowStyle Hidden

try {
  $ready = $false

  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    try {
      $response = Invoke-WebRequest `
        -UseBasicParsing `
        -Uri "http://127.0.0.1:4173" `
        -TimeoutSec 1

      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    }
    catch {
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $ready) {
    throw "The local production preview did not become ready."
  }

  & node.exe $playwrightScript test
  $testExitCode = $LASTEXITCODE
}
finally {
  Stop-Process -Id $preview.Id -Force -ErrorAction SilentlyContinue
}

exit $testExitCode
