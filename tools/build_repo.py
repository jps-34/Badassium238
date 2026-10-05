#!/usr/bin/env python3
"""
Build the PixInsight update repository served from docs/ (GitHub Pages).

  python3 tools/build_repo.py --user <github_user>

Creates, for the current script version:
  docs/Badassium238-<version>-PI194.zip   V8 script, PixInsight 1.9.4 and later
  docs/Badassium238-<version>-PI193.zip   legacy script, PixInsight 1.8.9-3 to 1.9.3
  docs/updates.xri                        repository index (unsigned)

Each archive follows the layout required by PixInsight:
  src/scripts/Badassium238/<script>.js  (+ <script>.xsgn if present next to the .js)
  src/scripts/Badassium238/LICENSE

Order for a signed release:
  1. sign scripts/Badassium238.js and scripts/legacy/Badassium238_PI193.js with
     CodeSign (this creates the .xsgn files next to them);
  2. run this script (the .xsgn files are packed, SHA-1 digests computed);
  3. sign docs/updates.xri with CodeSign (last step: any later change to the
     archives or to updates.xri invalidates the signature);
  4. commit and push.
"""
import argparse, datetime, hashlib, os, re, sys, zipfile
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = "Badassium238"

PACKAGES = [
    {
        "script": "scripts/Badassium238.js",
        "suffix": "PI194",
        "version": "1.9.4:1.9.99",
        "title": "Badassium238 {v} (PixInsight 1.9.4 and later)",
        "desc": "Breaks the SII/Ha two-colour look of SHO images: finds which emission lines end up "
                "with the same hue, then gives each line its own colour (SII red, Ha gold, OIII blue) "
                "by a hue-only rotation at constant luminance, with live preview. The original image is "
                "never modified. Installs under Script > Utilities > Badassium238.",
    },
    {
        "script": "scripts/legacy/Badassium238_PI193.js",
        "suffix": "PI193",
        "version": "1.8.9-3:1.9.3",
        "title": "Badassium238 {v} (PixInsight 1.9.3 and earlier)",
        "desc": "Same tool for the legacy JavaScript engine of PixInsight 1.9.3 and earlier. "
                "Installs under Script > Utilities > Badassium238 PI193.",
    },
]
NOTICE = "Copyright (c) 2026 Jacques Pouyaud. MIT License. Source: https://github.com/{user}/Badassium238"


def script_version(path):
    m = re.search(r'var VERSION\s*=\s*"([^"]+)"', open(path, encoding="utf-8").read())
    if not m:
        sys.exit("VERSION not found in " + path)
    return m.group(1)


def build_zip(pkg, version, outdir):
    src = os.path.join(ROOT, pkg["script"])
    base = os.path.splitext(os.path.basename(src))[0]
    zname = "%s-%s-%s.zip" % (NAME, version, pkg["suffix"])
    zpath = os.path.join(outdir, zname)
    entries = [(src, "src/scripts/%s/%s.js" % (NAME, base)),
               (os.path.join(ROOT, "LICENSE"), "src/scripts/%s/LICENSE" % NAME)]
    sig = os.path.splitext(src)[0] + ".xsgn"
    if os.path.exists(sig):
        entries.append((sig, "src/scripts/%s/%s.xsgn" % (NAME, base)))
    # fixed timestamps: the same sources always give the same archive (and SHA-1)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for f, arc in entries:
            info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, open(f, "rb").read())
    sha1 = hashlib.sha1(open(zpath, "rb").read()).hexdigest()
    return zname, sha1, os.path.exists(sig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", required=True, help="GitHub user name (GitHub Pages host)")
    ap.add_argument("--date", default=datetime.date.today().strftime("%Y%m%d"), help="release date YYYYMMDD")
    a = ap.parse_args()
    server = "https://%s.github.io/%s/" % (a.user, NAME)
    outdir = os.path.join(ROOT, "docs")
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):                      # drop archives from older releases
        if f.startswith(NAME + "-") and f.endswith(".zip"):
            os.remove(os.path.join(outdir, f))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<xri version="1.0">', '   <description>',
             '      <p>Badassium238: per-line colour separation for SHO narrowband images.</p>',
             '      <p>Add %s under Resources &gt; Updates &gt; Manage Repositories.</p>' % escape(server),
             '   </description>']
    for pkg in PACKAGES:
        v = script_version(os.path.join(ROOT, pkg["script"]))
        zname, sha1, signed = build_zip(pkg, v, outdir)
        print("%-34s sha1 %s  %s" % (zname, sha1, "signed" if signed else "UNSIGNED"))
        lines += ['   <platform os="all" arch="noarch" version="%s">' % pkg["version"],
                  '      <package fileName="%s" sha1="%s" type="script" releaseDate="%s" serverURL="%s">'
                  % (zname, sha1, a.date, escape(server)),
                  '         <title>%s</title>' % escape(pkg["title"].format(v=v)),
                  '         <description>',
                  '            <p>%s</p>' % escape(pkg["desc"]),
                  '            <p>%s</p>' % escape(NOTICE.format(user=a.user)),
                  '         </description>',
                  '      </package>',
                  '   </platform>']
    lines.append('</xri>')
    open(os.path.join(outdir, "updates.xri"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("docs/updates.xri written (unsigned): sign it with CodeSign as the very last step.")


if __name__ == "__main__":
    main()
