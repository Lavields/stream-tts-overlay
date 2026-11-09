// Redirige solo el WebSocket de server.mjs a un IRC de prueba local.
import {registerHooks} from 'node:module';
registerHooks({
  resolve(specifier,context,next){
    if(specifier==='ws'&&context.parentURL?.endsWith('/server.mjs'))return {url:new URL('./twitch-ws-client.mjs',import.meta.url).href,shortCircuit:true};
    return next(specifier,context);
  },
});
