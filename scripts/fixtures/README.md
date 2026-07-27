# Test-Fixtures

Dateien in diesem Ordner werden **ausschliesslich von den Playwright-Tests**
verwendet — die Produktion lädt ihre Bibliotheken unverändert vom CDN.

## frappe-gantt 0.6.1 (MIT)

`frappe-gantt-0.6.1.min.js` / `.min.css` sind unveränderte Kopien von
<https://unpkg.com/frappe-gantt@0.6.1/dist/> (Copyright © Frappe Technologies
Pvt. Ltd., MIT-Lizenz — <https://github.com/frappe/gantt/blob/master/LICENSE>).

Grund: Die Test-Umgebung blockt externe Hosts (siehe
`scripts/rolematrix_harness.mjs`). Ohne lokale Kopie könnte
`scripts/terminplan_ansicht_test.mjs` das Gantt-Diagramm gar nicht rendern und
damit weder Balkenlängen noch Drag & Drop prüfen. Der Test routet die
CDN-URL auf diese Datei um.

**Beim Versionswechsel in `pm_terminplan.html` hier mitziehen** — sonst prüft
der Drift-Guard eine andere Bibliotheksversion als die Produktion.
