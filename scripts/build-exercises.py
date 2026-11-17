"""Build data/exercises.json from free-exercise-db (Unlicense).
Usage: python3 scripts/build-exercises.py data/exercises.raw.json data/exercises.json
"""
import json, os, sys
src, dst = sys.argv[1], sys.argv[2]
# الترجمة العربية لأسماء التمارين (يحررها الإنسان في data/names-ar.json)
AR = json.load(open(os.path.join(os.path.dirname(dst), "names-ar.json"), encoding="utf-8"))
out = []
for e in json.load(open(src, encoding="utf-8")):
    out.append({
        "id": e["id"], "name": e["name"], "ar": AR.get(e["name"], ""),
        "primary": e.get("primaryMuscles") or [],
        "secondary": e.get("secondaryMuscles") or [],
        "equipment": e.get("equipment") or "other",
        "category": e.get("category"), "level": e.get("level"),
        "mechanic": e.get("mechanic"),
        "images": len(e.get("images") or []),
        "instructions": e.get("instructions") or [],
    })
out.sort(key=lambda x: x["name"].lower())
json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "exercises")
