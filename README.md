# TRNT App

Eine Echtzeit-Anwendung mit Express, Socket.IO und MongoDB.

## Lokale Entwicklung

1. Installiere die Abhängigkeiten:
   ```
   npm install
   ```

2. Erstelle eine `.env`-Datei im Hauptverzeichnis mit folgendem Inhalt:
   ```
   MONGODB_URI=deine_mongodb_verbindungszeichenfolge
   PORT=3000
   ```

3. Starte den Entwicklungsserver:
   ```
   npm run dev
   ```

## Deployment auf Vercel

1. Stelle sicher, dass du ein Vercel-Konto und die Vercel CLI installiert hast:
   ```
   npm install -g vercel
   ```

2. Logge dich bei Vercel ein:
   ```
   vercel login
   ```

3. Deploye das Projekt:
   ```
   vercel
   ```

4. Füge die Umgebungsvariable `MONGODB_URI` in den Vercel-Projekteinstellungen hinzu:
   - Gehe zu deinem Vercel-Dashboard
   - Wähle dein Projekt aus
   - Klicke auf "Settings" > "Environment Variables"
   - Füge `MONGODB_URI` mit deiner MongoDB-Verbindungszeichenfolge hinzu

## MongoDB-Verbindung

Die Anwendung verwendet MongoDB als Datenbank. Die Verbindungszeichenfolge sollte folgendes Format haben:
```
mongodb+srv://benutzername:passwort@cluster.mongodb.net/datenbankname
```

## Wichtige Dateien

- `server-mongo.js`: Der Hauptserver mit MongoDB-Integration
- `db-mongo.js`: MongoDB-Verbindung und Schemas
- `vercel.json`: Vercel-Konfiguration für das Deployment 