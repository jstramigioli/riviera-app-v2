# PMS Riviera — Especificación funcional detallada

**Versión:** 1.2  
**Fecha:** 2026-10-27  
**Estado:** Documento de requisitos (activo; implementación en `riviera-app-v2`)  
**Repos de implementación:** `jstramigioli/riviera-app-v2` (greenfield). El legacy `riviera-app` se usa solo como inspiración de UX.  
**Base:** conversación de discovery (ChatGPT) capturada en el plan MVP + `requirements-v0.1.md` + `project-context.md` + feedback de Julián (2026-10-27).  
**Precedencia:** este documento **expande** el MVP 0.1; **no lo contradice**. Donde v0.1 tiene un checklist corto, aquí se define comportamiento esperable por implementadores.  
**v1.1:** §1.5 copy hotelero + §5.6 disponibilidad en vivo (feedback Julián / Melina).  
**v1.2:** Consulta = entidad `Query` (no status de reserva); asignación flexible vs fijada; optimizador manual con preview (PMS-9 / PMS-10).

---

## 1. Purpose & principles

### 1.1 Propósito

PMS web propio para **Hotel Riviera** (Mar del Plata) que reemplace el Excel operativo como fuente de verdad. Recepción debe poder operar temporada (y pretemporada) solo con el sistema: calendario, reservas, tarifas, huéspedes y pagos ARS/USD, con integridad de disponibilidad (sin sobreventa).

No se adapta Kamra, HotelDruid ni QloApps (licencia AGPL / dominio distinto). Open source externo solo como referencia de UX, no como base de código.

### 1.2 Objetivos operativos

1. Una sola fuente de verdad por reserva; el **calendario es vista**, no almacén paralelo.
2. Sin sobreventa de unidades físicas, incluidas las **compuestas** (8+9, 35+36).
3. UX centrada en el calendario; operación diaria sin hojas de cálculo.
4. Configuración en UI (atributos, categorías, tarifas, compuestos), no reglas hardcodeadas de Riviera en la lógica de negocio.
5. Precio acordado congelado al confirmar; override manual auditado.
6. Deuda en ARS; pagos USD con importe + cotización blue manual.
7. Roles `admin` / `recepcion` con sesión.
8. Multitenencia **fuera del MVP**; el schema puede llevar `tenantId` preparado pero sin activar.

### 1.3 Principios de diseño de producto

| Principio | Implicación concreta |
|-----------|----------------------|
| Calendario primero | Crear/editar/cancelar y ver ocupación desde el calendario; otras pantallas apoyan |
| Asignación concreta | Prerreserva/reserva siempre con habitación (provisoria OK). La **consulta** es entidad aparte **sin** habitación |
| Tags > texto libre | Requisitos de habitación se expresan con atributos/tags que **filtran**/sugieren candidatos; notas libres son secundarias |
| Obligatorio ≠ preferencia | Un atributo marcado obligatorio restringe candidatos; uno preferido solo ordena/destaca |
| Estado operativo ≠ pago | Confirmar no exige seña; seña no confirma sola |
| Ayuda contextual | Campos no obvios (p. ej. tramos) llevan `?` con hover/tooltip |
| Prueba reproducible | Cada área mayor tiene criterios de aceptación verificables (sección 12) |

### 1.4 Stack (contexto, no requisito de producto)

Next.js App Router + TypeScript, Route Handlers / Server Actions, PostgreSQL + Prisma (solo migraciones; nunca `db push` con datos reales), iron-session + bcrypt, Vitest, deploy Vercel + Postgres.

### 1.5 Lenguaje de UI (hotelero — obligatorio)

Melina (recepción) debe entender **cada etiqueta sin docs de entrenamiento**.

| Interno (código / schema) | UI (español hotelero) |
|---------------------------|------------------------|
| `PhysicalUnit` / “unidad física” | **Habitación** o **Departamento** según `kind` |
| `CompositeUnit` / “compuesta” | **Habitaciones comunicadas** (p. ej. 8+9, 35+36) |
| `AssignmentSegment` | **Tramo de estadía** / **Cambio de habitación** |
| `UnitAttribute` | **Característica** de la habitación |
| `RequirementKind.MANDATORY` | **Obligatorio** |
| `RequirementKind.PREFERENCE` | **Preferencia** |
| `IN_HOUSE` | **En casa** |
| `Query` | **Consulta** |
| `doNotMove` / roomLocked | **Habitación fijada** (vs **asignación flexible**) |
| RatePlan (admin) | **Plan tarifario** (evitar “RatePlan” en copy de recepción) |

**Prohibido en UI:** “unidad física”, “AssignmentSegment”, “CompositeUnit”, “compuesta” como término primario, nombres de enums crudos en inglés.

El código TypeScript/Prisma **puede** seguir usando nombres de dominio en inglés.

---

## 2. Domain model

