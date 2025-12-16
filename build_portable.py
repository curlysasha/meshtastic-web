#!/usr/bin/env python3
"""
Скрипт сборки портативной версии Meshtastic Web Interface.

Требования:
- Python 3.10+
- Node.js 18+
- PyInstaller: pip install pyinstaller

Использование:
    python build_portable.py
"""

import subprocess
import shutil
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_DIR = ROOT_DIR / "backend"
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"


def run_command(cmd: list, cwd: Path = None):
    """Выполняет команду и проверяет результат."""
    print(f">>> {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, shell=sys.platform == "win32")
    if result.returncode != 0:
        print(f"Ошибка выполнения: {' '.join(cmd)}")
        sys.exit(1)


def clean():
    """Очистка предыдущих сборок."""
    print("\n=== Очистка ===")
    for path in [DIST_DIR, BUILD_DIR, FRONTEND_DIR / "dist", BACKEND_DIR / "static"]:
        if path.exists():
            print(f"Удаляю {path}")
            shutil.rmtree(path)


def build_frontend():
    """Сборка React frontend."""
    print("\n=== Сборка Frontend ===")

    # Установка зависимостей
    run_command(["npm", "install"], cwd=FRONTEND_DIR)

    # Сборка production версии
    run_command(["npm", "run", "build"], cwd=FRONTEND_DIR)

    # Копирование в backend/static
    src = FRONTEND_DIR / "dist"
    dst = BACKEND_DIR / "static"
    print(f"Копирую {src} -> {dst}")
    shutil.copytree(src, dst)


def build_backend():
    """Сборка Python backend с PyInstaller."""
    print("\n=== Сборка Backend ===")

    # Проверяем PyInstaller
    try:
        import PyInstaller
    except ImportError:
        print("PyInstaller не установлен. Устанавливаю...")
        # Пробуем uv (если окружение создано через uv)
        try:
            run_command(["uv", "pip", "install", "pyinstaller"], cwd=BACKEND_DIR)
        except Exception:
            # Fallback на обычный pip
            run_command([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # Используем spec файл для сборки
    spec_file = BACKEND_DIR / "MeshtasticWeb.spec"

    run_command([
        sys.executable, "-m", "PyInstaller",
        "--clean",
        "--distpath", str(DIST_DIR),
        "--workpath", str(BUILD_DIR),
        str(spec_file)
    ], cwd=BACKEND_DIR)


def copy_data_files():
    """Копирование дополнительных файлов."""
    print("\n=== Копирование дополнительных файлов ===")

    # Копируем static в dist (рядом с exe)
    static_src = BACKEND_DIR / "static"
    static_dst = DIST_DIR / "static"
    if static_src.exists():
        print(f"Копирую {static_src} -> {static_dst}")
        shutil.copytree(static_src, static_dst)


def create_readme():
    """Создание README для портативной версии."""
    readme = DIST_DIR / "README.txt"
    readme.write_text("""
Meshtastic Web Interface - Портативная версия
=============================================

Запуск:
1. Запустите MeshtasticWeb.exe
2. Браузер откроется автоматически на http://localhost:8000
3. Подключите Meshtastic ноду по Serial или TCP

Примечания:
- База данных (SQLite) сохраняется в текущей папке
- Закройте консоль для остановки сервера
- Порт 8000 должен быть свободен

Поддержка: https://github.com/your-repo/meshtastic-web
""", encoding="utf-8")
    print(f"Создан {readme}")


def main():
    print("=" * 50)
    print("Сборка портативной версии Meshtastic Web Interface")
    print("=" * 50)

    clean()
    build_frontend()
    build_backend()
    copy_data_files()
    create_readme()

    print("\n" + "=" * 50)
    print("Сборка завершена!")
    print(f"Результат: {DIST_DIR / 'MeshtasticWeb.exe'}")
    print("=" * 50)


if __name__ == "__main__":
    main()
