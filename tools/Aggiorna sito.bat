@echo off
rem ===========================================================================
rem  Doppio clic per aggiornare Skepticowl's song vault con le canzoni di
rem  questa cartella. Va copiato nella cartella Uke (es. X:\Dropbox\Public\Uke).
rem  Se il repository sul PC e' in un'altra cartella, correggi la riga REPO.
rem ===========================================================================
set "REPO=C:\Users\matti\Documents\GitHub\skepticowl_uke_vault"

if not exist "%REPO%\tools\aggiorna.bat" (
  echo.
  echo  Non trovo il repository in:
  echo  %REPO%
  echo  Apri questo file con il Blocco note ^(tasto destro, Modifica^) e correggi la riga REPO.
  echo.
  pause
  exit /b 1
)
call "%REPO%\tools\aggiorna.bat" "%~dp0"
