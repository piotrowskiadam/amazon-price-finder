#!/usr/bin/env python3
"""
Standalone native GTK4 + WebKit6 desktop application window for EuroAmazon Dispatch.
Runs as a dedicated GNOME desktop window (Application ID: pl.euroamazon.Dispatch)
and opens external Amazon store links in the user's default browser.
"""

import os
import sys
import gi

gi.require_version("Gtk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gio, GLib, Gtk, WebKit  # noqa: E402


APP_ID = "pl.euroamazon.Dispatch"
DEFAULT_URL = os.environ.get("EUROAMAZON_URL", "http://localhost:3456")


class EuroAmazonWindow(Gtk.ApplicationWindow):
    def __init__(self, app: Gtk.Application, base_url: str) -> None:
        super().__init__(application=app, title="EuroAmazon Dispatch — Porównywarka Cen Amazon UE i UK (PLN)")
        self.base_url = base_url.rstrip("/")
        self.set_default_size(1420, 920)
        self.set_icon_name(APP_ID)

        # Native GNOME GTK4 HeaderBar with quick navigation controls
        header = Gtk.HeaderBar()
        self.set_titlebar(header)

        nav_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)

        btn_home = Gtk.Button(label="Porównywarka cen")
        btn_home.set_tooltip_text("Przejdź do głównego widoku porównywarki (9 rynków UE i UK)")
        btn_home.connect("clicked", lambda *_: self.webview.load_uri(f"{self.base_url}/"))
        nav_box.append(btn_home)

        btn_diagram = Gtk.Button(label="Schemat architektury")
        btn_diagram.set_tooltip_text("Wyświetl diagram architektury głębokich modułów")
        btn_diagram.connect("clicked", lambda *_: self.webview.load_uri(f"{self.base_url}/diagram"))
        nav_box.append(btn_diagram)

        header.pack_start(nav_box)

        right_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)

        btn_reload = Gtk.Button(label="Odśwież")
        btn_reload.set_tooltip_text("Odśwież bieżący widok")
        btn_reload.connect("clicked", lambda *_: self.webview.reload())
        right_box.append(btn_reload)

        btn_browser = Gtk.Button(label="Otwórz w przeglądarce ↗")
        btn_browser.set_tooltip_text("Otwórz bieżący widok w domyślnej przeglądarce systemowej")
        btn_browser.connect(
            "clicked",
            lambda *_: Gio.AppInfo.launch_default_for_uri(
                self.webview.get_uri() or f"{self.base_url}/", None
            ),
        )
        right_box.append(btn_browser)

        header.pack_end(right_box)

        # Configure WebKit6 WebView
        self.webview = WebKit.WebView()
        self.webview.set_hexpand(True)
        self.webview.set_vexpand(True)

        settings = self.webview.get_settings()
        settings.set_enable_developer_extras(True)
        settings.set_enable_smooth_scrolling(True)

        self.webview.connect("decide-policy", self.on_decide_policy)
        self.set_child(self.webview)
        self.webview.load_uri(f"{self.base_url}/")

    def on_decide_policy(
        self,
        webview: WebKit.WebView,
        decision: WebKit.PolicyDecision,
        decision_type: WebKit.PolicyDecisionType,
    ) -> bool:
        if decision_type in (
            WebKit.PolicyDecisionType.NEW_WINDOW_ACTION,
            WebKit.PolicyDecisionType.NAVIGATION_ACTION,
        ):
            nav_action = decision.get_navigation_action()
            request = nav_action.get_request() if nav_action else None
            uri = request.get_uri() if request else None

            if not uri:
                return False

            # Internal app routes stay inside the standalone desktop window
            if uri.startswith(self.base_url) or uri.startswith("data:") or uri.startswith("about:"):
                if decision_type == WebKit.PolicyDecisionType.NEW_WINDOW_ACTION:
                    decision.ignore()
                    webview.load_uri(uri)
                    return True
                return False

            # External links (e.g. https://www.amazon.pl/dp/...) open in user's default browser
            if uri.startswith("http://") or uri.startswith("https://"):
                decision.ignore()
                try:
                    Gio.AppInfo.launch_default_for_uri(uri, None)
                except Exception:
                    pass
                return True

        return False


class EuroAmazonApp(Gtk.Application):
    def __init__(self, base_url: str) -> None:
        super().__init__(
            application_id=APP_ID,
            flags=Gio.ApplicationFlags.NON_UNIQUE,
        )
        self.base_url = base_url
        self.window: EuroAmazonWindow | None = None

    def do_activate(self) -> None:
        if not self.window:
            self.window = EuroAmazonWindow(self, self.base_url)
        self.window.present()


def main() -> int:
    GLib.set_prgname(APP_ID)
    GLib.set_application_name("EuroAmazon Dispatch")
    base_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    app = EuroAmazonApp(base_url)
    return app.run(None)


if __name__ == "__main__":
    raise SystemExit(main())
