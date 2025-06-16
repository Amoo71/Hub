# TRNT App

Eine Web-Anwendung für Anfragen und Album-Management.

## Setup

1. Repository klonen
2. Dependencies installieren:
   ```
   npm install
   ```
3. `.env` Datei erstellen mit Umgebungsvariablen:
   ```
   PORT=3000
   MONGODB_URI=mongodb+srv://amo:<db_password>@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs
   DB_PASSWORD=dein_passwort_hier
   ```
4. App starten:
   ```
   npm start
   ```

## Deployment auf Render.com

1. Fork dieses Repository auf GitHub
2. Bei Render.com anmelden (kostenlos)
3. "New Web Service" wählen
4. GitHub-Repository verknüpfen
5. Folgende Einstellungen verwenden:
   - Name: trnt-app
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `NODE_ENV=production node server.js`
6. Umgebungsvariablen hinzufügen:
   - `NODE_ENV`: production
   - `PORT`: 10000
   - `MONGODB_URI`: mongodb+srv://amo:<db_password>@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs
   - `DB_PASSWORD`: dein_passwort_hier
7. Deploy starten

Die Web-App wird automatisch auf einer .onrender.com Domain deployed. 