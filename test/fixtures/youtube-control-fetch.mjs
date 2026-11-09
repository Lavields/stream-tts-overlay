const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'?input:input.url);
 if(url.hostname==='www.googleapis.com'&&url.pathname.endsWith('/youtube/v3/videos')){
  const owner=url.searchParams.get('id')==='aaaaaaaaaaa'?'A':'B';
  return Promise.resolve(Response.json({items:[{snippet:{channelId:'UC'+owner.repeat(22)},liveStreamingDetails:{activeLiveChatId:'test-chat'}}]}));
 }
 if(url.hostname==='www.googleapis.com'&&url.pathname.includes('/youtube/v3/liveChat/messages'))return Promise.resolve(Response.json({items:[],pollingIntervalMillis:30000}));
 return original(input,options);
};
