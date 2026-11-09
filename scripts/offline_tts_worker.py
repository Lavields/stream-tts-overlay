"""Generate character speech locally. Never calls a hosted speech API."""
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import wave

root = Path(__file__).resolve().parent.parent
refs = {v["id"]: v for v in json.loads((root / "assets/voice-references/catalog.json").read_text(encoding="utf-8"))}
tuning = json.loads((root / "assets/voice-references/tuning.json").read_text(encoding="utf-8"))
model = None
prompts = {}
audio_cache = {}
cache_bytes = 0
protocol = sys.stdout

def emit(value):
    print(json.dumps(value), file=protocol, flush=True)

def encode_wav(audio, sample_rate):
    import numpy as np
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(sample_rate)
        wav.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    return base64.b64encode(output.getvalue()).decode("ascii")
mlx = os.environ.get("OFFLINE_TTS_ENGINE") == "mlx"
for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        text = request["text"].strip()
        if not text or len(text) > 650:
            raise ValueError("InvalidText")
        ref = refs[request["voice"]]
        key = (request["voice"], text)
        if key in audio_cache:
            parts = audio_cache[key]
            if request.get("stream"):
                for audio in parts:
                    emit({"id": request["id"], "chunk": audio})
                emit({"id": request["id"], "done": True})
            else:
                # Non-stream requests use a single WAV, generated separately.
                if len(parts) == 1:
                    emit({"id": request["id"], "audio": parts[0]})
                    continue
            if request.get("stream"):
                continue
        parts = []
        audio_path = str(root / "assets/voice-references" / ref["file"])
        with contextlib.redirect_stdout(sys.stderr):
            import numpy as np
            if mlx:
                import mlx.core as mx
                from mlx_audio.tts.utils import load_model
                if model is None:
                    model = load_model(os.environ.get("OFFLINE_TTS_MLX_MODEL", "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16"))
                options = tuning.get(request["voice"], {"temperature": 0.75, "top_k": 50, "top_p": 1.0})
                chunks = model.generate(text=text, ref_audio=audio_path, ref_text=ref["text"],
                    lang_code="Spanish", **options, repetition_penalty=1.5,
                    stream=bool(request.get("stream")), streaming_interval=1.0)
                arrays = []
                for part in chunks:
                    audio = np.asarray(part.audio)
                    if not audio.size:
                        continue
                    if request.get("stream"):
                        encoded = encode_wav(audio, model.sample_rate)
                        parts.append(encoded)
                        emit({"id": request["id"], "chunk": encoded})
                    else:
                        arrays.append(audio)
                if not request.get("stream"):
                    audio = np.concatenate(arrays)
                sample_rate = model.sample_rate
            else:
                import torch
                from qwen_tts import Qwen3TTSModel
                if model is None:
                    torch.set_num_threads(min(8, os.cpu_count() or 4))
                    model = Qwen3TTSModel.from_pretrained(os.environ["OFFLINE_TTS_MODEL_DIR"],
                        device_map="cpu", dtype=torch.float32, attn_implementation="sdpa")
                with torch.inference_mode():
                    if request["voice"] not in prompts:
                        prompts[request["voice"]] = model.create_voice_clone_prompt(
                            ref_audio=audio_path, ref_text=ref["text"])
                    wavs, sample_rate = model.generate_voice_clone(text=text, language="Spanish",
                        voice_clone_prompt=prompts[request["voice"]], max_new_tokens=2048)
                audio = np.asarray(wavs[0])
            if not (mlx and request.get("stream")):
                parts = [encode_wav(audio, sample_rate)]
                if request.get("stream"):
                    emit({"id": request["id"], "chunk": parts[0]})
            if not parts:
                raise ValueError("EmptyAudio")
            size = sum(len(part) for part in parts)
            if size < 8 * 1024 * 1024:
                while audio_cache and (len(audio_cache) >= 5 or cache_bytes + size > 8 * 1024 * 1024):
                    old = audio_cache.pop(next(iter(audio_cache)))
                    cache_bytes -= sum(len(part) for part in old)
                previous = audio_cache.pop(key, [])
                cache_bytes -= sum(len(part) for part in previous)
                audio_cache[key] = parts
                cache_bytes += size
            result = {"id": request["id"], "done": True} if request.get("stream") else {"id": request["id"], "audio": parts[0]}
        emit(result)
    except Exception as error:
        emit({"id": request.get("id"), "error": type(error).__name__})
