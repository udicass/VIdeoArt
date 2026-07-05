$env:Path = 'C:\Program Files\nodejs;' + $env:Path
Set-Location 'C:\Users\udica\OneDrive\Desktop\New folder (2)\gesture-3d'
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
& 'C:\Program Files\nodejs\npm.cmd' install
& 'C:\Program Files\nodejs\npm.cmd' run dev -- --host 0.0.0.0 --port 5173
