// Public read-only feed. R2 remains private; uploads are managed separately.
const PACKAGE=/^streamvoice_app-\d+\.\d+\.\d+-full\.nupkg$/;
export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response('Method Not Allowed', {status:405,headers:{Allow:'GET, HEAD'}});
    const path=new URL(request.url).pathname;
    const name=path.startsWith('/') ? path.slice(1) : '';
    if (name!=='RELEASES' && !PACKAGE.test(name)) return new Response('Not Found',{status:404});
    try {
      // Stream the body; packages are larger than a Worker's memory limit.
      const object=request.method==='HEAD' ? await env.RELEASE_BUCKET.head(name) : await env.RELEASE_BUCKET.get(name);
      if (!object) return new Response('Not Found',{status:404});
      const headers=new Headers({
        'Content-Type':name==='RELEASES' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
        'Content-Length':String(object.size),
        'Cache-Control':name==='RELEASES' ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options':'nosniff',
      });
      if(object.httpEtag) headers.set('ETag',object.httpEtag);
      return new Response(request.method==='HEAD'?null:object.body,{status:200,headers});
    } catch {
      return new Response('Temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
};
