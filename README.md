# TRNT App

Eine Anwendung für System-Zugang und Album-Verwaltung.

## Lokale Entwicklung

1. Installiere Node.js und npm
2. Klone das Repository
3. Installiere die Abhängigkeiten mit `npm install`
4. Erstelle eine `.env`-Datei im Stammverzeichnis mit folgenden Einstellungen:
   ```
   PORT=3000
   MONGODB_URI=mongodb+srv://amo:<db_password>@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs
   DB_PASSWORD=dein_mongo_db_passwort
   ```
   Ersetze `dein_mongo_db_passwort` mit deinem tatsächlichen MongoDB-Passwort
5. Starte den Server mit `node server.js`
6. Die Anwendung ist jetzt auf http://localhost:3000 verfügbar

## MongoDB Datenbank-Struktur

Die Anwendung verwendet die folgenden MongoDB-Sammlungen:

1. `requests` - Anfragen im System
2. `anti_tamper_logs` - Sicherheitsprotokollierung
3. `albumitems` - Alben und zugehörige Daten

## Render Deployment

### Vorbereitung

1. Erstelle einen Account auf [Render](https://render.com/)
2. Erstelle ein neues GitHub-Repository und lade deinen Code hoch (achte darauf, dass die `.env`-Datei nicht hochgeladen wird - sie ist bereits in der `.gitignore`-Datei)

### Schritte zur Bereitstellung

1. Melde dich bei Render an und gehe zum Dashboard
2. Wähle "New" > "Blueprint" (oder einfach direkt "Web Service" für die manuelle Konfiguration)
3. Verbinde dein GitHub-Konto und wähle das Repository aus
4. Render sollte die `render.yaml` automatisch erkennen und anwenden
5. Falls dies nicht funktioniert, konfiguriere den Dienst manuell:
   - Name: trnt-app
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance Type: Free

6. Umgebungsvariablen (Environment Variables) hinzufügen:
   - `PORT`: 3000 
   - `MONGODB_URI`: mongodb+srv://amo:<db_password>@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs
   - `DB_PASSWORD`: Dein tatsächliches MongoDB-Passwort

7. Klicke auf "Create Web Service"

### Nach der Bereitstellung

- Render generiert automatisch eine URL für deine App (z.B. https://trnt-app.onrender.com)
- Es kann einige Minuten dauern, bis deine App bereitgestellt und gestartet ist

## Wichtige Hinweise

- Die kostenlose Stufe bei Render "schläft" nach einer Inaktivitätsphase ein und benötigt etwas Zeit zum Aufwachen, wenn wieder auf die App zugegriffen wird
- Die App ist für die Migration von SQLite zu MongoDB konfiguriert, sodass sie mit beiden Datenbanken funktioniert 