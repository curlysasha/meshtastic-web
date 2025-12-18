import aiosqlite
import asyncio
import sys
from typing import Optional
from pathlib import Path

# Определяем путь к базе данных (рядом с exe или рядом со скриптом)
if getattr(sys, 'frozen', False):
    # Запущено как exe — база рядом с exe
    DB_PATH = Path(sys.executable).parent / "meshtastic.db"
else:
    # Запущено как скрипт
    DB_PATH = Path(__file__).parent / "meshtastic.db"

_db: Optional[aiosqlite.Connection] = None
_lock = asyncio.Lock()


async def get_db() -> aiosqlite.Connection:
    global _db
    async with _lock:
        if _db is None:
            _db = await aiosqlite.connect(DB_PATH)
            _db.row_factory = aiosqlite.Row
        return _db


async def close_db():
    global _db
    async with _lock:
        if _db:
            await _db.close()
            _db = None


async def init_db():
    db = await get_db()
    await db.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            packet_id INTEGER,
            sender TEXT NOT NULL,
            receiver TEXT,
            channel INTEGER DEFAULT 0,
            text TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            ack_status TEXT DEFAULT 'pending',
            is_outgoing INTEGER DEFAULT 0,
            reply_id INTEGER
        )
    """)
    # Add reply_id column if it doesn't exist (migration)
    try:
        await db.execute("ALTER TABLE messages ADD COLUMN reply_id INTEGER")
    except:
        pass

    await db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender, receiver)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_packet_id ON messages(packet_id)
    """)
    await db.execute("""
        CREATE INDEX IF NOT EXISTS idx_messages_reply_id ON messages(reply_id)
    """)
    await db.commit()


async def save_message(
    packet_id: Optional[int],
    sender: str,
    receiver: Optional[str],
    channel: int,
    text: str,
    is_outgoing: bool = False,
    ack_status: str = "pending",
    reply_id: Optional[int] = None
) -> int:
    db = await get_db()
    cursor = await db.execute(
        """INSERT INTO messages (packet_id, sender, receiver, channel, text, is_outgoing, ack_status, reply_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (packet_id, sender, receiver, channel, text, int(is_outgoing), ack_status, reply_id)
    )
    await db.commit()
    return cursor.lastrowid


async def update_message_ack(packet_id: int, ack_status: str):
    db = await get_db()
    await db.execute(
        "UPDATE messages SET ack_status = ? WHERE packet_id = ?",
        (ack_status, packet_id)
    )
    await db.commit()


async def get_messages(
    channel: Optional[int] = None,
    dm_partner: Optional[str] = None,
    my_node_id: Optional[str] = None,
    limit: int = 100
):
    db = await get_db()
    if dm_partner and my_node_id:
        cursor = await db.execute(
            """SELECT * FROM messages
               WHERE channel = 0 AND (
                   (sender = ? AND receiver = ?) OR
                   (sender = ? AND receiver = ?)
               )
               ORDER BY timestamp DESC LIMIT ?""",
            (my_node_id, dm_partner, dm_partner, my_node_id, limit)
        )
    elif dm_partner:
        cursor = await db.execute(
            """SELECT * FROM messages
               WHERE (sender = ? OR receiver = ?) AND channel = 0
               ORDER BY timestamp DESC LIMIT ?""",
            (dm_partner, dm_partner, limit)
        )
    elif channel is not None:
        cursor = await db.execute(
            "SELECT * FROM messages WHERE channel = ? ORDER BY timestamp DESC LIMIT ?",
            (channel, limit)
        )
    else:
        cursor = await db.execute(
            "SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?",
            (limit,)
        )
    rows = await cursor.fetchall()
    return [dict(row) for row in reversed(rows)]


async def save_setting(key: str, value: str):
    db = await get_db()
    await db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, value)
    )
    await db.commit()


async def get_setting(key: str) -> Optional[str]:
    db = await get_db()
    cursor = await db.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = await cursor.fetchone()
    return row[0] if row else None
