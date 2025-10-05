# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['gui.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tensorflow', 'torch', 'pyside6', 'matplotlib', 'pandas'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

app = BUNDLE(
    exe := EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name='diruelei-macos',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
        disable_windowed_traceback=False,
        argv_emulation=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
    ),
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    name='diruelei-macos.app',
    bundle_identifier=None,
)
