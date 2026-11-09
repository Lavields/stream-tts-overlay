"""Isolated recipient deliveries; never copy the developer's .env/.data."""
import argparse, base64, hashlib, json, os, re, shutil, subprocess, sys, tarfile, urllib.request, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'.build-cache'
NODE='22.23.3'
PY_WIN='3.14.8'
PY_MAC='3.13.16'
MAC_URL='https://github.com/astral-sh/python-build-standalone/releases/download/20261013/cpython-3.13.16%2B20261013-aarch64-apple-darwin-install_only_stripped.tar.gz'
MAC_SHA='16a5332fb0dcb77f163fc8f8cbccd95be1644cc53e68e5d2a79f50afd6680a0e'
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''): h.update(chunk)
    return h.hexdigest()
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'streamvoice-builder/1.3'}),timeout=120)
def getjson(url):
    with get(url) as r:return json.load(r)
def download(url,name,digest):
    target=CACHE/name
    if not target.exists() or sha(target)!=digest:
        print('Downloading',name,flush=True)
        temp=target.with_suffix(target.suffix+'.partial')
        with get(url) as r,temp.open('wb') as f:shutil.copyfileobj(r,f)
        if sha(temp)!=digest:raise RuntimeError('Checksum mismatch: '+name)
        temp.replace(target)
    if sha(target)!=digest:raise RuntimeError('Checksum mismatch: '+name)
    return target
def run(*args,**kw):subprocess.run(args,check=True,**kw)
def extract_tar(archive,destination):
    base=destination.resolve()
    with tarfile.open(archive) as t:
        for member in t.getmembers():
            path=(base/member.name).resolve()
            if base not in path.parents or member.isdev() or member.isfifo():raise RuntimeError('Unsafe tar entry')
            if member.issym() or member.islnk():
                target=((path.parent if member.issym() else base)/member.linkname).resolve()
                if target!=base and base not in target.parents:raise RuntimeError('Unsafe tar link')
        if hasattr(tarfile,'data_filter'):t.extractall(destination,filter='data')
        else:t.extractall(destination)
def copy_app(out):
    app=out/'app';app.mkdir(parents=True)
    for name in ['server.mjs','auth.mjs','provision-auth.mjs','resource-utils.mjs','lib.mjs','starvios.mjs','kick-public.mjs','twitch-followers.mjs','edge-tts.mjs','system-voice.mjs','package.json','package-lock.json']:
        shutil.copy2(ROOT/name,app/name)
    shutil.copytree(ROOT/'public',app/'public',ignore=shutil.ignore_patterns('.DS_Store','offline-voices.js','logo-source.png'))
    (app/'scripts').mkdir();shutil.copy2(ROOT/'scripts/edge_tts_bridge.py',app/'scripts/edge_tts_bridge.py')
    (app/'.env.example').write_text('# Optional: enter your own keys in Settings.\nFISH_API_KEY=\nFISH_MODEL=s2.1-pro-free\nELEVENLABS_API_KEY=\nYOUTUBE_API_KEY=\nTWITCH_USERNAME=\nTWITCH_OAUTH_TOKEN=\nKICK_ACCESS_TOKEN=\nKICK_WEBHOOK_READY=false\nEULER_API_KEY=\n')
    run('npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund',cwd=app)
    if list(app.rglob('*.node')):raise RuntimeError('Unexpected native npm binary')
    shutil.copy2(ROOT/'packaging/windows/launcher.mjs',out/'launcher.mjs')
def runtimes(out,target):
    runtime=out/'runtime';runtime.mkdir()
    node_name=f'node-v{NODE}-'+('win-x64.zip' if target=='windows-x64' else 'darwin-arm64.tar.gz')
    node_base=f'https://nodejs.org/dist/v{NODE}/'
    with get(node_base+'SHASUMS256.txt') as r:sums=r.read().decode()
    node_sha=next(line.split()[0] for line in sums.splitlines() if line.endswith('  '+node_name))
    archive=download(node_base+node_name,node_name,node_sha)
    if target=='windows-x64':
        node_dir=runtime/'node';node_dir.mkdir()
        with zipfile.ZipFile(archive) as z:
            for name in ['node.exe','LICENSE']:(node_dir/name).write_bytes(z.read(f'node-v{NODE}-win-x64/{name}'))
        py_name=f'python-{PY_WIN}-embed-amd64.zip';py_base=f'https://www.python.org/ftp/python/{PY_WIN}/'
        record=getjson(py_base+py_name+'.sigstore');py_sha=base64.b64decode(record['messageSignature']['messageDigest']['digest']).hex()
        py_archive=download(py_base+py_name,py_name,py_sha)
        with zipfile.ZipFile(py_archive) as z:z.extractall(runtime/'python')
        (runtime/'python/python314._pth').write_text('python314.zip\n.\nLib/site-packages\nimport site\n')
        shutil.copy2(ROOT/'packaging/windows/INICIAR.cmd',out/'INICIAR.cmd')
        site=runtime/'python/Lib/site-packages';platform='win_amd64';abi='cp314';version='3.14';py_url=py_base+py_name
    else:
        extract_tar(archive,runtime)
        (runtime/f'node-v{NODE}-darwin-arm64').rename(runtime/'node')
        # Runtime only: npm, headers and development files are not needed.
        for name in ['include','lib','share']:
            shutil.rmtree(runtime/'node'/name,ignore_errors=True)
        for name in ['npm','npx','corepack']:
            (runtime/'node/bin'/name).unlink(missing_ok=True)
        for name in ['CHANGELOG.md','README.md']:
            (runtime/'node'/name).unlink(missing_ok=True)
        py_archive=download(MAC_URL,'python-macos-arm64-3.13.16.tar.gz',MAC_SHA)
        extract_tar(py_archive,runtime)
        shutil.copy2(ROOT/'packaging/INICIAR.command',out/'INICIAR.command');(out/'INICIAR.command').chmod(0o755)
        site=runtime/'python/lib/python3.13/site-packages';platform='macosx_11_0_arm64';abi='cp313';version='3.13';py_sha=MAC_SHA;py_url=MAC_URL
    site.mkdir(parents=True,exist_ok=True)
    tools=CACHE/'build-tools'
    if not (tools/'pip').exists():run(sys.executable,'-m','pip','install','--target',str(tools),'pip==25.3')
    env={**os.environ,'PYTHONPATH':str(tools),'PIP_DISABLE_PIP_VERSION_CHECK':'1'}
    wheels=CACHE/f'release-wheels-{target}';wheels.mkdir(exist_ok=True)
    run(sys.executable,'-m','pip','download','--only-binary=:all:','--platform',platform,'--python-version',version,'--implementation','cp','--abi',abi,'--dest',str(wheels),'-r',str(ROOT/'requirements-voices.txt'),env=env)
    manifest=[]
    for wheel in sorted(wheels.glob('*.whl')):
        package,wheel_version=wheel.name.split('-')[:2];release=getjson(f'https://pypi.org/pypi/{package}/{wheel_version}/json')
        digest=next(f['digests']['sha256'] for f in release['urls'] if f['filename']==wheel.name)
        if sha(wheel)!=digest:raise RuntimeError('Wheel checksum mismatch: '+wheel.name)
        with zipfile.ZipFile(wheel) as z:
            for item in z.infolist():
                parts=Path(item.filename).parts
                if item.is_dir():continue
                if '..' in parts or Path(item.filename).is_absolute():raise RuntimeError('Unsafe wheel path')
                if parts[0].endswith('.data'):
                    if parts[1] not in ['purelib','platlib']:raise RuntimeError('Unsupported wheel data')
                    parts=parts[2:]
                dest=site.joinpath(*parts);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(item))
        manifest.append({'file':wheel.name,'sha256':digest})
    return {'node':{'version':NODE,'sha256':node_sha,'source':node_base+node_name},'python':{'version':PY_WIN if target=='windows-x64' else PY_MAC,'sha256':py_sha,'source':py_url},'wheels':manifest}
