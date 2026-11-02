# EuroAmazon Dispatch — Amazon Price Finder (EU & UK)

Porównywarka cen produktów i kosztów dostawy do Polski w **9 europejskich i brytyjskich sklepach Amazon** (`amazon.pl`, `amazon.de`, `amazon.es`, `amazon.it`, `amazon.fr`, `amazon.nl`, `amazon.com.be`, `amazon.se`, `amazon.co.uk`) z przeliczeniem na `PLN` według kursów **Narodowego Banku Polskiego (Tabela A)**.

![Schemat architektury](docs/architecture-diagram.svg)

## Główne funkcje

- **Wyszukiwanie po linku, kodzie `ASIN` lub słowie kluczowym**:
  - Bezpośrednie rozpoznawanie linków `/dp/ASIN`, `/gp/product/ASIN` ze wszystkich 9 domen.
  - Wyszukiwanie po słowie kluczowym zwracające do 20 pozycji katalogowych ze zdjęciami i zwijaną szufladą wyboru.
- **Rzeczywisty odczyt ofert ze strumieniowym paskiem postępu (NDJSON)**:
  - Sprawdzanie cen BuyBox oraz kosztów wysyłki do Polski w czasie rzeczywistym dla każdego z 9 sklepów.
  - Rygorystyczne rozróżnianie aktywnych ofert od produktów niedostępnych (`#outOfStock`, `#unqualifiedBuyBox`) oraz stron `404` / blokad anty-botowych.
- **Przeliczanie walut (`EUR`, `GBP`, `SEK` → `PLN`)**:
  - Automatyczne pobieranie kursów z API NBP (Tabela A) z obsługą narzutu przewalutowania (`0%`, `+2,0%`, `+3,5%`) oraz ręcznej korekty kursów i cen w tabeli.
- **Tryb aplikacji desktopowej (GNOME / GTK4 + WebKit6)**:
  - Skrypt [`bin/launch-app.sh`](bin/launch-app.sh) oraz natywne okno [`bin/desktop-window.py`](bin/desktop-window.py) pozwalają uruchamiać aplikację jako samodzielny program okienkowy z menu GNOME.

## Uruchomienie lokalne

```bash
npm install
npm start
```

Aplikacja webowa będzie dostępna pod adresem `http://localhost:3456`.

### Uruchomienie jako okienkowa aplikacja desktopowa (Linux / GNOME)

```bash
./bin/launch-app.sh
```

## Testy

```bash
npm test
```

## Dokumentacja architektury

- [`GLOSSARY.md`](GLOSSARY.md) — słownik pojęć domenowych (Ubiquitous Language)
- [`DESIGN.md`](DESIGN.md) & [`PRODUCT.md`](PRODUCT.md) — system projektowy i założenia produktowe
- [`docs/adr/0001-cross-border-amazon-price-engine.md`](docs/adr/0001-cross-border-amazon-price-engine.md) — Architecture Decision Record