Modelo alineado al schema de `riviera-app-v2`. Los nombres de entidad son canónicos para implementadores.

### 2.1 PhysicalUnit (unidad física)

Habitación o departamento real que ocupa una fila del calendario.

| Campo / concepto | Descripción |
|------------------|-------------|
| `code` | Identificador operativo único (p. ej. `"8"`, `"D1"`) |
| `name` | Nombre visible |
| `kind` | `HABITACION` \| `DEPARTAMENTO` |
| `floor` | Planta (opcional) |
| `capacity` | Capacidad física máxima de personas |
| `sortOrder` | Orden de filas en calendario |
| `active` | Si false, no se ofrece para nuevas asignaciones |
| `commercialCategoryId` | Categoría comercial actual (reasignable) |
| `tenantId` | Hook futuro; ignorado en MVP |
| atributos | Vía `UnitAttributeLink` (N:M con `UnitAttribute`) |

**Inventario seed Riviera (MVP):** códigos `1`–`36` excepto `4` y `20`, más deptos `D1`/`D2`/`D3`. Capacidades y categorías comerciales son configurables; el seed es punto de partida, no lógica hardcodeada.

### 2.2 UnitAttribute (atributos / tags de unidad)

Catálogo administrable de características físicas u operativas (balcón, vista al mar, planta baja, AC, etc.).

| Campo | Descripción |
|-------|-------------|
| `key` | Clave estable única (`balcon`, `vista_mar`, …) |
| `label` | Etiqueta UI |

Cada `PhysicalUnit` puede tener cero o más atributos. **Estos atributos son la base del filtrado de requisitos** al crear/editar reservas (sección 5).

> **Refinamiento respecto a v0.1 / schema actual:** hoy `Reservation.requirements` / `preferences` son `String?`. Para cumplir el feedback de Julián, el producto debe modelar requisitos estructurados (p. ej. `ReservationRequirement` o JSON tipado con `attributeId` + `kind: MANDATORY | PREFERENCE`). El texto libre queda como **notas adicionales**, no como UX primaria. Ver §5 y §13.

### 2.3 CommercialCategory

Cómo se **vende** la unidad (Standard, Superior, Departamento, Compuesta, …). Independiente de los atributos físicos. Reasignable sin cambiar código. Las tarifas (`RatePlan`) se anclan a categoría + tipo de servicio + período.

### 2.4 CompositeUnit (8+9 y 35+36)

Unidad comercial que agrupa **dos o más** `PhysicalUnit` miembros.

| Regla | Detalle |
|-------|---------|
| Vender compuesta | Bloquea **todos** los componentes físicos en el rango |
| Ocupar un componente | Bloquea la venta de cualquier compuesta que lo incluya |
| Representación en ocupación | Al reservar compuesta, se materializan `AssignmentSegment` por cada miembro con `compositeUnitId` seteado (modelo v2) |
| Seed MVP | `8+9` y `35+36` |

Las compuestas pueden aparecer como filas “lógicas” o como opción de asignación; la integridad siempre se mide en unidades físicas.

### 2.5 RatePlan / Rate

- `RatePlan`: categoría comercial + `ServiceType` (`SIN_DESAYUNO` \| `DESAYUNO` \| `MEDIA_PENSION`) + activo.
- `Rate`: tramos de vigencia (`validFrom`/`validTo`) con `amountArs`.

Sirven para **proponer** precio; el precio de la reserva vive en `agreedPriceArs` (sección 7).

### 2.5b Query (Consulta) — entidad aparte

Indagación / borrador de intención. **No** es un `ReservationStatus`. Inspiración legacy `Query`.

| Campo / concepto | Descripción |
|------------------|-------------|
| `code` | Código visible (`CON-…`) |
| `status` | `OPEN` \| `CONVERTED` \| `ARCHIVED` |
| Fechas / ocupación / servicio | Igual semántica que reserva (`checkIn`/`checkOut` exclusivo, adults/children, serviceType) |
| Cliente | Nombre/tel/doc en la consulta y/o vínculo a `Guest` |
| Requisitos | `QueryRequirement` (tags mandatory/preference) + notas |
| Habitación | **Ninguna** — no hay `AssignmentSegment`; no bloquea inventario |
| Calendario | **No aparece** |
| Conversión | Al convertir → crea `Reservation` con habitación (`PRERRESERVA` o `CONFIRMADA`) y marca la query `CONVERTED` |

**Autosave:** debounce en cliente tras fechas mínimas (cliente recomendado). UX en sección **Consultas** (listar / abrir / editar / eliminar / convertir).

### 2.6 Reservation

Cabecera de la reserva (una estadía comercial, posiblemente con varios tramos y/o grupo).

