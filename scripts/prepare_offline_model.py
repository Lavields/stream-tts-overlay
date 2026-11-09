"""One-time public model download. Speech runtime never downloads or calls APIs."""
from pathlib import Path
import os
import sys
from huggingface_hub import snapshot_download

model_dir = Path(sys.argv[1]).resolve()
snapshot_download("Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    revision="5d83992436eae1d760afd27aff78a71d676296fc",
    local_dir=str(model_dir), token=False,
    allow_patterns=["*.json", "*.txt", "*.safetensors", "speech_tokenizer/*"])
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
print("Modelo descargado. Comprobando que puede cargarse en esta computadora...", flush=True)
import torch
from qwen_tts import Qwen3TTSModel
torch.set_num_threads(min(8, os.cpu_count() or 4))
model = Qwen3TTSModel.from_pretrained(str(model_dir), device_map="cpu",
    dtype=torch.float32, attn_implementation="sdpa")
# Mark ready only after successful loading; a partial download is never advertised as ready.
(model_dir / ".ready").write_text("Qwen3-TTS-12Hz-0.6B-Base\n", encoding="utf-8")
print("Motor local preparado.", flush=True)
