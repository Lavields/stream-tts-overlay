"""Read a JSON request from stdin and write only MP3 bytes to stdout."""
import asyncio
import json
import sys
import edge_tts
import aiohttp
from edge_tts import communicate as edge_protocol
from edge_tts.constants import TRUSTED_CLIENT_TOKEN

# Edge migrated Read Aloud in October 2026; edge-tts 7.2.8 still uses
# the retired Bing WebSocket. See Readest's current libs/edgeTTS.ts.
edge_protocol.WSS_URL = (
    "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1"
    "?Ocp-Apim-Subscription-Key=" + TRUSTED_CLIENT_TOKEN
)

async def main():
    request = json.load(sys.stdin)
    voice = request["voice"]
    if not voice.startswith("es-") or len(request["text"]) > 650:
        raise ValueError("Invalid Spanish speech request")
    speed = max(0.7, min(1.5, float(request.get("speed", 1))))
    rate = round((speed - 1) * 100)
    async for chunk in edge_tts.Communicate(request["text"], voice, rate=f"{rate:+d}%").stream():
        if chunk["type"] == "audio":
            sys.stdout.buffer.write(chunk["data"])
    sys.stdout.buffer.flush()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (edge_tts.exceptions.NoAudioReceived, edge_tts.exceptions.WebSocketError, aiohttp.ClientError, asyncio.TimeoutError):
        # Machine-readable transient status, without URLs or provider details.
        sys.exit(75)
