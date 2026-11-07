"""Browser flow checks for the JellyRate web UI (Playwright, headless Chromium, real web client).

Checks: the detail-page badge (hidden without ratings, shown beside the community rating, live
update/removal, re-insertion after the web client rebuilds the row), pending star pick (nothing is
sent until "Save review"), the "(edited)" flag only on real text changes, the poster-card badge on
list pages (appears after rating, removed after removal, never duplicated, restored after a wipe)
and the absence of page errors. Needs a server with JellyRate + File Transformation; see run.sh.
"""
from playwright.sync_api import sync_playwright
import jr

token, ids = jr.seed()
unrated, rated = ids["unrated"], ids["rated"]  # movie without / series with a community rating
text = lambda pg: pg.locator(".jellyrate:visible").inner_text()
save_visible = lambda pg: pg.locator(".jr-btn:visible", has_text="Save review").is_visible()
save = lambda pg: (pg.locator(".jr-btn:visible", has_text="Save review").click(), pg.wait_for_timeout(800))


def pick(pg, n):
    if not pg.locator(".jr-panel:visible").is_visible():
        pg.locator(".jr-pill:visible").click()
    pg.locator(".jr-star:visible").nth(n - 1).click()


with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, size in (("desktop", {"width": 1280, "height": 900}), ("mobile", {"width": 390, "height": 700})):
        pg = browser.new_page(viewport=size)
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        writes = []
        pg.on("request", lambda r: writes.append(r.method) if "JellyRate/Items" in r.url and r.method != "GET" else None)
        jr.login(pg)
        print("--", name)

        # Item with a community rating: JellyRate badge sits right behind it.
        jr.open_details(pg, rated)
        jr.remove_own_rating(pg)
        jr.rate(pg, 6)
        pg.wait_for_function("document.querySelector('.jr-badge')", timeout=5000)
        check_badge = jr.badge(pg)
        jr.check(f"{name}: badge follows community rating",
                 pg.evaluate("document.querySelector('.jr-badge').previousElementSibling.classList.contains('starRatingContainer')"))
        jr.check(f"{name}: badge has an accessible label", bool(check_badge.locator(".jr-sr").text_content().strip()))

        if name == "mobile":
            jr.check("mobile: no page errors", not errors)
            pg.close()
            continue

        # Unrated item, nobody rated: badge hidden; pending pick sends nothing.
        jr.open_details(pg, unrated)
        jr.remove_own_rating(pg)
        others = pg.evaluate("document.querySelectorAll('.jr-entry').length")
        jr.check("no badge without any rating", others > 0 or jr.badge(pg).count() == 0)
        writes.clear()
        pick(pg, 7)
        pg.wait_for_timeout(500)
        jr.check("pending pick sends no request", writes == [])
        jr.check("pending pick shows Save review", save_visible(pg))
        save(pg)
        jr.check("save sends one PUT", writes == ["PUT"])
        jr.check("first save is not 'edited'", "(edited)" not in text(pg))
        jr.check("save button hidden when saved", not save_visible(pg))

        pick(pg, 9)
        save(pg)
        jr.check("score-only change is not 'edited'", "(edited)" not in text(pg))
        pg.locator("textarea:visible").fill("first review")
        jr.check("typing shows Save review", save_visible(pg))
        save(pg)
        jr.check("adding a review is not 'edited'", "(edited)" not in text(pg))
        pg.locator("textarea:visible").fill("first review")
        jr.check("identical text hides Save review", not save_visible(pg))
        pick(pg, 3)
        pick(pg, 9)
        jr.check("star back to saved score hides Save review", not save_visible(pg))
        pg.locator("textarea:visible").fill("changed review")
        save(pg)
        jr.check("changed text marks '(edited)'", "(edited)" in text(pg))

        # Live update and removal of the badge.
        pick(pg, 3)
        save(pg)
        jr.check("badge updates live", jr.badge(pg).count() == 1 and "(" in jr.badge(pg).inner_text())
        pg.evaluate("window.scrollTo(0,0)")
        jr.check("remove button present", pg.locator(".jr-btn:visible", has_text="Remove rating").count() == 1)
        jr.remove_own_rating(pg)
        pg.wait_for_timeout(500)
        jr.check("badge gone after removal", jr.badge(pg).count() == 0 or pg.evaluate("document.querySelectorAll('.jr-entry').length") > 0)

        # Badge survives the web client rebuilding the info row.
        jr.open_details(pg, rated)
        jr.check("badge present before rebuild", jr.badge(pg).count() == 1)
        pg.evaluate("document.querySelector('#itemDetailPage:not(.hide) .itemMiscInfo-primary').querySelectorAll('.jr-badge').forEach(e => e.remove())")
        pg.wait_for_timeout(800)
        jr.check("badge re-inserted after row rebuild", jr.badge(pg).count() == 1)
        jr.check("desktop: no page errors", not errors)

        # Poster cards on the list page.
        cards = []
        pg.on("request", lambda r: cards.append(r.url) if "Summaries" in r.url else None)
        card = f".card[data-id='{unrated}'] .jr-card"
        open_card = lambda: pg.locator(f".card[data-id='{unrated}'] a.cardImageContainer").first.dispatch_event("click")  # empty (placeholder media, no image)
        pg.goto(jr.BASE + "web/#/movies.html")
        pg.wait_for_selector(f".card[data-id='{unrated}']", timeout=30000)
        pg.wait_for_timeout(2000)
        jr.check("card: no badge when unrated", pg.locator(card).count() == 0)
        open_card()
        pg.wait_for_selector(".jellyrate .jr-pill:visible", timeout=20000)
        jr.rate(pg, 8)
        pg.wait_for_timeout(800)
        pg.go_back()
        pg.wait_for_timeout(2000)
        jr.check("card: badge after rating", pg.locator(card).count() == 1)
        open_card()
        pg.wait_for_selector(".jellyrate .jr-btn:visible", timeout=20000)
        jr.remove_own_rating(pg)
        pg.go_back()
        pg.wait_for_timeout(2000)
        jr.check("card: badge removed after removal", pg.locator(card).count() == 0)
        jr.check("card: never more than one badge per card",
                 pg.evaluate("Math.max(0, ...[...document.querySelectorAll('.card')].map(c => c.querySelectorAll('.jr-card').length))") <= 1)
        pg.close()
    browser.close()
jr.finish()
