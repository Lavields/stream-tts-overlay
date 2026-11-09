// Exercise the real OBS overlay using isolated credentials and a temporary Chrome profile.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {authFixture} from '../test/auth-fixture.mjs';
const root=new URL('../',import.meta.url),fixture=await authFixture();
const base='http://127.0.0.1:14332';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,profile,ws;
try{
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'14332',AUTH_ACCOUNTS_FILE:fixture.path,FISH_API_KEY:'',ELEVENLABS_API_KEY:'',YOUTUBE_API_KEY:'',KICK_ACCESS_TOKEN:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),sleep(5000).then(()=>{throw Error('El servidor no inició');})]);
  profile=await mkdtemp(join(tmpdir(),'streamvoice-overlay-layout-'));
  chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--autoplay-policy=no-user-gesture-required','--mute-audio','--window-size=1440,1100','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let port;
  for(let i=0;i<100;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await sleep(100);}
  if(!port)throw Error('Chrome no inició');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');
  let id=0;const pending=new Map(),errors=[];
  ws.on('message',bytes=>{const m=JSON.parse(bytes);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});ws.send(JSON.stringify({id:requestId,method,params}));});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Esperando '+expression);};
  await cdp('Runtime.enable');await cdp('Page.enable');
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-password'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const account=await(await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).json();
  const messages=[
    {name:'breve',user:'Comunidad',text:'Hola, comunidad. ¿Cómo están hoy?'},
    {name:'largo-55-palabras',user:'Usuario_con_un_nombre_muy_largo_'.repeat(3),text:Array.from({length:55},(_,i)=>['extraordinariamente','interesantísimo','acompañándonos','internacionalmente','conversaciones'][i%5]).join(' ')},
    {name:'sin-espacios',user:'U'.repeat(100),text:'https://ejemplo.com/'+ 'abcdefghij'.repeat(65)},
  ];
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp('Page.navigate',{url:base+account.overlayUrl});
  await until('Boolean(document.querySelector("#overlay-text"))');
  const cases=[];
  for(const [width,height]of [[1920,1080],[1280,720],[800,600],[640,360],[360,640],[600,600],[1080,1920]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    for(const message of messages){
      for(let i=0;i<5;i++){
        const response=await fetch(base+'/api/overlay',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({avatar:'cat-calvo',...message,level:.5,speaking:true})});
        assert.equal(response.status,200);await sleep(120);
        if(await evaluate(`document.querySelector('#overlay-text').textContent===${JSON.stringify(message.text)}`))break;
      }
      await until(`document.querySelector('#overlay-text').textContent===${JSON.stringify(message.text)}`);
      const result=await evaluate(`(()=>{const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight};};return {caption:box('.overlay-caption'),text:box('#overlay-text'),user:box('#overlay-user'),avatar:box('#overlay-avatar'),fontSize:getComputedStyle(document.querySelector('#overlay-text')).fontSize};})()`);
      const inside=b=>b.x>=-1&&b.y>=-1&&b.right<=width+1&&b.bottom<=height+1;
      const noOverflow=b=>b.scrollWidth<=b.clientWidth+1&&b.scrollHeight<=b.clientHeight+1;
      const textInside=result.text.x>=result.caption.x&&result.text.right<=result.caption.right+1&&result.text.y>=result.caption.y&&result.text.bottom<=result.caption.bottom+1;
      // The bubble's decorative tail may extend beyond its client height.
      const passed=inside(result.caption)&&inside(result.avatar)&&inside(result.user)&&inside(result.text)&&result.caption.scrollWidth<=result.caption.clientWidth+1&&noOverflow(result.text)&&noOverflow(result.user)&&textInside;
      cases.push({width,height,message:message.name,passed,...result});
      console.log(`${width}x${height} ${message.name}: ${passed?'OK':'DESBORDA'} (${result.fontSize})`);
      if(message.name==='largo-55-palabras'&&[1920,640,360].includes(width)){
        const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        await writeFile(new URL(`docs/overlay-long-${width}x${height}${process.argv.includes('--baseline')?'-before':''}.png`,root),Buffer.from(shot.data,'base64'));
      }
    }
  }
  assert.deepEqual(errors,[]);
  const report={date:'2026-10-27',scope:'Overlay real con SSE, Chrome y cuenta temporal; texto máximo de 55 palabras largas, texto sin espacios y nombre de 100 caracteres',cases,failures:cases.filter(c=>!c.passed).length,browserErrors:errors};
  await writeFile(new URL('docs/overlay-layout'+(process.argv.includes('--baseline')?'-before':'')+'.json',root),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({cases:cases.length,failures:report.failures}));
  if(report.failures&&!process.argv.includes('--baseline'))process.exitCode=1;
}finally{
  ws?.close();
  for(const child of [chrome,server])if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  if(profile)await rm(profile,{recursive:true,force:true});
  await fixture.cleanup();
}