| Concepto | Detalle |
|----------|---------|
| `code` | Código único visible |
| `status` | Estado **operativo** (sección 3). Alta nueva: `PRERRESERVA` / `CONFIRMADA` / … — **no** crear `CONSULTA` |
| `paymentStatus` | Estado de **pago** derivado/actualizado (sección 3); independiente |
| `channel` | Canal de origen (texto/config: teléfono, walk-in, Wix, etc.) |
| `doNotMove` | **Habitación fijada** (`roomLocked`): inamovible salvo desbloqueo deliberado. `false` = **asignación flexible** (sección 6.3 / 6.4) |
| Fechas | `checkInDate` / `checkOutDate` (checkout **exclusivo**: la noche del checkout no se ocupa) |
| Ocupación persona | `adults`, `children` |
| `serviceType` | Servicio contratado |
| Precio | `agreedPriceArs`, `priceFrozen`, `priceOverrideNote` |
| `groupId` | Opcional; vínculo a `ReservationGroup` |
| Segmentos | 1..N `AssignmentSegment` que cubren el rango de estadía (**obligatorio** en prerreserva+) |
| Huéspedes | vía `ReservationGuest` |
| Pagos | vía `Payment` |
| Origen | Opcional: consulta convertida (`Query.convertedReservationId`) |

### 2.7 AssignmentSegment (tramos)

Tramo de asignación de una unidad física a una reserva en un sub-rango de fechas.

| Campo | Descripción |
|-------|-------------|
| `reservationId` | Reserva dueña |
| `physicalUnitId` | Unidad física ocupada |
| `compositeUnitId` | Si el tramo forma parte de una venta compuesta |
| `startDate` / `endDate` | Rango del tramo (checkout exclusivo) |
| `sortOrder` | Orden dentro de la reserva |

**Invariantes:**

1. La unión de tramos de una reserva debe cubrir `[checkInDate, checkOutDate)` sin huecos ni solapes entre sí (salvo reglas explícitas de grupo; ver §6).
2. Dos reservas en estados **bloqueantes** no pueden solapar la misma unidad física.
3. Estados bloqueantes de disponibilidad: `PRERRESERVA`, `CONFIRMADA`, `IN_HOUSE`. (`CANCELADA` / `FINALIZADA` no bloquean. Las consultas `Query` no tienen segmentos.)
4. Cambio mid-stay = misma `Reservation`, N segmentos contiguos (sección 6).

### 2.8 ReservationGroup (grupos)

Agrupa varias `Reservation` (p. ej. familia en dos habitaciones). Cada reserva del grupo tiene sus propios segmentos, precio y pagos; el grupo es vínculo operativo/UX (nombre, notas).

### 2.9 Guest / ReservationGuest

- `Guest`: ficha persistente (nombre, documento, contacto, notas).
- `ReservationGuest`: vínculo con rol `TITULAR` \| `ACOMPANANTE`. Una reserva tiene exactamente un titular en MVP (si se relaja, documentar en §13).

### 2.10 Payment

| Campo | Descripción |
|-------|-------------|
| `type` | `SENIA` \| `PARCIAL` \| `FINAL` \| `DEVOLUCION` |
| `currency` | `ARS` \| `USD` |
| `amountOriginal` | Importe en moneda del pago |
| `fxRateToArs` | Obligatorio si USD (cotización blue manual al momento del registro) |
| `amountArs` | Equivalente ARS que impacta el saldo |
| `receiptNumber` | Recibo interno único |
| Soft-void | `voidedAt` + `voidReason`; sin borrado silencioso |

### 2.11 User / AuditLog / AppSetting

- Usuarios con `Role`: `ADMIN` \| `RECEPCION`.
- `AuditLog`: quién, qué entidad, before/after, meta.
- `AppSetting`: p. ej. cotización blue sugerida (`usd_blue_rate`); editable, no hardcode.

### 2.12 Diagrama conceptual

```text
PhysicalUnit ─── UnitAttribute (N:M)
PhysicalUnit ─── CommercialCategory
CompositeUnit ── PhysicalUnit (miembros)
CommercialCategory ── RatePlan ── Rate
Query ── QueryRequirement ── UnitAttribute
Query ──(convert)──→ Reservation
Reservation ── AssignmentSegment ── PhysicalUnit
Reservation ── AssignmentSegment ── CompositeUnit?
Reservation ── ReservationGroup?
Reservation ── ReservationGuest ── Guest
Reservation ── Payment
Reservation ── ReservationRequirement ── UnitAttribute
```

---

## 3. Reservation statuses vs payment status

### 3.1 Estado operativo (`Reservation.status`)

| Estado | Significado | ¿Bloquea disponibilidad? |
|--------|-------------|---------------------------|
| `CONSULTA` | **Legado** en enum; **no crear**. Indagaciones = entidad `Query` (§2.5b) | N/A (no usar) |
| `PRERRESERVA` | Compromiso blando: **siempre con habitación**; bloquea | Sí |
| `CONFIRMADA` | Confirmada operativamente | Sí |
| `IN_HOUSE` | Huésped en casa (post check-in) | Sí |
| `FINALIZADA` | Check-out hecho; histórica | No |
| `CANCELADA` | Anulada | No |

