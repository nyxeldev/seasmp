Set-Location $PSScriptRoot
.\venv\Scripts\celery.exe -A src.tasks.celery_app.celery worker --loglevel=info
