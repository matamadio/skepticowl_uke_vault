@echo off
rem ===========================================================================
rem  Aggiorna Skepticowl's song vault: scarica da GitHub, rigenera la lista
rem  delle canzoni dalla cartella Uke e pubblica.
rem  Di solito si lancia da "Aggiorna sito.bat" nella cartella Uke.
rem  Uso diretto: tools\aggiorna.bat "X:\Dropbox\Public\Uke"
rem ===========================================================================

rem "git pull" puo' aggiornare proprio questo file mentre gira: Windows legge
rem i .bat un pezzo alla volta, quindi si esegue una copia temporanea.
if /i not "%~2"=="--copia" (
  copy /y "%~f0" "%TEMP%\skvault-aggiorna.bat" >nul
  call "%TEMP%\skvault-aggiorna.bat" "%~1" --copia "%~dp0.."
  exit /b
)

setlocal
chcp 65001 >nul
set "PYTHONIOENCODING=utf-8"
title Aggiorna Skepticowl's song vault

set "UKE=%~1"
if "%UKE%"=="" set "UKE=X:\Dropbox\Public\Uke"
rem via la barra finale (altrimenti Python legge \" come virgolette)
if "%UKE:~-1%"=="\" set "UKE=%UKE:~0,-1%"
for %%I in ("%~3") do set "REPO=%%~fI"

echo.
echo  Skepticowl's song vault - aggiornamento
echo  Canzoni:     %UKE%
echo  Repository:  %REPO%
echo.

if not exist "%UKE%\" (
  echo  ERRORE: non trovo la cartella delle canzoni.
  goto fine
)
if not exist "%REPO%\tools\build.py" (
  echo  ERRORE: non trovo il repository.
  goto fine
)

rem --- Python e Git ----------------------------------------------------------
set "PY="
where python >nul 2>nul
if not errorlevel 1 set "PY=python"
if not defined PY (
  where py >nul 2>nul
  if not errorlevel 1 set "PY=py"
)
if not defined PY (
  echo  ERRORE: non trovo Python. Installalo da python.org, spuntando "Add python.exe to PATH".
  goto fine
)
where git >nul 2>nul
if errorlevel 1 (
  echo  ERRORE: non trovo Git. Installalo da git-scm.com.
  goto fine
)

cd /d "%REPO%"

echo  [1/4] Scarico gli aggiornamenti da GitHub...
git pull --no-edit
if errorlevel 1 (
  echo.
  echo  ERRORE: "git pull" non e' riuscito. Controlla la connessione,
  echo  oppure apri il repository con GitHub Desktop per vedere cosa non va.
  goto fine
)

echo.
echo  [2/4] Rigenero la lista delle canzoni...
%PY% tools\build.py "%UKE%"
if errorlevel 1 (
  echo.
  echo  ERRORE: il build non e' riuscito, vedi il messaggio qui sopra.
  goto fine
)

echo.
echo  [3/4] Salvo le modifiche...
rem Windows non distingue maiuscole e minuscole: se un file cambia solo di
rem maiuscole (es. "Grateful Dead" -> "Grateful dead") Git non se ne accorge e il
rem sito non lo trova piu'. Si toglie dall'indice tutto songs/ e canzonieri/ e si
rem riaggiunge: Git riprende i nomi esatti dei file sul disco.
git rm -r -q --cached songs canzonieri >nul 2>nul
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo  Nessuna modifica: il sito e' gia' aggiornato.
  goto fine
)
git commit -q -m "Aggiornamento canzoni %date% %time:~0,5%"
if errorlevel 1 (
  echo  ERRORE: il commit non e' riuscito.
  goto fine
)

echo.
echo  [4/4] Pubblico su GitHub...
git push
if errorlevel 1 (
  echo.
  echo  ERRORE: "git push" non e' riuscito. Le modifiche sono salvate sul PC:
  echo  rilancia questo file quando la connessione funziona.
  goto fine
)

echo.
echo  FATTO! Il sito si aggiorna da solo in un paio di minuti:
echo  https://matamadio.github.io/skepticowl_uke_vault/

:fine
echo.
pause
endlocal
