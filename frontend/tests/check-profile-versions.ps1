$ErrorActionPreference = 'Stop'
$taskContainer = 'auditionpass-profile-check-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$taskSql = Join-Path ([IO.Path]::GetTempPath()) ($taskContainer + '.sql')
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRepo = Split-Path -Parent $taskRoot
try {
  $taskParts = @(
    [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'profile-versions-prefix.sql')),
    [IO.File]::ReadAllText((Join-Path $taskRepo 'database/migrations/026_profile_versions.sql')),
    [IO.File]::ReadAllText((Join-Path $taskRepo 'database/migrations/027_profile_pdf_storage.sql')),
    [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'profile-versions-assert.sql'))
  )
  [IO.File]::WriteAllText($taskSql, ($taskParts -join "`n"), [Text.UTF8Encoding]::new($false))
  docker run --rm -d --network none --name $taskContainer -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated test container' }
  $taskReady = $false
  for ($taskAttempt = 0; $taskAttempt -lt 30; $taskAttempt++) {
    docker exec $taskContainer pg_isready -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $taskReady = $true; break }
    Start-Sleep -Seconds 1
  }
  if (!$taskReady) { throw 'Test database did not become ready' }
  docker cp $taskSql "${taskContainer}:/tmp/profile-check.sql"
  if ($LASTEXITCODE -ne 0) { throw 'Cannot copy test fixture' }
  docker exec $taskContainer psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/profile-check.sql
  if ($LASTEXITCODE -ne 0) { throw 'Profile version assertions failed' }
} finally {
  # Only the randomly named container and temporary file created above are removed.
  docker stop $taskContainer | Out-Null
  if (Test-Path -LiteralPath $taskSql) { Remove-Item -LiteralPath $taskSql }
}
