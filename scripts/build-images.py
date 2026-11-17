"""Pack exercise images into same-origin JSON chunks (data URIs) so the app
works where external images are blocked and offline.
Usage: python3 scripts/build-images.py <raw_images_dir> data/exercises.json data/img
  thumbs/<muscle>.json : {id: dataURI}            (frame 0, 300px — used by grid/cards/list views)
  full/<n>.json        : {id: [dataURI, dataURI]} (both frames, ~16 exercises per file)
"""
import base64, io, json, os, sys, zlib
from PIL import Image

raw, db_path, out = sys.argv[1:4]
exs = json.load(open(db_path, encoding="utf-8"))
FULL_CHUNKS = 64

def enc(path, width, q):
    im = Image.open(path).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, "JPEG", quality=q, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()

def chunk_of(ex_id):
    return zlib.crc32(ex_id.encode()) % FULL_CHUNKS

thumbs, full = {}, {}
for e in exs:
    frames = [os.path.join(raw, e["id"], f"{i}.jpg") for i in range(e["images"])]
    frames = [f for f in frames if os.path.exists(f)]
    if not frames:
        continue
    key = (e["primary"] or ["other"])[0]
    thumbs.setdefault(key, {})[e["id"]] = enc(frames[0], 300, 58)
    full.setdefault(chunk_of(e["id"]), {})[e["id"]] = [enc(f, 400, 62) for f in frames]

for sub, data in (("thumbs", thumbs), ("full", full)):
    os.makedirs(os.path.join(out, sub), exist_ok=True)
    for k, v in data.items():
        json.dump(v, open(os.path.join(out, sub, f"{str(k).replace(' ', '_')}.json"), "w"), separators=(",", ":"))
print("thumbs", len(thumbs), "full", len(full))
