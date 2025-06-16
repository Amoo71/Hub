# TRNT Anwendung

Diese Anwendung wurde so umgestellt, dass sie auf Vercel mit MongoDB Atlas als Datenbank funktioniert.

## Deployment-Anleitung

### Schritt 1: MongoDB Atlas einrichten

1. Erstelle einen Account bei [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Erstelle einen neuen Cluster (der kostenlose M0-Cluster reicht aus)
3. Klicke auf "Connect" und wähle "Connect your application"
4. Kopiere den Verbindungsstring, der wie folgt aussieht:
   ```
   mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority
   ```
5. Ersetze `<username>`, `<password>` und `<database-name>` mit deinen eigenen Werten

### Schritt 2: Vercel einrichten

1. Erstelle einen Account bei [Vercel](https://vercel.com)
2. Verbinde dein GitHub-Repository mit Vercel
3. Füge folgende Umgebungsvariable beim Vercel-Deployment hinzu:
   - Name: `MONGODB_URI`
   - Wert: Der MongoDB-Verbindungsstring von Schritt 1

### Schritt 3: Deployment

1. Pushe deinen Code in dein GitHub-Repository
2. Vercel wird automatisch das Deployment starten
3. Nach erfolgreichem Deployment erhältst du eine URL, unter der deine Anwendung erreichbar ist

## Lokale Entwicklung

Um die Anwendung lokal zu entwickeln:

1. Erstelle eine `.env`-Datei im Hauptverzeichnis und füge den MongoDB-Verbindungsstring hinzu:
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority
   ```
2. Installiere die Abhängigkeiten mit `npm install`
3. Starte den Server mit `npm run dev`
4. Die Anwendung ist dann unter http://localhost:3000 erreichbar 