---
target: EuroAmazon Dispatch Android App (public/index.html)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/adampiotrowski/Desktop/Projekty programistyczne/Amazon Price Finder/public/index.html"
target_fingerprint: "sha256:f8969b8bb33ded2af8a23e58d6cfa53d784fe9627f9b295f1c8af3d17385b417"
target_path: /home/adampiotrowski/Desktop/Projekty programistyczne/Amazon Price Finder/public/index.html
timestamp: 2026-11-03T04-56-04Z
slug: public-index-html
---
### Design Health Score (Android Mobile Experience)

| # | Heuristic | Score | Key Issue |
|---|-----------|:-----:|-----------|
| 1 | Visibility of System Status | 3 | Paski ładowania i chipy statusu 9 sklepów są czytelne, ale brak zwrotnej reakcji na chowanie klawiatury ekranowej i buforowanie IPC. |
| 2 | Match System / Real World | 1 | Silne przeciążenie żargonem technicznym ("Landed PLN", "Spread", "BuyBox", "ASIN", "Manifest cenowy"). Przeciętny konsument czuje się jak w panelu dyspozytora kolejowego. |
| 3 | User Control and Freedom | 2 | Lista 20 kandydatów zajmuje 3500px w pionie; gest wstecz w Androidzie zamyka aplikację zamiast zwijać listę lub filtrować wyniki. |
| 4 | Consistency and Standards | 2 | Pola edycji kursów walut (EUR, GBP, SEK) w głównym pasku aplikacji naruszają standardy mobilne Androida (zagracony topbar). |
| 5 | Error Prevention | 2 | Przypadkowe tapnięcia w mikroskopijne inputy walutowe w nagłówku; brak autokorekty uciętych linków Amazonu z aplikacji mobilnej. |
| 6 | Recognition Rather Than Recall | 2 | Użytkownik musi pamiętać o kopiowaniu linku – brak widocznej informacji o integracji z systemowym menu "Udostępnij" (Android Share Sheet). |
| 7 | Flexibility and Efficiency | 3 | Gotowe presety ("Tapo H500", "Bose QC Ultra") przyspieszają testy, ale zabierają cenny pierwszy ekran na telefonie. |
| 8 | Aesthetic and Minimalist Design | 2 | Ekrany telefonów (390–412px) są przeładowane danymi; 9 pełnych kart sklepów tworzy ponad 2100px męczącego przewijania. |
| 9 | Error Recovery | 2 | Komunikaty o błędach ("Fetch timeout 18000ms", "Brak oferty w BuyBox") nie oferują akcji naprawczej (np. 1-tap "Odśwież ten rynek"). |
| 10 | Help and Documentation | 1 | Brak wyjaśnienia, jak liczona jest cena końcowa z polskim VAT i dostawą oraz jak działa przesyłka międzynarodowa z Prime. |
| **Total** | | **20/40** | **Dostateczny / Wymaga dopracowania (Needs Work)** |

---

### Design Specificity Verdict

- **Ocena LLM**: Aplikacja posiada bardzo unikalny i wyrazisty charakter „industrialnego dyspozytora logistycznego” (ciemna, techniczna estetyka, zieleń terminalowa, tabele danych). Choć buduje to zaufanie do dokładności matematycznej, na małym ekranie smartfona z Androidem interfejs sprawia wrażenie surowego portu aplikacji desktopowej, a nie natywnego, przyjaznego narzędzia konsumenckiego dla osób szukających okazji cenowych.
- **Skan deterministyczny (Detector)**: Narzędzie `npx impeccable detect` wykryło 8 problemów w `public/index.html`:
  - 1 niezgodność z systemem zaokrągleń (border-radius 3px w etykiecie "NBP Tabela A"),
  - 6 wartości kolorów poza paletą bazową `DESIGN.md` (m.in. w pasku walutowym i kalkulatorze spreadu),
  - Płaską hierarchię typograficzną (stosunek wielkości nagłówków do tekstu to zaledwie 1.14:1 – body 14px, h3 16px, h1 18px), co utrudnia skanowanie wzrokiem na telefonie,
  - Przesycenie myślnikami pauzowymi / em-dash (14 wystąpień).
- **Nakładki wizualne**: Tryb jednoturowy (brak subagentów z powodu limitu tokenów/quota).

---

### Priorytety (P0–P3) dla wersji Android

- **[P1] Zagracony nagłówek mobilny i brak strefy kciuka (Mobile Topbar & Thumb Ergonomics)**:
  - *Problem*: W nagłówku aplikacji mobilnej (`.ledger-topbar`) znajdują się aż 3 aktywne pola edycyjne kursów walut NBP (EUR, GBP, SEK). Zajmują one ponad 140px wysokości na samej górze ekranu. Użytkownik próbujący dotknąć menu hamburgera często przypadkowo klika w pole kursu, co wywołuje systemową klawiaturę numeryczną zasłaniającą cały ekran.
  - *Wpływ*: Utrata 25-30% pierwszego ekranu smartfona i frustracja ergonomiczna.
  - *Rozwiązanie*: Ukryć edycję kursów walut w szufladzie bocznej (hamburger menu) lub zwinąć w jeden subtelny, nieedytowalny chip informacyjny (`1 EUR ≈ 4,32 zł`). Pole wyszukiwania przenieść niżej, w strefę łatwego zasięgu kciuka (Thumb Zone).
  - *Sugerowana komenda*: `/impeccable layout`

