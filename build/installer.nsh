; The app hides to the tray, so on update it may still be running and lock its
; files. Override electron-builder's default "app is running" check (which pops
; the "please close the application / Retry" dialog) and just force-kill it.

!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /IM "LS Music.exe" /T'
  Sleep 1500
!macroend

!macro customInit
  nsExec::Exec 'taskkill /F /IM "LS Music.exe" /T'
  Sleep 800
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "LS Music.exe" /T'
  Sleep 800
!macroend