**Flujo consulta → reserva:**

```text
Query (OPEN, sin habitación) ──convertir──→ PRERRESERVA | CONFIRMADA  (con habitación)
PRERRESERVA → CONFIRMADA → IN_HOUSE → FINALIZADA
         ↘ CANCELADA              ↗
Cualquier estado no final → CANCELADA (con auditoría)
FINALIZADA / CANCELADA: sin reabrir en MVP (o solo admin; §13)
```

Colores + etiquetas visibles en calendario y ficha para estados de **reserva**. Las consultas se listan solo en **Consultas**.

### 3.2 Estado de pago (`Reservation.paymentStatus`)

Derivado de pagos netos vs `agreedPriceArs` (cuando exista):

| Estado | Criterio orientativo |
|--------|----------------------|
| `SIN_PAGO` | Sin pagos vigentes |
| `SENIA_PARCIAL` | Hay seña/parcial y saldo > 0 (y aún no “parcial genérico” si se prefiere distinguir seña) |
| `PARCIAL` | Pagos parciales, saldo > 0 |
| `SALDADO` | Pagos netos ≥ precio acordado |
| `A_FAVOR` | Pagos netos > precio acordado |

Implementación puede unificar `SENIA_PARCIAL`/`PARCIAL` en UI si se acuerda; el enum ya existe en schema.

### 3.3 Independencia crítica (seña ≠ confirmación)

**Regla de producto (fijada en discovery y principios):**

1. Registrar una **seña** actualiza el estado de **pago**; **no** cambia automáticamente el estado operativo a `CONFIRMADA`.
2. Pasar a `CONFIRMADA` es acción explícita de recepción/admin (o flujo de confirmación), **sin** exigir seña.
3. Puede existir reserva `CONFIRMADA` + `SIN_PAGO`, o `PRERRESERVA` + `SENIA_PARCIAL`.
4. La UI debe mostrar ambos estados por separado (badge operativo ≠ badge de pago).

Congelar precio (`priceFrozen`) ocurre al confirmar (sección 7), no al cobrar seña.

---

## 4. Calendar UX (center of product)

### 4.1 Rol

El calendario es la **pantalla principal** de operación diaria. Melina (recepción) debe ver 1–2 semanas y crear/editar/cancelar sin salir a Excel.

### 4.2 Layout

| Elemento | Comportamiento |
|----------|----------------|
| Filas | Unidades físicas (y, si se decide, filas de compuestas) en `sortOrder` |
| Columnas | Días del período visible |
| Navegación | Al menos ventanas de **7 y 14 días**; prev/next; saltar a fecha |
| Bloques | Un bloque por segmento (o por reserva si un solo tramo) ocupando celdas `[start, end)` |
| Codificación | Color + etiqueta de `status`; indicador visual de `doNotMove`; indicador de pago opcional (ícono, no sustituye el estado operativo) |
| Interacción | Click en celda vacía → alta con unidad+fechas prellenadas; click en bloque → ficha/edición |
| Densidad | Legible en desktop; scroll horizontal/vertical aceptable; mobile usable en lectura, edición completa puede ser desktop-first en MVP |

### 4.3 Disponibilidad visual

- Celdas ocupadas por estados bloqueantes no ofrecen “crear aquí” para esa unidad/día.
- Conflictos detectados en servidor siempre; la UI no es la única guarda.
- Las **consultas no aparecen** en el calendario (van a sección Consultas).

### 4.4 Ayuda contextual (Julián 2026-10-27)

En calendario y formularios de reserva, campos no obvios llevan un control **`?`** con tooltip al hover (y focus accesible), en particular:

- Qué es un **tramo** / por qué una reserva puede tener varios.
- Diferencia **obligatorio vs preferencia** en requisitos.
- Qué hace **habitación fijada** vs **asignación flexible**.
- Que **seña no confirma** sola.
- Checkout exclusivo (la fecha de salida no cuenta como noche ocupada).
- Que el **optimizador** es manual y muestra preview antes de aplicar.

---

## 5. Room assignment & tag-based requirements (CRÍTICO — feedback Julián 2026-10-27)

### 5.1 Asignación concreta solo desde disponibles

**Consultas (`Query`):** sin habitación; no bloquean; no van al calendario. Ver §2.5b.

Al **crear prerreserva/reserva** (y al cambiar fechas/unidad al editar):

1. El usuario elige fechas (`checkIn` / `checkOut`) y una **unidad concreta** (provisoria OK si es flexible).
2. El selector lista unidades (y comunicadas elegibles) **disponibles** para ese rango.
3. No se permite guardar una asignación a una unidad ocupada; el servidor rechaza con conflicto explícito.
4. Toda **prerreserva/reserva** tiene al menos un `AssignmentSegment` con unidad concreta. “Sin habitación” = solo consulta (`Query`), no allotment flotante en calendario.
5. Capacidad: advertir (o bloquear, según política §13) si `adults + children` > `capacity` de la unidad elegida.
6. Al **convertir** consulta: sugerir por tags; permitir habitación que no cumple mandatory con **advertencia explícita + motivo** (override auditado).

