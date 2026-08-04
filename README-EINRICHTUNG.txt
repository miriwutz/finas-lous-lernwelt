MEIN LERNWALD 2.0 – NÄCHSTE SCHRITTE

Diese vier Dateien gehören gemeinsam in die oberste Ebene deines GitHub-Repositories:
- index.html
- style.css
- firebase.js
- app.js

1. FIRESTORE-REGELN
   Firebase öffnen → Firestore → Regeln.
   Den Inhalt aus firestore.rules.txt einfügen und „Veröffentlichen“ klicken.
   Ohne diese Regeln blockiert der Produktionsmodus alle Datenzugriffe.

2. GITHUB
   Die bisherige index.html ersetzen.
   style.css, firebase.js und app.js zusätzlich hochladen.
   Danach Commit changes.

3. TEST
   Die GitHub-Seite neu laden.
   Mit der bereits in Firebase angelegten E-Mail und dem Passwort anmelden.
   Auf dem PC und beiden Tablets einmal anmelden. Firebase merkt sich die Anmeldung.

4. FUNKTIONSWEISE
   - Aufgabe abhaken → Lernblatt wächst oben und wird auf allen Geräten synchronisiert.
   - Herzmoment speichern → Wurzel wächst unten und wird synchronisiert.
   - Mama-Bereich → Passwort erneut eingeben, Aufgaben und Baumziel bearbeiten.
   - Wenn die Lernkrone voll ist, kann der Baum in den Lernwald gesetzt werden.

WICHTIG
Die Firebase-Konfiguration im Quellcode ist bei Web-Apps grundsätzlich sichtbar.
Die Sicherheit entsteht durch Firebase Authentication und die Firestore-Regeln,
nicht durch das Verstecken des API-Schlüssels.
