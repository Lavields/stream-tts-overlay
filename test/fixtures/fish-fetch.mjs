const realFetch = globalThis.fetch;
let recoverAttempts = 0;
globalThis.fetch = async (url, options) => {
  if (String(url) !== "https://api.fish.audio/v1/tts")
    return realFetch(url, options);
  const data = JSON.parse(options.body);
  if (data.text === "unavailable") return new Response("{}", { status: 503 });
  if (data.text === "recover" && ++recoverAttempts === 1) return new Response("{}", { status: 503 });
  if (data.text === "limited") return new Response("{}", { status: 429 });
  if (options.headers.model === "s2.1-pro" || data.text === "quota")
    return new Response("{}", { status: 402 });
  if (data.text === "auth") return new Response("{}", { status: 401 });
  if (
    options.headers.model !== "s2.1-pro-free" ||
    !data.reference_id ||
    data.normalize !== false
  )
    return new Response("{}", { status: 400 });
  return new Response(Buffer.from("ID3mock-speech:"+data.text), {
    headers: { "Content-Type": "audio/mpeg" },
  });
};
