$git = "C:\Program Files\Git\bin\git.exe"
$env:Path += ";C:\Program Files\Git\bin"
Set-Location "D:\proyecto\transcribeai"
& $git config --global --add safe.directory D:/proyecto/transcribeai
& $git config user.email "abimeletchlopez@gmail.com"
& $git config user.name "TranscribeAI"
& $git add .
& $git commit -m "TranscribeAI - Plataforma de transcripcion con IA"
& $git remote add origin https://github.com/abimeletchlopez/transcribeai.git 2>$null
& $git branch -M main
& $git push -u origin main