@echo off
chcp 65001 >nul
title 오디션패스 런처

REM ── 경로는 박아두지 않고 **이 배치 파일이 있는 폴더**를 기준으로 잡는다.
REM    (%~dp0 = 이 파일의 디렉터리, 끝에 역슬래시 포함)
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

REM ── Claude Code 세션은 Headroom 프록시로 감싸서 띄운다(전역 규칙: 사용량 절감 도구 3종).
REM    --1m 은 쓰지 않는다(헤드룸 --1m 은 모델을 Opus 로 바꾼다, 9/3 실측. 1M 은 settings 의 fable-5-1[1m] 이 준다). Claude 세션 안에서 다시 실행하면 중첩되므로
REM    반드시 이 별도 터미널에서만. headroom은 %%USERPROFILE%%\.local\bin (uv tool) 에 있다.
REM    Ponytail(전역 플러그인)·옵시디언 wiki 훅은 세션 시작 시 자동으로 붙는다.
where headroom >nul 2>&1
if errorlevel 1 (
  echo [오디션패스] headroom 을 못 찾았습니다. 새 터미널에서 PATH 를 확인하세요 ^(%%USERPROFILE%%\.local\bin^).
  start "오디션패스 Claude" cmd /k "cd /d "%ROOT%" && claude"
) else (
  start "오디션패스 Claude (headroom)" cmd /k "cd /d "%ROOT%" && headroom wrap claude --code-memory none --port 8788"
)
exit
