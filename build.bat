@echo off
echo ========================================
echo Сборка портативной версии Meshtastic Web
echo ========================================

REM Проверяем Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo Ошибка: Node.js не найден!
    echo Установите Node.js 18+ и добавьте в PATH
    pause
    exit /b 1
)

REM Проверяем наличие venv
if not exist "backend\.venv\Scripts\python.exe" (
    echo Ошибка: Виртуальное окружение не найдено!
    echo Создайте его: cd backend ^&^& python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

REM Запускаем скрипт сборки через venv Python
echo Используем Python из backend\.venv
backend\.venv\Scripts\python.exe build_portable.py

if errorlevel 1 (
    echo.
    echo Сборка завершилась с ошибкой!
    pause
    exit /b 1
)

echo.
echo Готово! Файл: dist\MeshtasticWeb.exe
pause
