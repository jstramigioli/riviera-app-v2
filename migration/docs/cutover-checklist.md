# Checklist de corte Excel → PMS

- [ ] Backup Postgres staging y producción
- [ ] Excel original hasheado en `migration/original/`
- [ ] `ambiguous-report.md` revisado con Melina/Julián
- [ ] 0 imports `confidence!=high` automáticos
- [ ] Calendario 14 días validado visualmente vs Excel
- [ ] Saldos de 10 reservas muestra coinciden
- [ ] Fecha/hora de corte acordada
- [ ] Excel marcado “solo lectura / archivo”
- [ ] Usuarios producción con roles correctos
- [ ] Cotización blue del día cargada
- [ ] Plan de rollback: restore `pg_dump` + reabrir Excel
