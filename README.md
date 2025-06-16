# TRNT App

Eine Node.js-Anwendung mit Express und MongoDB.

## Lokale Entwicklung

1. Klone das Repository
2. Installiere die Abhängigkeiten:
   ```
   npm install
   ```
3. Erstelle eine `.env`-Datei mit folgenden Variablen:
   ```
   PORT=3000
   MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/trnt-app
   ```
4. Starte den Server:
   ```
   npm start
   ```

## Online-Deployment

### MongoDB Atlas einrichten

1. Erstelle ein kostenloses Konto auf [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Erstelle einen neuen Cluster
3. Erstelle einen Datenbankbenutzer mit Passwort
4. Erlaube Zugriff von überall (0.0.0.0/0) oder von deiner IP-Adresse
5. Kopiere den Verbindungsstring und ersetze `username`, `password` und `trnt-app` mit deinen Werten

### Deployment auf Render.com

1. Erstelle ein kostenloses Konto auf [Render](https://render.com)
2. Klicke auf "New" und wähle "Web Service"
3. Verbinde dein GitHub-Repository oder lade den Code direkt hoch
4. Setze folgende Einstellungen:
   - Name: trnt-app
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. Füge deine Umgebungsvariablen hinzu:
   - `PORT`: 10000 (Render verwendet diesen Port automatisch)
   - `MONGODB_URI`: Dein MongoDB Atlas Verbindungsstring
6. Klicke auf "Create Web Service"

### Deployment auf Railway.app

1. Erstelle ein kostenloses Konto auf [Railway](https://railway.app)
2. Starte ein neues Projekt und wähle "Deploy from GitHub"
3. Verbinde dein GitHub-Repository
4. Füge deine Umgebungsvariablen hinzu:
   - `PORT`: 3000
   - `MONGODB_URI`: Dein MongoDB Atlas Verbindungsstring
5. Railway erkennt automatisch, dass es sich um eine Node.js-App handelt und startet den Deployment-Prozess

### Deployment auf Vercel

1. Erstelle ein kostenloses Konto auf [Vercel](https://vercel.com)
2. Importiere dein GitHub-Repository
3. Konfiguriere das Projekt:
   - Framework Preset: Other
   - Build Command: `npm install`
   - Output Directory: `public`
   - Install Command: `npm install`
4. Füge deine Umgebungsvariablen hinzu:
   - `PORT`: 3000
   - `MONGODB_URI`: Dein MongoDB Atlas Verbindungsstring
5. Klicke auf "Deploy" 