def main(argv=None):
    parser=argparse.ArgumentParser();parser.add_argument('--target',choices=['windows-x64','macos-arm64'],required=True);parser.add_argument('--accounts',type=Path,required=True,help='Private file of salted recipient hashes, no plaintext passwords')
    args=parser.parse_args(argv);rows=json.loads(args.accounts.read_text())
    if not rows or len({r['username'] for r in rows})!=len(rows):raise RuntimeError('Invalid recipients')
    for row in rows:
        if set(row)!={'username','salt','passwordHash'} or row['username'] not in ['streamer1','streamer2','admin'] or not re.fullmatch('[a-f0-9]{32,}',row['salt']) or not re.fullmatch('[a-f0-9]{128}',row['passwordHash']):raise RuntimeError('Invalid recipient hash')
    version=json.loads((ROOT/'package.json').read_text())['version'];CACHE.mkdir(exist_ok=True)
    policies=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {policies} from './auth.mjs';console.log(JSON.stringify(policies))"],cwd=ROOT))
    staging=CACHE/f'portable-{args.target}-{version}'
    if staging.exists():shutil.rmtree(staging)
    staging.mkdir();copy_app(staging);runtime_manifest=runtimes(staging,args.target)
    destination=ROOT/'dist'/f'entregas-{version}';destination.mkdir(parents=True,exist_ok=True)
    for row in rows:
        name=f'StreamVoice-APP-{args.target}-{row["username"]}-v{version}';out=destination/name
        if out.exists():shutil.rmtree(out)
        shutil.copytree(staging,out,symlinks=True);(out/'app/account-template.json').write_text(json.dumps([row])+'\n')
        allowed=policies[row['username']]['avatars']
        if allowed is not None:
            for image in (out/'app/public/assets/avatars').glob('*.png'):
                avatar=re.sub(r'-(sprites|thumb)\.png$','',image.name)
                if avatar not in allowed:image.unlink()
        guide=(ROOT/'packaging/LEEME.txt').read_text().replace('{{VERSION}}',version).replace('{{USUARIO}}',row['username']).replace('{{SISTEMA}}','Windows 11 x64' if args.target=='windows-x64' else 'macOS Apple Silicon ARM64').replace('{{INICIAR}}','INICIAR.cmd' if args.target=='windows-x64' else 'INICIAR.command')
        (out/'LEEME.txt').write_text(guide)
        if (ROOT/'packaging/NOVEDADES.txt').exists():shutil.copy2(ROOT/'packaging/NOVEDADES.txt',out/'NOVEDADES.txt')
        manifest={'app':'StreamVoice','version':version,'target':args.target,'recipient':row['username'],'includedAvatars':allowed,'personalDataIncluded':False,'providerKeysIncluded':False,'plaintextPasswordsIncluded':False,'recipientPasswordHashIncluded':True,'overlayTokensIncluded':False,'retiredLocalEnginesIncluded':False,**runtime_manifest}
        manifest['files']={str(p.relative_to(out)).replace(os.sep,'/'):sha(p) for p in sorted(out.rglob('*')) if p.is_file()}
        (out/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
        archive=Path(shutil.make_archive(str(destination/name),'zip' if args.target=='windows-x64' else 'gztar',destination,name))
        (destination/(archive.name+'.sha256')).write_text(sha(archive)+'  '+archive.name+'\n');print(f'READY: {archive.name} ({archive.stat().st_size/1048576:.1f} MiB)',flush=True)
if __name__=='__main__':main()
