# 오디션패스 SNS 세션 수집기 — 로컬 실행 (플랜 E-8). 작업 스케줄러 "AuditionPass Social" 13:00
# 1회 준비(사용자): powershell -ExecutionPolicy Bypass -File crawler\run_social.ps1 -Login
param([switch]$Login, [switch]$DryRun)
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Py = "C:\Users\jewon\AppData\Local\Programs\Python\Python311\python.exe"
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force $LogDir | Out-Null
Set-Location $Root
$env:PYTHONIOENCODING = "utf-8"
if ($Login) {
  $env:SOCIAL_HEADLESS = "0"
  & $Py -u -m sns_sources.session_browser login
  exit $LASTEXITCODE
}
$Log = Join-Path $LogDir ("social_" + (Get-Date -Format "yyyy-MM-dd_HHmm") + ".log")
"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') SNS 세션 수집 시작 =====" | Out-File $Log -Encoding utf8
$args = @("-u", "-m", "sns_sources.session_browser", "run")
if ($DryRun) { $args += "--dry-run" }
& $Py @args 2>&1 | ForEach-Object { "$_" } | Out-File $Log -Append -Encoding utf8
"===== 종료 코드 $LASTEXITCODE =====" | Out-File $Log -Append -Encoding utf8
Get-ChildItem $LogDir -Filter "social_*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force
exit $LASTEXITCODE
