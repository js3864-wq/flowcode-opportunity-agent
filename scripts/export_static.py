"""
Export the watchlist and every report into one self-contained HTML page (dist/index.html).

  STATIC_DATES=1 npm run build && STATIC_DATES=1 npm run start     # in one terminal
  python3 scripts/export_static.py http://localhost:3000            # in another

STATIC_DATES=1 makes the app print fixed dates ("Nov 19, 2026") instead of "in 2 days".
Views switch on the URL hash (#watchlist, #<report-slug>). No outside requests: the
stylesheet and fonts are inlined, and the app's scripts are left out.
"""
import base64, json, re, sys, urllib.request
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
OUT = Path(__file__).resolve().parent.parent / "dist"
REPO = "https://github.com/js3864-wq/flowcode-opportunity-agent"

def get(path, binary=False):
    with urllib.request.urlopen(BASE + path) as r:
        data = r.read()
    return data if binary else data.decode("utf-8")

slugs = sorted(p.stem for p in (Path(__file__).resolve().parent.parent / "data" / "reports").glob("*.json"))
home = get("/")
css_path = re.search(r'href="(/_next/static/[^"]+\.css)"', home).group(1)
css = get(css_path)
css = re.sub(r'@font-face\{[^}]*vietnamese[^}]*\}', '', css)
for f in sorted(set(re.findall(r'url\(\.\./media/([^)]+\.woff2)\)', css))):
    b64 = base64.b64encode(get("/_next/static/media/" + f, binary=True)).decode()
    css = css.replace(f"url(../media/{f})", f"url(data:font/woff2;base64,{b64})")
pages = {s: get(f"/report/{s}") for s in slugs}
reports = {s: "r" + str(i + 1) for i, s in enumerate(slugs)}

def main_of(page: str) -> str:
    m = re.search(r'<main id="main"[^>]*>(.*)</main>', page, re.S)
    return m.group(1)

def strip(fragment: str) -> str:
    fragment = re.sub(r'<script\b.*?</script>', '', fragment, flags=re.S)
    fragment = re.sub(r'<!--.*?-->', '', fragment, flags=re.S)
    return fragment

header = re.search(r'(<header\b.*?</header>)', home, re.S).group(1)
footer = re.search(r'(<footer\b.*?</footer>)', home, re.S).group(1)


def rewrite_links(fragment: str) -> str:
    for slug in reports:
        fragment = fragment.replace(f'href="/report/{slug}"', f'href="#{slug}"')
        fragment = fragment.replace(f'href="/api/reports/{slug}?format=md"', f'href="{REPO}/blob/main/data/reports/{slug}.md"')
        fragment = fragment.replace(f'href="/api/reports/{slug}?format=download"', f'href="{REPO}/blob/main/data/reports/{slug}.json"')
    fragment = fragment.replace('href="/"', 'href="#watchlist"')
    return fragment

def prefix_ids(fragment: str, p: str) -> str:
    ids = set(re.findall(r'\bid="([^"]+)"', fragment))
    for i in sorted(ids, key=len, reverse=True):
        fragment = fragment.replace(f'id="{i}"', f'id="{p}-{i}"')
        fragment = fragment.replace(f'href="#{i}"', f'href="#{p}-{i}"')
        fragment = fragment.replace(f'aria-labelledby="{i}"', f'aria-labelledby="{p}-{i}"')
    return fragment

# Watchlist: drop the live research form, which needs the running app.
watch = strip(main_of(home))
watch = re.sub(r'<section aria-labelledby="run-title".*?</section>', '', watch, flags=re.S)
watch = rewrite_links(watch)
watch = watch.replace('id="accounts-title"', 'id="wl-accounts-title"').replace('aria-labelledby="accounts-title"', 'aria-labelledby="wl-accounts-title"')
watch = watch.replace('id="leads-title"', 'id="wl-leads-title"').replace('aria-labelledby="leads-title"', 'aria-labelledby="wl-leads-title"')

sections = [f'<section data-view="watchlist">{watch}</section>']
for slug, p in reports.items():
    frag = strip(main_of(pages[slug]))
    frag = rewrite_links(frag)
    frag = prefix_ids(frag, p)
    sections.append(f'<section data-view="{slug}" hidden>{frag}</section>')

# Header: the static page has no live research, so the button points to the code.
header = rewrite_links(header)
header = re.sub(r'<a [^>]*href="/run"[^>]*>Research a company</a>',
                f'<a class="rounded-md bg-ink px-3 py-1.5 font-medium text-paper hover:bg-ink/85" href="{REPO}">Code on GitHub</a>', header)
header = header.replace('href="#watchlist" class="display', 'href="#watchlist" class="display')

router = """
<script>
(function () {
  var views = ["watchlist"].concat(__SLUGS__);
  function show(view) {
    document.querySelectorAll("[data-view]").forEach(function (s) { s.hidden = s.getAttribute("data-view") !== view; });
  }
  function route() {
    var h = decodeURIComponent((location.hash || "").slice(1));
    if (!h || views.indexOf(h) >= 0) { show(h || "watchlist"); window.scrollTo(0, 0); return; }
    var el = document.getElementById(h);
    if (el) {
      var host = el.closest("[data-view]");
      if (host) show(host.getAttribute("data-view"));
      el.scrollIntoView();
      return;
    }
    show("watchlist");
  }
  window.addEventListener("hashchange", route);
  route();
})();
</script>"""

doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Opportunity Radar for Flowcode: US Formula 1 races</title>
<style>{css}</style>
</head>
<body class="min-h-screen">
{header}
<main id="main" class="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
{''.join(sections)}
</main>
{footer}
{router.replace("__SLUGS__", json.dumps(slugs))}
</body>
</html>"""
OUT.mkdir(exist_ok=True)
(OUT / "index.html").write_text(doc)
print("wrote dist/index.html,", "bytes", len(doc), "scripts", doc.count("<script"), "next refs", doc.count("/_next/"), "api refs", doc.count("/api/"), "report refs", doc.count('href="/report'))
