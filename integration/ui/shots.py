"""Screenshots of the JellyRate UI (detail page badge, picker, list cards; desktop and mobile).

Writes PNGs to $UI_OUT (default integration/ui/out, gitignored). Not asserting anything except
that the pages render; look at the images. Needs a server with JellyRate + File Transformation.
"""
import os
from playwright.sync_api import sync_playwright
import jr

token, ids = jr.seed()
os.makedirs(jr.OUT, exist_ok=True)
shot = lambda pg, name: pg.screenshot(path=os.path.join(jr.OUT, name + ".png"))

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, size in (("desktop", {"width": 1100, "height": 600}), ("mobile", {"width": 390, "height": 700})):
        pg = browser.new_page(viewport=size, device_scale_factor=2)
        jr.login(pg)
        for label, item in (("rated", ids["rated"]), ("unrated", ids["unrated"])):
            jr.open_details(pg, item)
            jr.remove_own_rating(pg)
            shot(pg, f"details-{label}-empty-{name}")
            jr.rate(pg, 6, save=False)
            pg.locator(".jr-star:visible").nth(4).hover()
            shot(pg, f"details-{label}-picker-{name}")
            pg.locator(".jr-star:visible").nth(5).click()
            pg.locator(".jr-btn:visible", has_text="Save review").click()
            pg.wait_for_timeout(800)
            shot(pg, f"details-{label}-saved-{name}")
        pg.goto(jr.BASE + "web/#/movies.html")
        pg.wait_for_timeout(4000)
        shot(pg, f"cards-{name}")
        jr.open_details(pg, ids["rated"])
        jr.remove_own_rating(pg)
        jr.open_details(pg, ids["unrated"])
        jr.remove_own_rating(pg)
        pg.close()
    browser.close()
print("screenshots in", jr.OUT)
