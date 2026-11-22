# Eigener CORS Proxy mit Cloudflare Workers

Da öffentliche CORS-Proxys (wie `corsproxy.io`) den Dienst für Server- und Skript-basierte Anfragen im kostenlosen Tarif blockieren, musst du für diese Anwendung einen eigenen kleinen CORS-Proxy betreiben. 

Mit **Cloudflare Workers** geht das komplett kostenlos und in wenigen Minuten.

## Anleitung:

1. **Cloudflare Account erstellen:**
   Falls du noch keinen hast, registriere dich kostenlos unter [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).

2. **Worker erstellen:**
   - Klicke links im Menü auf **"Workers & Pages"**.
   - Klicke auf den Button **"Create application"** und dann auf **"Create Worker"**.
   - Gib dem Worker einen Namen (z.B. `artemis-cors-proxy`) und klicke auf **"Deploy"**.

3. **Code einfügen:**
   - Klicke bei dem gerade erstellten Worker auf **"Edit code"**.
   - Lösche den gesamten vorhandenen Code dort.
   - Kopiere den kompletten Inhalt aus der Datei `worker.js` in diesem Ordner und füge ihn dort ein.
   - Klicke oben rechts auf **"Save and deploy"** (Speichern und bereitstellen).

4. **URL in der App anpassen:**
   - Gehe zurück zur Übersichtsseite deines Workers. Dort siehst du eine URL, die so ähnlich aussieht wie:
     `https://artemis-cors-proxy.dein-name.workers.dev`
   - Öffne die Datei `webapp/app.js` in diesem Projekt.
   - Füge ganz oben (ca. Zeile 7) deine Worker-URL in das Array `ARTEMIS_CORS_PROXIES` ein. Achte darauf, dass `/?url=` am Ende stehen bleibt!
   - Du kannst mehrere Proxy-URLs eintragen – die App versucht sie der Reihe nach, falls einer nicht erreichbar ist.

Fertig! Deine GitHub Pages Anwendung kann nun wieder erfolgreich auf Artemis zugreifen.

## Funktionsweise

Der Worker leitet Anfragen an Artemis weiter und fügt die nötigen CORS-Headers hinzu.

**Sicherheitsfeatures:**
- Nur relevante Request-Headers (Authorization, Content-Type, Accept) werden weitergeleitet
- Potenziell störende Response-Headers von Artemis (CSP, X-Frame-Options etc.) werden entfernt
- Origin- und Referer-Headers werden nicht an Artemis weitergeleitet
- Fehler werden als JSON mit CORS-Headers zurückgegeben (kein stilles Scheitern)
