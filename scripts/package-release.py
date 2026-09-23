import os
import zipfile
import re

ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
OUTPUT_ZIP = os.path.join(ROOT, "output", "SwasthyaSetu-Pilot-Release.zip")

EXCLUDE_DIRS = {
    "node_modules",
    "dist",
    ".git",
    ".gemini",
    ".vite",
    ".temp",
    "coverage",
    ".system_generated"
}

EXCLUDE_EXTS = {
    ".log",
    ".pyc",
    ".env",
    ".tmp"
}

def should_exclude(rel_path):
    parts = rel_path.replace("\\", "/").split("/")
    for p in parts:
        if p in EXCLUDE_DIRS:
            return True
        if p.startswith(".env"):
            return True
    _, ext = os.path.splitext(rel_path)
    if ext in EXCLUDE_EXTS:
        return True
    if rel_path.endswith("SwasthyaSetu-Pilot-Release.zip"):
        return True
    return False

def package():
    target_dirs = ["backend", "frontend", "output"]
    files_to_add = []

    for d in target_dirs:
        dir_path = os.path.join(ROOT, d)
        if not os.path.exists(dir_path):
            continue
        for root, dirs, files in os.walk(dir_path):
            # Prune dirs
            dirs[:] = [dname for dname in dirs if dname not in EXCLUDE_DIRS and not dname.startswith(".env")]
            for f in files:
                abs_f = os.path.join(root, f)
                rel_f = os.path.relpath(abs_f, ROOT).replace("\\", "/")
                if not should_exclude(rel_f):
                    files_to_add.append((abs_f, rel_f))

    # Also add root markdown documents if any
    for f in os.listdir(ROOT):
        abs_f = os.path.join(ROOT, f)
        if os.path.isfile(abs_f) and (f.endswith(".md") or f.endswith(".json") or f.endswith(".sql")):
            rel_f = f
            if not should_exclude(rel_f):
                files_to_add.append((abs_f, rel_f))

    print(f"Adding {len(files_to_add)} files to {OUTPUT_ZIP}...")
    temp_zip = OUTPUT_ZIP + ".tmp"
    with zipfile.ZipFile(temp_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for abs_f, rel_f in sorted(files_to_add, key=lambda x: x[1]):
            zf.write(abs_f, rel_f)

    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)
    os.rename(temp_zip, OUTPUT_ZIP)

    stat = os.stat(OUTPUT_ZIP)
    print(f"Created {OUTPUT_ZIP} successfully: {stat.st_size / (1024*1024):.2f} MB ({stat.st_size} bytes)")

if __name__ == "__main__":
    package()
