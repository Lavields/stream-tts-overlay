import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../updates/worker/worker.mjs';
const entries={'RELEASES':'abc','streamvoice_app-1.8.14-full.nupkg':'paquete'};
const env={RELEASE_BUCKET:{
 async head(key){return key in entries?{size:entries[key].length,httpEtag:'"test"'}:null},
 async get(key){return key in entries?{size:entries[key].length,httpEtag:'"test"',body:entries[key]}:null}
}};
const req=(path,method='GET')=>new Request('https://example.workers.dev/'+path,{method});
test('el canal sirve índice y paquetes conocidos sin guardar el índice en caché',async()=>{
 const index=await worker.fetch(req('RELEASES?x=1'),env);
 assert.equal(index.status,200);assert.equal(await index.text(),'abc');assert.equal(index.headers.get('cache-control'),'no-store');
 const pack=await worker.fetch(req('streamvoice_app-1.8.14-full.nupkg'),env);assert.equal(await pack.text(),'paquete');assert.equal(pack.headers.get('content-length'),'7');
 const head=await worker.fetch(req('RELEASES','HEAD'),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('el canal no expone rutas no autorizadas ni operaciones de escritura',async()=>{
 for(const path of ['.env','credentials.bin','streamvoice_pruebas-1.8.14-full.nupkg','dir/RELEASES','streamvoice_app-1.8.15-full.nupkg']) assert.equal((await worker.fetch(req(path),env)).status,404);
 const denied=await worker.fetch(req('RELEASES','PUT'),env);assert.equal(denied.status,405);assert.equal(denied.headers.get('allow'),'GET, HEAD');
 const broken=await worker.fetch(req('RELEASES'),{RELEASE_BUCKET:{get:async()=>{throw Error('privado')}}});assert.equal(broken.status,503);assert.equal(await broken.text(),'Temporarily unavailable');
});
