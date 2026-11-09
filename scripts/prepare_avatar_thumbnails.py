"""Small previews only; original four-frame sprites stay byte-for-byte intact."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / 'public/assets/avatars'
for path in sorted(root.glob('*-sprites.png')):
    with Image.open(path) as image:
        frame = image.crop((0, 0, image.width // 2, image.height // 2))
        frame.resize((160, 160), Image.Resampling.LANCZOS).save(
            path.with_name(path.name.replace('-sprites.png', '-thumb.png')), optimize=True)
