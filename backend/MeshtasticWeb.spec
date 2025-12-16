# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = [('static', 'static')]
binaries = []
hiddenimports = [
    'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
    'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan', 'uvicorn.lifespan.on',
    'meshtastic', 'meshtastic.serial_interface', 'meshtastic.tcp_interface',
    'aiosqlite', 'websockets', 'websockets.legacy', 'websockets.legacy.server',
]

# Collect meshtastic
tmp_ret = collect_all('meshtastic')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# Collect aiosqlite
hiddenimports += collect_submodules('aiosqlite')


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='MeshtasticWeb',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
