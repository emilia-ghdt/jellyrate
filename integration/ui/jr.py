"""Shared helpers for the browser checks: config from env, Jellyfin API, seeding, web login.

Env: BASE_URL (http://localhost:8096), JR_ADMIN (admin), JR_USER (alice), JR_PASSWORD (demo),
UI_OUT (integration/ui/out, screenshots), MEDIA_DIR (media dir the server was started with, only needed to seed).
"""
import json, os, sys, time, urllib.parse, urllib.request

BASE = os.environ.get("BASE_URL", "http://localhost:8096").rstrip("/") + "/"
ADMIN = os.environ.get("JR_ADMIN", "admin")
USER = os.environ.get("JR_USER", "alice")
PASSWORD = os.environ.get("JR_PASSWORD", "demo")
OUT = os.environ.get("UI_OUT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
AUTH = 'MediaBrowser Client="jr-ui", Device="ui", DeviceId="jr-ui", Version="1"'

_failed = False


def check(name, ok):
    """Print PASS/FAIL and remember a failure for finish()."""
    global _failed
    print(("PASS " if ok else "FAIL ") + name, flush=True)
    _failed = _failed or not ok


def finish():
    print("FAILED" if _failed else "OK")
    sys.exit(1 if _failed else 0)


def api(method, path, body=None, token=None):
    headers = {"Authorization": AUTH + (f', Token="{token}"' if token else ""), "Content-Type": "application/json"}
    data = None if body is None else json.dumps(body).encode()
    with urllib.request.urlopen(urllib.request.Request(BASE + path, method=method, headers=headers, data=data)) as r:
        text = r.read()
        return json.loads(text) if text else None


def authenticate(name):
    a = api("POST", "Users/AuthenticateByName", {"Username": name, "Pw": PASSWORD})
    return a["AccessToken"], a["User"]["Id"]


def seed():
    """Idempotently prepare a fresh server: wizard, admin + user, libraries.

    Returns (token, {"unrated": movie id (no community rating), "rated": series id (community rating 7.5)})."""
    for _ in range(120):
        try:
            info = api("GET", "System/Info/Public")
            break
        except Exception:
            time.sleep(1)
    else:
        sys.exit("server not reachable at " + BASE)
    if not info.get("StartupWizardCompleted"):
        api("POST", "Startup/Configuration", {"UICulture": "en-US", "MetadataCountryCode": "US", "PreferredMetadataLanguage": "en"})
        api("GET", "Startup/User")
        api("POST", "Startup/User", {"Name": ADMIN, "Password": PASSWORD})
        api("POST", "Startup/Complete")
    token, admin_id = authenticate(ADMIN)
    media = os.environ.get("MEDIA_DIR")
    if not api("GET", "Library/VirtualFolders", token=token):
        if not media:
            sys.exit("MEDIA_DIR is required to seed libraries")
        for n, t, p in (("Movies", "movies", "movies"), ("Shows", "tvshows", "shows")):
            path = urllib.parse.quote(os.path.join(media, p))
            api("POST", f"Library/VirtualFolders?name={n}&collectionType={t}&paths={path}&refreshLibrary=false", {}, token)
    if USER not in [u["Name"] for u in api("GET", "Users", token=token)]:
        api("POST", "Users/New", {"Name": USER, "Password": PASSWORD}, token)
    api("POST", "Library/Refresh", None, token)

    def find(kind):
        for _ in range(60):
            items = api("GET", f"Items?Recursive=true&IncludeItemTypes={kind}", token=token)["Items"]
            if items:
                return items[0]["Id"]
            time.sleep(1)
        sys.exit("no " + kind + " found; is MEDIA_DIR the server's media dir?")

    ids = {"unrated": find("Movie"), "rated": find("Series")}
    dto = api("GET", f"Users/{admin_id}/Items/{ids['rated']}", token=token)
    dto["CommunityRating"] = 7.5
    api("POST", f"Items/{ids['rated']}", dto, token)
    return token, ids


def login(page, name=None):
    """Sign in through the web client's login form."""
    page.goto(BASE + "web/#/login.html")
    page.get_by_label("User", exact=True).wait_for(timeout=60000)
    page.wait_for_timeout(1500)
    page.get_by_label("User", exact=True).fill(name or USER)
    page.get_by_label("Password", exact=True).fill(PASSWORD)
    page.get_by_role("button", name="Sign In").click()
    page.wait_for_function("(localStorage.getItem('jellyfin_credentials')||'').indexOf('AccessToken')>0", timeout=30000)
    page.wait_for_timeout(3000)


def open_details(page, item_id):
    """Open an item page; fails with a hint when jellyrate.js was not injected."""
    page.goto(BASE + "web/#/details?id=" + item_id)
    try:
        page.wait_for_selector(".jellyrate .jr-pill:visible", timeout=30000)
    except Exception:
        sys.exit("JellyRate UI did not appear: is the File Transformation plugin installed (FILE_TRANSFORMATION_DIR)?")
    page.wait_for_timeout(1500)


def badge(page):
    return page.locator("#itemDetailPage:not(.hide) .jr-badge")


def rate(page, star_index, save=True):
    page.locator(".jr-pill:visible").click()
    page.locator(".jr-star:visible").nth(star_index).click()
    if save:
        page.locator(".jr-btn:visible", has_text="Save review").click()


def remove_own_rating(page):
    btn = page.locator(".jr-btn:visible", has_text="Remove rating")
    if btn.count():
        btn.click()
        page.wait_for_timeout(800)
