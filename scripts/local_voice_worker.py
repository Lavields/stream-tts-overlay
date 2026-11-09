"""Persistent, offline Spanish TTS worker for a user-provided local voice profile."""
import base64
import contextlib
import io
import json
import os
import sys
import wave
from pathlib import Path

profile = Path(os.environ["LUCHO_VOICE_PROFILE"])
model_id = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16"
reference = profile / "referencias" / "referencia_HABLADO_20261002_relato.wav"
transcript = profile / "referencias" / "transcripcion_HABLADO_20261002_relato.txt"
model = None
for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        text = request["text"].strip()
        if not text or len(text) > 650:
            raise ValueError("Invalid text")
        with contextlib.redirect_stdout(sys.stderr):
            import mlx.core as mx
            import numpy as np
            from mlx_audio.tts.utils import load_model
            if model is None:
                model = load_model(model_id)
            chunks = list(model.generate(
                text=text,
                ref_audio=str(reference),
                ref_text=transcript.read_text(encoding="utf-8").strip(),
                lang_code="Spanish", temperature=0.75,
                top_k=50, repetition_penalty=1.5,
            ))
            if not chunks:
                raise RuntimeError("Empty audio")
            audio = np.asarray(mx.concatenate([part.audio for part in chunks], axis=0))
            output = io.BytesIO()
            with wave.open(output, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(model.sample_rate)
                wav.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
            result = {"id":request["id"],"audio":base64.b64encode(output.getvalue()).decode("ascii")}
        print(json.dumps(result), flush=True)
    except Exception as error:
        print(json.dumps({"id":request.get("id"),"error":type(error).__name__}), flush=True)