### 5.2 Requisitos vía sistema de tags/atributos (no texto libre primario)

**Prohibido como UX primaria:** un único textarea “requisitos de habitación” como forma de expresar necesidades que deberían filtrar inventario.

**UX requerida:**

1. Catálogo de `UnitAttribute` (admin) asignado a cada `PhysicalUnit`.
2. En el formulario de reserva, el usuario marca atributos como:
   - **Obligatorio (mandatory):** la unidad candidata **debe** tener el atributo. Si no hay ninguna disponible con todos los obligatorios → mensaje claro; no se fuerza una unidad incompatible.
   - **Preferencia (preference):** no excluye candidatos; **ordena o destaca** primero las que cumplen (p. ej. badge “cumple preferencias”).
3. Al cambiar fechas o tags, se **recalcula** la lista de candidatos disponibles.
4. Al elegir unidad concreta, se puede relajar la UI de tags (como en legacy: tags deshabilitados si ya hay room fija) **pero** se conservan los requisitos estructurados en la ficha para auditoría y re-asignación futura.
5. **Notas adicionales** (textarea) solo para matices no modelados (“lo más lejos del ascensor”); no sustituyen el filtro.

### 5.3 Distinción mandatory vs preference (discovery ChatGPT)

| Tipo | Efecto en candidatos | Efecto al guardar |
|------|----------------------|-------------------|
| Mandatory | Filtra (AND de todos) | Persistir; validar que la unidad asignada los cumple (salvo override admin auditado) |
| Preference | No filtra; rankea | Persistir; no bloquear si la unidad no los cumple |

Canal de origen (`channel`) es independiente de requisitos.

### 5.4 Inspiración legacy `riviera-app` (qué reusar / descartar)

Revisión puntual de `https://github.com/jstramigioli/riviera-app` (tags, `ReservationRequirements`, `EtiquetasTab`, virtual rooms):

| Reusar como inspiración | Descartar / no copiar a ciegas |
|-------------------------|--------------------------------|
| Toggle visual de etiquetas al armar requerimientos | Dynamic pricing / curves / season blocks complejos del legacy |
| Catálogo admin de etiquetas (CRUD nombre; color opcional) | Modelo “requiredRoomId opcional + tags” sin filtrar por **disponibilidad de fechas** en el selector |
| Separar notas adicionales del selector de tags | Cargos/consumos, tabs de servicios/mantenimiento, frigobar |
| Idea de segmentos multi-habitación / multi-fecha | Virtual rooms naming; stack de tarifas V2/V3 y proportional pricing |
| Calendario tipo grilla como centro | Copy-paste de CSS/componentes; AGPL-adjacent patterns de terceros |

**Mejora explícita vs legacy:** el selector de habitación debe filtrar por **disponibilidad en el rango** + capacidad + atributos mandatory; el legacy filtraba sobre todo por capacidad/tags sin el contrato fuerte de integridad del v2.

### 5.5 Ayuda `?` en este flujo

Tooltips mínimos:

- “Obligatorio: solo se listan habitaciones libres que tengan esta característica.”
- “Preferencia: se muestran todas las libres; las que cumplen aparecen primero.”
- “Tramos: si el huésped cambia de habitación a mitad de estadía, la misma reserva se parte en varios tramos contiguos.”

### 5.6 Disponibilidad en vivo (alta / consulta) — feedback Julián 2026-10-27

El formulario de **nueva reserva / consulta** debe actualizarse **en tiempo real** al cambiar fechas, huéspedes, servicio o tags:

1. **¿Hay disponibilidad?** Sí/No visible de inmediato (no solo al guardar).
2. **Lista de habitaciones libres** (y habitaciones comunicadas elegibles) para el rango, filtrada por tags mandatory y ordenada por preferences.
3. **Servicios con tarifa en esas fechas:** Sin desayuno / Desayuno / Media pensión — indicar si hay cobertura de tarifas para las noches pedidas (y sugerir precio cuando haya habitación + servicio elegidos).
4. Asignación **solo** desde esa lista de libres; el servidor revalida (HAB-08 / integridad).
5. UX: feedback inmediato (panel de disponibilidad, chips de servicio, cards de habitación) sin recargar la página completa.

Criterio de aceptación: RES-11 (nuevo) — ver §12.2.

---

## 6. Groups, mid-stay room changes (tramos), “no mover”

### 6.1 Tramos (AssignmentSegment)

**Caso de uso:** huésped en hab. 12 del 1 al 5, y en hab. 18 del 5 al 10 → **una** `Reservation`, **dos** segmentos contiguos.

Reglas:

