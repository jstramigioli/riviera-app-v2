# Informe de datos ambiguos (no importar en silencio)

Generado: 2026-10-27T20:57:22.491Z
Extracción: 2026-10-27T20:57:21.765Z
Total filas: 2 · Ambiguas: 0

| Archivo | Línea | Unidad | In | Out | Huésped | Notas |
|---|---:|---|---|---|---|---|

## Acción requerida

- Resolver cada fila con recepción antes del import staging.
- Tras corrección, re-correr extract + report.
- Solo `confidence=high` entra a `migration:import-staging`.