- **[P1] Bariera żargonu inżynieryjno-logistycznego (Cognitive Jargon Barrier)**:
  - *Problem*: Aplikacja posługuje się terminologią giełdowo-magazynową: *"Manifest cenowy 9 rynków"*, *"Landed PLN"*, *"Spread przewalutowania"*, *"Wybierz wydanie katalogowe ASIN"*, *"Brak oferty w BuyBox"*.
  - *Wpływ*: Nowy użytkownik w Polsce nie wie, czy „Landed PLN” to cena z dostawą, czy netto, oraz czym różni się BuyBox od zwykłej oferty.
  - *Rozwiązanie*: Zastąpić żargon językiem konsumenckim: *"Porównanie cen z dostawą do Polski"*, *"Cena końcowa (z wysyłką i VAT)"*, *"Prowizja bankowa przy płatności w EUR/GBP"*, *"Wybierz wariant produktu"*.
  - *Sugerowana komenda*: `/impeccable clarify`

- **[P2] Zmęczenie nieskończonym scrollem 9 rynków (Card Stack Fatigue)**:
  - *Problem*: Każdy z 9 rynków renderuje na telefonie osobną, wysoką kartę (~240px). Razem daje to ponad 2100px przewijania w pionie.
  - *Wpływ*: Aby sprawdzić, czy Amazon UK lub Hiszpania mają lepszą cenę, użytkownik musi nieustannie machać kciukiem w dół i traci z oczu zwycięską ofertę.
  - *Rozwiązanie*: Wdrożyć kompaktowy widok mobilny: zwarta lista rankingowa 9 sklepów posortowana od najtańszego (flaga, nazwa kraju, czas dostawy i duża cena w PLN). Kliknięcie w dany sklep rozwija szczegóły (koszt wysyłki, podział walutowy, sprzedawca).
  - *Sugerowana komenda*: `/impeccable distill`

- **[P2] Brak onboardingu dla systemowej funkcji „Udostępnij z Amazona”**:
  - *Problem*: Aplikacja posiada w kodzie Androida obsługę `ACTION_SEND` (odbieranie linków udostępnionych z oficjalnej aplikacji Amazon), ale nigdzie na ekranie głównym nie ma o tym wzmianki.
  - *Wpływ*: Użytkownicy ręcznie kopiują linki z przeglądarki, przełączają aplikacje i wklejają tekst, marnując czas.
  - *Rozwiązanie*: Dodać na pustym ekranie startowym (Empty State) czytelną kartę: *"Przeglądasz Amazon na telefonie? Kliknij 'Udostępnij' i wybierz EuroAmazon Dispatch, aby błyskawicznie sprawdzić ceny w Europie!"*.
  - *Sugerowana komenda*: `/impeccable onboard`

- **[P3] Płaska typografia i obsługa gestu wstecz Androida**:
  - *Problem*: Różnica rozmiarów między tekstem a nagłówkami jest zbyt mała (1.14:1), co zlewa treść w jedną masę. Ponadto naciśnięcie systemowego przycisku „Wstecz” na telefonie minimalizuje aplikację zamiast zwijać listę znalezionych produktów.
  - *Rozwiązanie*: Zwiększyć kontrast typograficzny (nagłówki 20-22px, akcenty 12-13px) oraz zaimplementować `onBackPressedDispatcher` w `MainActivity.kt`, który najpierw zamyka wysunięte panele.
  - *Sugerowana komenda*: `/impeccable typeset`

---

### Persona Red Flags (Test scenariuszy mobilnych)

- **Michał (Codzienny łowca okazji w oficjalnej aplikacji Amazon)**:
  - *Scenariusz*: Szuka soundbara w aplikacji Amazon na smartfonie. Chce sprawdzić, czy w Niemczech nie jest taniej.
  - *Co go zatrzymuje*: Próbuje skopiować link z aplikacji Amazon, który zawiera mnóstwo zbędnych parametrów śledzących. Wkleja go do EuroAmazon, ale musi przewijać wielki nagłówek, by trafić w przycisk „Sprawdź”. Nie wie, że mógł skorzystać z systemowego udostępniania bezpośrednio z aplikacji Amazon.
- **Kasia (Kupująca w pośpiechu, obsługa jedną ręką)**:
  - *Scenariusz*: Wpisuje „Tapo” na przystanku autobusowym.
  - *Co ją zatrzymuje*: Wyświetla się 20 kafelków o łącznej wysokości 3500px. Klawiatura ekranowa nie znika sama po kliknięciu Szukaj. Próbując zamknąć klawiaturę, przypadkowo dotyka pola kursu funta brytyjskiego w nagłówku. Rezygnuje z dalszego szukania.
- **Marek (Użytkownik ostrożny finansowo)**:
  - *Scenariusz*: Widzi cenę "Landed PLN: 547,05 zł" na Amazon.be i "629,99 zł" na Amazon.pl.
  - *Co go zatrzymuje*: Boi się ukrytych opłat celnych lub dopłat kurierskich. Słowo „Landed” brzmi dla niego obco. Nie jest pewien, czy to cena brutto i ile dokładnie zapłaci swoją polską kartą w banku.