1. Segmentos de una misma reserva no se solapan en fechas.
2. Son contiguos: `endDate` de uno = `startDate` del siguiente (mismo instante de corte; sin noche huérfana).
3. La unión cubre exactamente `[checkInDate, checkOutDate)`.
4. Cada segmento tiene su `physicalUnitId` (o expansión de compuesta).
5. Edición: UI debe permitir agregar/partir/mover tramos con validación de disponibilidad por tramo.
6. Tooltip `?` obligatorio cerca del editor de tramos.

### 6.2 Grupos

- Varias reservas vinculadas por `ReservationGroup` (varias unidades **en paralelo** el mismo período o solapado).
- Cada reserva del grupo mantiene precio, pagos y segmentos propios.
- UX: crear grupo desde calendario (multi-selección o “agregar habitación al grupo”); navegar entre reservas hermanas.
- Cancelar una reserva del grupo no cancela automáticamente las demás (confirmación explícita si se ofrece “cancelar grupo”).

### 6.3 Habitación fijada vs asignación flexible (`doNotMove` / roomLocked)

| Modo | Persistencia | Comportamiento |
|------|--------------|----------------|
| **Fijada** | `doNotMove=true` | Inamovible para el optimizador; recepción solo cambia con desbloqueo deliberado |
| **Flexible** | `doNotMove=false` | Se puede reasignar entre habitaciones **compatibles** (tags mandatory + libres en el rango) |

- Visible en calendario (🔒) y ficha; copy hotelero: «Habitación fijada» / «Asignación flexible».
- Los requisitos (tags) se **persisten** en la reserva para reasignación futura.
- Independiente del estado de pago.

### 6.4 Optimizador de ocupación (manual)

1. Solo disparo **manual** (botón en calendario / pantalla Optimizar).
2. Calcula un **preview**: qué reservas flexibles se mueven de qué habitación a cuál y por qué (menos huecos / mejor ocupación).
3. Requiere **confirmación explícita** antes de aplicar.
4. **Nunca** mueve: habitaciones fijadas (`doNotMove`) ni `IN_HOUSE`.
5. Solo candidatos `PRERRESERVA` / `CONFIRMADA` flexibles, de un solo tramo físico (MVP).
6. Al aplicar, revalida disponibilidad y tags mandatory.

---

## 7. Tariffs, agreed price freeze

### 7.1 Tarifas configurables

- CRUD de `RatePlan` / `Rate` en UI (`/tarifas`).
- Precio sugerido al crear/editar según categoría de la unidad asignada (o de la compuesta), `serviceType` y noches del rango.
- Ocupación comercial vs capacidad física: el sistema puede sugerir según categoría; no inventar motor de dynamic pricing en MVP (legacy se descarta).

### 7.2 Precio acordado

| Momento | Comportamiento |
|---------|----------------|
| Antes de confirmar | `agreedPriceArs` editable; sugerido desde tarifas; `priceFrozen=false` |
| Al pasar a `CONFIRMADA` | Se **congela** (`priceFrozen=true`); cambios posteriores de `Rate` **no** alteran este valor |
| Override manual | Permitido con nota (`priceOverrideNote`) + **AuditLog**; rol recepción puede override con nota; política admin-only es §13 |
| Seña | No congela precio por sí sola |

Descuentos niños / stacking de promociones: **no** cerrados (§13); MVP admite override manual del total.

---

## 8. Guests / check-in

### 8.1 Fichas

- CRUD de `Guest` independiente (`/huespedes`).
- En reserva: titular obligatorio + acompañantes opcionales.
- Campos mínimos MVP: nombre, apellido; documento (tipo/número) recomendado; email/teléfono/nacionalidad opcionales.
- Campos legales obligatorios definitivos: pendiente Julián (§13).

### 8.2 Check-in / check-out

| Acción | Efecto |
|--------|--------|
| Check-in | `CONFIRMADA` → `IN_HOUSE` (fecha de llegada = hoy o día de check-in; exactitud horaria fuera de MVP) |
| Check-out | `IN_HOUSE` → `FINALIZADA` |
| Listados | Llegadas / salidas / in-house por fecha (`/operacion`) |

### 8.3 Check-in online público

**Fuera de MVP.** El modelo de huéspedes debe permitir extenderlo después sin reescritura.

---

## 9. Payments

### 9.1 Tipos y saldo

- Tipos: seña, parcial, final, devolución.
- Saldo visible: `agreedPriceArs − Σ(amountArs de pagos no void)` (devoluciones restan o se registran negativas según convención única; documentar en código y UI).
- Actualización de `paymentStatus` tras cada alta/void.

### 9.2 Monedas

- Deuda siempre expresada en **ARS**.
- Pago USD: usuario ingresa `amountOriginal` + `fxRateToArs` (sugerido desde `AppSetting` blue, editable por pago); sistema calcula `amountArs`.
- Ambos campos obligatorios si `currency=USD`.

