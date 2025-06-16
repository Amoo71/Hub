# TRNT App mit Supabase und Vercel

Diese Anleitung beschreibt, wie Sie die TRNT App mit Supabase als Datenbank und Vercel als Hosting-Plattform einrichten.

## Schritt 1: Supabase Konto erstellen und Projekt einrichten

1. Gehen Sie zu [supabase.com](https://supabase.com/) und erstellen Sie ein Konto
2. Erstellen Sie ein neues Projekt und merken Sie sich die Projektdaten:
   - URL
   - API Key (anon, public)

## Schritt 2: Supabase SQL-Funktionen erstellen

Gehen Sie in Ihrem Supabase-Projekt zum SQL-Editor und führen Sie die folgenden SQL-Befehle aus:

```sql
-- Hilfsfunktionen für Tabellenerstellung
CREATE OR REPLACE FUNCTION create_requests_table_if_not_exists()
RETURNS void AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    designType TEXT NOT NULL,
    idName TEXT NOT NULL,
    time TEXT NOT NULL,
    timestamp BIGINT NOT NULL
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_anti_tamper_logs_table_if_not_exists()
RETURNS void AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS anti_tamper_logs (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    timestamp BIGINT NOT NULL
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_album_items_table_if_not_exists()
RETURNS void AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS album_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    imageUrl TEXT NOT NULL,
    acc TEXT NOT NULL,
    pw TEXT NOT NULL,
    timestamp BIGINT NOT NULL
  );
END;
$$ LANGUAGE plpgsql;
```

## Schritt 3: Umgebungsvariablen in Vercel einrichten

1. Gehen Sie zu Ihrem Vercel-Projekt
2. Klicken Sie auf "Settings" > "Environment Variables"
3. Fügen Sie diese Variablen hinzu:
   - `SUPABASE_URL`: Ihre Supabase-Projekt-URL (z.B. https://abcdefghijklm.supabase.co)
   - `SUPABASE_KEY`: Ihr Supabase anon/public API key

## Schritt 4: Anwendung bereitstellen

1. Stellen Sie sicher, dass Sie die aktualisierten Dateien zu GitHub gepusht haben:
   ```
   git add .
   git commit -m "Migration zu Supabase"
   git push
   ```

2. Verbinden Sie Ihr GitHub-Repository mit Vercel (falls noch nicht geschehen)

3. Klicken Sie auf "Deploy" in Vercel

4. Nach dem Deployment ist Ihre App online und mit Supabase verbunden!

## Fehlerbehebung

Falls Probleme auftreten:

1. Überprüfen Sie die Vercel-Logs, um zu sehen, ob Fehler auftreten
2. Stellen Sie sicher, dass die Umgebungsvariablen korrekt eingerichtet sind
3. Überprüfen Sie die SQL-Tabellen in Supabase, ob sie korrekt erstellt wurden 