"""Prepare a verified standalone Python and Edge TTS wheels for Intel Macs."""
import os, shutil, subprocess, sys, zipfile
from pathlib import Path
from build_portable import ROOT, CACHE, download, extract_tar, getjson, sha

URL='https://github.com/astral-sh/python-build-standalone/releases/download/20261013/cpython-3.13.16%2B20261013-x86_64-apple-darwin-install_only_stripped.tar.gz'
DIGEST='f507ae04eb7747cd97cb484e8c5d83936cbfc52d9b08a1f35c00b47c707b1ae1'
DEST=CACHE/'desktop-runtime-darwin-x64'
ready=DEST/'.ready'
if ready.exists():
    print('Python Intel preparado',flush=True)
    raise SystemExit(0)
if DEST.exists(): shutil.rmtree(DEST)
(DEST/'runtime').mkdir(parents=True)
archive=download(URL,'python-macos-x64-3.13.16.tar.gz',DIGEST)
extract_tar(archive,DEST/'runtime')
site=DEST/'runtime/python/lib/python3.13/site-packages'
site.mkdir(parents=True,exist_ok=True)
wheels=CACHE/'release-wheels-macos-x64';wheels.mkdir(exist_ok=True)
tools=CACHE/'build-tools'
if not (tools/'pip').exists(): subprocess.run([sys.executable,'-m','pip','install','--target',str(tools),'pip==25.3'],check=True)
env={**os.environ,'PYTHONPATH':str(tools),'PIP_DISABLE_PIP_VERSION_CHECK':'1'}
args=[sys.executable,'-m','pip','download','--only-binary=:all:','--python-version','3.13','--implementation','cp','--abi','cp313','--dest',str(wheels)]
for platform in ['macosx_10_13_x86_64','macosx_10_15_x86_64','macosx_11_0_x86_64','macosx_12_0_x86_64']:
    args.extend(['--platform',platform])
subprocess.run(args+['-r',str(ROOT/'requirements-voices.txt')],env=env,check=True)
for wheel in sorted(wheels.glob('*.whl')):
    package,version=wheel.name.split('-')[:2]
    release=getjson(f'https://pypi.org/pypi/{package}/{version}/json')
    digest=next(item['digests']['sha256'] for item in release['urls'] if item['filename']==wheel.name)
    if sha(wheel)!=digest: raise RuntimeError('Checksum mismatch: '+wheel.name)
    with zipfile.ZipFile(wheel) as archive:
        for item in archive.infolist():
            if item.is_dir(): continue
            parts=Path(item.filename).parts
            if '..' in parts or Path(item.filename).is_absolute(): raise RuntimeError('Unsafe wheel path')
            if parts[0].endswith('.data'):
                if parts[1] not in ['purelib','platlib']: raise RuntimeError('Unsupported wheel data')
                parts=parts[2:]
            target=site.joinpath(*parts);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(item))
ready.write_text('Python 3.13.16 x86_64 con Edge TTS\n')
print('Python Intel preparado',flush=True)
