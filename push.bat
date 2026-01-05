@echo off
echo ===========================================
echo 🚀 Pushing to GitHub (d33vad/social-downloader)...
echo ===========================================

"C:\Program Files\Git\cmd\git.exe" remote remove origin
"C:\Program Files\Git\cmd\git.exe" remote add origin https://github.com/d33vad/social-downloader.git
"C:\Program Files\Git\cmd\git.exe" branch -M main
"C:\Program Files\Git\cmd\git.exe" push -u origin main

echo.
echo ===========================================
echo ✅ If you saw a login popup and signed in, YOU ARE DONE!
echo ❌ If it failed, check if you created the repo on GitHub first.
echo ===========================================
pause
