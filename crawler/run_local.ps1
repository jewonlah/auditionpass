# 오디션패스 크롤러 — 로컬(가정용 IP) 실행 스크립트 (33 §실행 위치 1순위)
# 이유: 필메코·캐스트링크가 데이터센터 IP(GitHub Actions)만 차단 → 이 PC에서 돌리면 정상 (32 §0-1).
# 등록: Windows 작업 스케줄러 "AuditionPass Crawler" (09:00 / 19:00, 절전 해제, 놓치면 가능할 때 실행)
# 수동: powershell -ExecutionPolicy Bypass -File crawler\run_local.ps1
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Py = "C:\Users\jewon\AppData\Local\Programs\Python\Python311\python.exe"   # supabase·playwright 설치된 인터프리터
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force $LogDir | Out-Null
$Log = Join-Path $LogDir ("crawl_" + (Get-Date -Format "yyyy-MM-dd_HHmm") + ".log")

Set-Location $Root
$env:PYTHONIOENCODING = "utf-8"   # cp949 콘솔에서 한글 로그 깨짐 방지
"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 크롤러 시작 (local, $env:COMPUTERNAME) =====" | Out-File $Log -Encoding utf8
# PS 5.1 Tee-Object는 UTF-16으로 쓰므로 Out-File utf8 사용 (grep 가능한 로그)
& $Py -u main.py 2>&1 | ForEach-Object { "$_" } | Out-File $Log -Append -Encoding utf8
"===== 종료 코드 $LASTEXITCODE =====" | Out-File $Log -Append -Encoding utf8

# 인테이크 파이프라인(플랜 38): 크롤 직후 잔여물(이메일·마감 없음) 규칙 재가공 — 비카페 30건/회, LLM 없음
"===== ingest process 시작 =====" | Out-File $Log -Append -Encoding utf8
& $Py -u -m tools.ingest process --limit 30 2>&1 | ForEach-Object { "$_" } | Out-File $Log -Append -Encoding utf8

# 14일 지난 로그 삭제
Get-ChildItem $LogDir -Filter "crawl_*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force
exit $LASTEXITCODE
