# TRNT App

Eine Anwendung zur Verwaltung von Anfragen und Alben.

## Installation

```bash
npm install
```

## Lokale Entwicklung

1. Erstelle eine `.env` Datei im Hauptverzeichnis mit folgendem Inhalt:
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/trntapp
```

2. Starte den lokalen Entwicklungsserver:
```bash
npm start
```

## Vercel Deployment

1. Stelle sicher, dass alle Dateien auf GitHub gepusht wurden
2. Verbinde dein Vercel-Konto mit dem GitHub-Repository
3. Konfiguriere die folgende Umgebungsvariable in Vercel:
   - `MONGODB_URI`: Die MongoDB-Verbindungszeichenfolge

Die Anwendung wird automatisch bei jedem Push auf den Master/Main-Branch deployt.

## Technologien

- Node.js/Express
- MongoDB 
- Socket.IO für Echtzeit-Kommunikation 