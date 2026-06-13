; Close any running LS Music before installing/updating so NSIS can replace
; files (the app hides to the tray, so it may still be running on update).
!macro customInit
  nsExec::Exec 'taskkill /F /IM "LS Music.exe" /T'
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "LS Music.exe" /T'
!macroend