### 9.3 Recibos y void

- Cada pago genera recibo interno (`/recibos/[id]`).
- Sin borrado silencioso: solo soft-void auditado (preferentemente admin).
- Seña **no** dispara confirmación automática (reiterado §3.3).

### 9.4 Política de cancelación / devolución de señas

Pendiente (§13). MVP permite cargar `DEVOLUCION` manualmente.

---

## 10. Admin / audit

### 10.1 Roles

| Rol | Capacidades MVP |
|-----|-----------------|
| `RECEPCION` | Calendario, reservas, huéspedes, pagos, operación diaria; lectura de tarifas |
| `ADMIN` | Todo lo de recepción + inventario/atributos/categorías/compuestas, tarifas, usuarios, auditoría, void de pagos, export, settings |

Permisos enforced en Server Actions / API, no solo en UI.

### 10.2 Auditoría

Registrar al menos: creación/cambio de estado de reserva, cambios de asignación/tramos, override de precio, void de pagos, cambios de inventario críticos.

UI `/admin` para consulta de `AuditLog`.

### 10.3 Export / backup / migración

- Export CSV/JSON de reservas (y entidades clave).
- Backup/restore documentado.
- Pipeline Excel: original intacto → extract → informe de ambiguos → staging (`ALLOW_STAGING_IMPORT=1`) → cutover; sin import silencioso de dudosos (`MIG-*` en v0.1).

---

## 11. Out of scope / later

Explicitamente **fuera del MVP** (coincidente con v0.1 / plan):

- Consumos / frigobar / cargos de minibar
- Caja diaria / cierre de caja
- Check-in online público
- Stats / BI avanzados
- Mail / WhatsApp automáticos
- Motor de reservas web / booking engine
- OTA / channel manager
- Buffet como feature dedicada (eventual “cargo genérico” post-MVP)
- Multitenencia activa
- Dynamic pricing / curvas / season blocks del legacy
- Allotment flotante en calendario (reservas bloqueantes sin habitación). Las **consultas** sin habitación sí están en scope vía entidad `Query`.
- Optimizador automático / en background (solo manual con preview)

---

## 12. Acceptance criteria per major area

Criterios **ampliados** sobre HAB/RES/TAR/HUE/PAG/SYS/MIG de `requirements-v0.1.md`. Cada uno debe tener prueba reproducible (manual o Vitest).

### 12.1 Inventario y disponibilidad (HAB)

| ID | Criterio |
|----|----------|
| HAB-01 | CRUD unidades con capacidad y `sortOrder`; seed 1–36 sin 4/20 + deptos |
| HAB-02 | Atributos asignables en admin; visibles en ficha de unidad |
| HAB-03 | Categorías comerciales reasignables; lógica de tarifas no hardcodea Riviera |
| HAB-04 | Compuestas 8+9 y 35+36 en seed + UI |
| HAB-05 | Imposible solapar dos reservas bloqueantes en la misma unidad física (test) |
| HAB-06 | Reservar compuesta bloquea ambos componentes (test) |
| HAB-07 | Componente ocupado bloquea la compuesta (test) |
| HAB-08 **(nuevo)** | Selector de asignación en alta solo muestra unidades libres en el rango pedido |

### 12.2 Reservas y calendario (RES)

| ID | Criterio |
|----|----------|
| RES-01 | Calendario filas=unidades, columnas=días; nav 7/14 |
| RES-02 | Estados operativos de reserva con color + etiqueta (sin usar `CONSULTA` como alta) |
| RES-03 | Alta/edición/cancelación desde calendario/UI |
| RES-04 | Multi-segmento mid-stay; una reserva N tramos contiguos |
| RES-05 | Grupos con varias unidades |
| RES-06 | Habitación fijada vs flexible visible/persistida; warn/bloqueo al reasignar fijadas |
| RES-07a | Canal de origen en ficha |
| RES-07b **(refinado)** | Requisitos = tags mandatory/preference que filtran/ordenan; notas libres secundarias |
| RES-08 | Estado operativo ≠ pago en UI y modelo |
| RES-09 **(nuevo)** | Tooltips `?` en tramos, mandatory/preference, fijada/flexible, seña≠confirmación |
| RES-10 **(nuevo)** | No se puede confirmar asignación a unidad que no cumple mandatory (salvo override con motivo/advertencia) |
| RES-11 **(nuevo)** | Alta/consulta: disponibilidad + habitaciones libres + servicios con tarifa en vivo; copy hotelero (§1.5) |
| RES-12 **(nuevo)** | Consultas = entidad `Query`; sección dedicada; sin habitación; fuera del calendario; convertir con room + override |
| RES-13 **(nuevo)** | Optimizador manual: preview de movimientos → confirmación; no mueve fijadas ni in-house |

### 12.3 Tarifas (TAR)

