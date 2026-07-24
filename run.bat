@echo off
echo Starting Backend Server...
start cmd /k "cd backend && pip install -r requirements.txt && uvicorn main:app --reload --host 0.0.0.0 --port 8080"

echo Starting Frontend Server...
start cmd /k "cd frontend && npm install && npm run dev"

echo Both servers are starting in new windows. Please wait a moment for them to initialize!

timeout /t 7
start http://localhost:3001
