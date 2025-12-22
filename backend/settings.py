import sys
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_path: Optional[str] = None


settings = Settings()


def get_db_path() -> Path:
    """
    Возвращает путь к базе данных.
    Приоритет:
    1. Значение из DATABASE_PATH (если указано)
    2. Рядом с исполняемым файлом (если приложение заморожено, например PyInstaller)
    3. Рядом с текущим Python-файлом
    """
    if settings.database_path is not None:
        return Path(settings.database_path).expanduser().resolve()

    if getattr(sys, "frozen", False):
        # Замороженное приложение (exe)
        return Path(sys.executable).parent / "meshtastic.db"
    else:
        # Обычный запуск скрипта
        return Path(__file__).parent / "meshtastic.db"


DB_PATH = get_db_path()
