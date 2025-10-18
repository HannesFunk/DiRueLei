# LN-Scan-Tool Web App

Eine browserbasierte Version des LN-Scan-Tools zur automatischen Sortierung von Klausuren.

## Features

✅ **Komplett clientseitig** - Keine Datenübertragung an Server  
✅ **Plattformunabhängig** - Läuft in jedem modernen Browser  
✅ **Keine Python-Installation** erforderlich  
✅ **QR-Code Generierung** aus CSV-Dateien (vollständig implementiert)  
⚠️ **PDF-Verarbeitung** mit vereinfachter QR-Code Erkennung (Demo-Modus)  
⚠️ **Automatische Sortierung** nach Schülern (vereinfacht)

## ⚠️ Browser-Version Einschränkungen

**QR-Code Erkennung:** Die Browser-Version kann aufgrund von Pyodide-Einschränkungen keine echte QR-Code Erkennung durchführen. Die PDF-Verarbeitung läuft im Demo-Modus und simuliert die Erkennung.

**Für produktive Nutzung** mit echter QR-Code Erkennung verwenden Sie bitte die Desktop-Version des Tools.  

## Verwendung

### 1. Web App öffnen
Öffnen Sie einfach die `index.html` Datei in einem modernen Browser (Chrome, Firefox, Safari, Edge).

### 2. QR-Codes erstellen
1. Klicken Sie auf ".csv auswählen"
2. Wählen Sie Ihre Schülerliste (CSV-Format) aus
3. Klicken Sie auf "QR-Codes generieren"
4. Laden Sie die generierte PDF-Datei herunter

### 3. PDFs verarbeiten
1. Klicken Sie auf "Scan(s) auswählen"  
2. Wählen Sie Ihre gescannten PDF-Dateien aus
3. Konfigurieren Sie die Scan-Optionen nach Bedarf
4. Klicken Sie auf "PDFs verarbeiten"
5. Laden Sie das Ergebnis-ZIP herunter

## CSV-Format

Die CSV-Datei sollte folgende Spalten enthalten:
- Erste Spalte: Schüler-ID (z.B. "Teilnehmer/in 12345")
- Spalte "Vollständiger Name": Name des Schülers

Beispiel:
```csv
"Identifier","Vollständiger Name"
"Teilnehmer/in 12345","Max Mustermann"
"Teilnehmer/in 12346","Anna Beispiel"
```

## Scan-Optionen

- **A3-Seiten teilen**: Teilt A3-Bögen automatisch in zwei A4-Seiten
- **Zwei-Seiten-Scan**: Für Scans wo QR-Codes nur auf jeder zweiten Seite sind
- **Schnell-Modus**: Testet weniger Rotationen (schneller, aber weniger zuverlässig)

## Browser-Kompatibilität

- ✅ Chrome 90+
- ✅ Firefox 88+  
- ✅ Safari 14+
- ✅ Edge 90+

## Technische Details

Die App verwendet:
- **Pyodide** für Python im Browser
- **PyMuPDF** für PDF-Verarbeitung
- **OpenCV** für QR-Code Erkennung
- **ReportLab** für PDF-Generierung

Alle Verarbeitung erfolgt lokal im Browser - keine Daten verlassen Ihren Computer!

## Fehlerbehebung

### Lädt nicht / bleibt bei "wird geladen" hängen
- Stellen Sie sicher, dass Sie eine stabile Internetverbindung haben (für den ersten Download der Python-Umgebung)
- Versuchen Sie es mit einem anderen Browser
- Leeren Sie den Browser-Cache

### QR-Codes werden nicht erkannt
- Stellen Sie sicher, dass die QR-Codes klar und scharf gescannt wurden
- Versuchen Sie ohne "Schnell-Modus"
- Prüfen Sie, ob die QR-Codes das richtige Format haben (Name_ID)

### Große PDF-Dateien verursachen Probleme
- Die Verarbeitung großer PDFs kann länger dauern
- Bei sehr großen Dateien könnte der Browser-Speicher knapp werden
- Teilen Sie große PDFs in kleinere Teile auf

## Entwicklung

Zum lokalen Entwickeln:
1. Klonen Sie das Repository
2. Öffnen Sie `index.html` in einem Browser
3. Für CORS-Probleme verwenden Sie einen lokalen Server:
   ```bash
   python -m http.server 8000
   ```

## Lizenz

Siehe Hauptprojekt für Lizenzinformationen.