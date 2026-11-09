// Read-only, unofficial connector matching Starvios' public web chat queries.
let configPromise;
export async function starviosPublicConfig(fetcher = fetch) {
  if (!configPromise) configPromise = (async () => {
    const page = await fetcher('https://starvios.com/',{signal:AbortSignal.timeout(12000)});
    if (!page.ok) throw Error(`Starvios respondió HTTP ${page.status}.`);
    const html = await page.text();
    const script = [...html.matchAll(/<script[^>]+src=["']([^"']+)/g)]
      .map(m=>m[1]).find(path=>/^\/assets\/index-[\w-]+\.js$/.test(path));
    if (!script) throw Error('Starvios cambió su web. El conector público necesita actualizarse.');
    const response = await fetcher('https://starvios.com'+script,{signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw Error('No se pudo consultar la configuración pública de Starvios.');
    const code = await response.text();
    const url = code.match(/VITE_SUPABASE_URL:\s*[`"']([^`"']+)/)?.[1];
    const key = code.match(/VITE_SUPABASE_PUBLISHABLE_KEY:\s*[`"'](sb_publishable_[\w-]+)/)?.[1];
    const parsed = url && new URL(url);
    if (!key || parsed?.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co'))
      throw Error('Starvios cambió la configuración de su chat público.');
    return {url:parsed.origin,key};
  })().catch(error=>{configPromise=null;throw error;});
  return configPromise;
}
export function starviosMessage(row) {
  if (row.is_deleted || typeof row.body !== 'string' || !row.body.trim() || !row.user_id) return null;
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {id:row.id, user:profile?.username || row.user_id,
    displayName:profile?.display_name || profile?.username || row.user_id, text:row.body};
}
export async function connectStarvios(c,{onMessage,onStatus,fetcher=fetch,config,pollMs=3000} = {}) {
  const abort = new AbortController();
  c.stop = async()=>{abort.abort();clearTimeout(c.timer);};
  const publicConfig = config || await starviosPublicConfig(fetcher);
  const read = async(table,params) => {
    const response = await fetcher(publicConfig.url+'/rest/v1/'+table+'?'+new URLSearchParams(params),{
      headers:{apikey:publicConfig.key},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)]),
    });
    if (!response.ok) throw Error(`Starvios respondió HTTP ${response.status}. El chat debe ser público.`);
    return response.json();
  };
  const profile = (await read('profiles',{select:'id,username,display_name',username:'eq.'+c.channel,limit:'1'}))[0];
  if (!profile) throw Error('No se encontró ese usuario de Starvios. Revisa su @usuario.');
  const stream = (await read('live_streams',{select:'id,status,started_at',channel_id:'eq.'+profile.id,status:'eq.live',order:'started_at.desc',limit:'1'}))[0];
  if (!stream) throw Error('El canal de Starvios no está en directo.');
  const select='id,user_id,body,is_deleted,created_at,profiles:profiles!live_chat_messages_user_id_fkey(username,display_name)';
  const initial = await read('live_chat_messages',{select,stream_id:'eq.'+stream.id,order:'created_at.desc,id.desc',limit:'100'});
  if (c.closed || abort.signal.aborted) return;
  const seen = new Set(initial.map(row=>row.id));
  let cursor=initial[0]?.created_at || new Date().toISOString();
  let lastStatus=Date.now();
  onStatus?.('connected','Leyendo el chat público · conector no oficial');
  const poll = async()=>{
    if (c.closed || abort.signal.aborted) return;
    try {
      if (Date.now()-lastStatus>30000) {
        const state=(await read('live_streams',{select:'status',id:'eq.'+stream.id,limit:'1'}))[0];
        if (!state || state.status!=='live') {onStatus?.('error','El directo de Starvios terminó. Reconecta cuando vuelva a emitir.');return;}
        lastStatus=Date.now();
      }
      const rows=await read('live_chat_messages',{select,stream_id:'eq.'+stream.id,created_at:'gte.'+cursor,order:'created_at.asc,id.asc',limit:'200'});
      if (c.closed || abort.signal.aborted) return;
      for(const row of rows) {
        if (!seen.has(row.id)) {seen.add(row.id);const message=starviosMessage(row);if(message)onMessage?.(message);}
        if (row.created_at>cursor) cursor=row.created_at;
      }
      while(seen.size>1000)seen.delete(seen.values().next().value);
      onStatus?.('connected','Leyendo el chat público · conector no oficial');
      c.timer=setTimeout(poll,pollMs);
    } catch(error) {
      if (!c.closed && !abort.signal.aborted) {onStatus?.('reconnecting',error.message);c.timer=setTimeout(poll,8000);}
    }
  };
  c.timer=setTimeout(poll,pollMs);
}