| ID | Criterio |
|----|----------|
| TAR-01..04 | Como v0.1: planes, servicios, freeze al confirmar, override auditado |

### 12.4 Huéspedes (HUE)

| ID | Criterio |
|----|----------|
| HUE-01..04 | Como v0.1 |
| HUE-05 | Campos legales mínimos actuales; ampliar cuando Julián cierre lista |

### 12.5 Pagos (PAG)

| ID | Criterio |
|----|----------|
| PAG-01..05 | Como v0.1 |
| PAG-06 **(explícito)** | Crear pago tipo `SENIA` deja `status` operativo intacto |

### 12.6 Sistema y migración (SYS / MIG)

| ID | Criterio |
|----|----------|
| SYS-01..07 | Como v0.1 |
| MIG-01..05 | Como v0.1 |

### 12.7 Criterio “MVP listo”

Recepción opera sin Excel como fuente de verdad; ítems anteriores con prueba reproducible; sin regresiones de disponibilidad; feedback de asignación por disponibilidad + tags mandatory/preference implementado en UX de alta de reserva.

---

## 13. Open questions / pending decisions

Heredadas del plan de discovery y aún abiertas (no bloquean documentar; sí pueden bloquear “cerrado de formulario” o políticas finas):

1. **Lista exacta de transiciones** de estado y si admin puede reabrir `FINALIZADA` / `CANCELADA`.
2. **Campos legales obligatorios** de pasajeros (AFIP / policía / libro de huéspedes) — validar con Julián.
3. **Descuentos niños** y stacking de promociones: ¿solo override manual en MVP o reglas?
4. **Política de cancelación y devolución de señas** (plazos, % , excepciones).
5. **Hosting definitivo** y quién opera backups en producción.
6. **Entrega / calidad del Excel** histórico para afinar MIG (ambiguos ya esbozados en handoff).
7. **¿Bloquear o solo advertir** si huéspedes > capacidad?
8. **Override de mandatory tags:** ¿solo admin o también recepción con motivo?
9. **¿Filas de compuestas en calendario** además de las físicas, o solo opción en selector?
10. **Modelo persistente de requisitos estructurados:** tabla `ReservationRequirement` vs JSON en reserva; migrar desde `requirements`/`preferences` string del schema actual.
11. **Color en `UnitAttribute`:** ¿traer del legacy o no es necesario?
12. **Unificación UI** de `SENIA_PARCIAL` vs `PARCIAL`.

---

## Anexo A — Mapa a requirements-v0.1

| Área v0.1 | Secciones de este doc |
|-----------|------------------------|
| HAB-01..07 | §2, §5, §12.1 |
| RES-01..08 | §3–§6, §12.2 (+ RES-09/10) |
| TAR-01..04 | §7, §12.3 |
| HUE-01..05 | §8, §12.4 |
| PAG-01..05 | §3.3, §9, §12.5 |
| SYS / MIG | §10–§11, §12.6 |

## Anexo B — Feedback Julián 2026-10-27 (trazabilidad)

| Pedido | Dónde queda normado |
|--------|---------------------|
| Asignar habitación concreta solo si está disponible en esas fechas | §5.1, HAB-08 |
| Requisitos no como free-text primario; usar tags/atributos; mandatory vs preference | §5.2–5.3, RES-07b, RES-10 |
| Revisar legacy riviera-app tags/filtros; no copiar ciego | §5.4 |
| Hover `?` en campos no obvios (esp. tramos) | §4.4, §5.5, §6.1, RES-09 |
| Copy hotelero (sin jargon de dominio en UI) | §1.5, RES-11 |
| Disponibilidad en vivo + servicios por fechas | §5.6, RES-11 |
| Consultas sin habitación + sección dedicada (no status en calendario) | §2.5b, §3.1, §4.3, RES-12 |
| Sugerir tags + permitir no-match con advertencia | §5.1.6, RES-10 |
| Prerreserva/reserva siempre con habitación | §5.1, §2.6 |
| Flexible vs fijada + optimizador manual con preview | §6.3–6.4, RES-06, RES-13 |

## Anexo C — Glosario breve

| Término | Significado |
|---------|-------------|
| Consulta | Entidad `Query`: borrador sin habitación; fuera del calendario |
| Tramo / segmento | `AssignmentSegment`: pedazo de estadía en una unidad |
| Compuesta | Venta conjunta de dos físicas (8+9, 35+36) — UI: habitaciones comunicadas |
| Mandatory tag | Atributo que filtra candidatos |
| Preference tag | Atributo que solo prioriza |
| Habitación fijada | `doNotMove`: no la mueve el optimizador |
| Asignación flexible | Puede reasignarse entre habitaciones compatibles |
| Checkout exclusivo | La fecha de salida no ocupa noche |
| Precio acordado | Total ARS negociado; se congela al confirmar |
| Seña | Pago inicial; no confirma sola |

---

*Fin de la especificación funcional detallada v1.2.*
