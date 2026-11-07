# Mensajes de Ánimo — Guía de Despliegue y Operación

**Fecha:** 2026-11-07  
**Status:** Fases 0-5 completadas, Fase 6 en progreso

---

## Resumen de Implementación

El sistema de mensajes de ánimo muestra mensajes cálidos del animalito compañero de la persona cuando entra a la webapp. Características:

- **160 mensajes** en catálogo, distribuidos en 18 contextos
- **Frecuencia configurable**: cada sesión, diaria, semanal, desactivado
- **Selección determinística** basada en seed (animalId + fecha)
- **Privacidad first**: todo se guarda en localStorage, nada en servidor
- **Accesibilidad**: aria-live, 44px touch targets, sin emojis en CSS
- **Métricas**: tracking de impresiones, dismissals, duración de vista

---

## Arquitectura

### Capas

```
┌─────────────────────────────────────┐
│   UI: AnimoBubble, AnimoSetting     │  ← React components
├─────────────────────────────────────┤
│   Hook: useAnimoMessage             │  ← Session/history management
├─────────────────────────────────────┤
│   Domain: pickAnimoMessage          │  ← Pure selection logic
├─────────────────────────────────────┤
│   Config: animo.ts, animo-catalog   │  ← Zod validation
└─────────────────────────────────────┘
```

### Archivos Clave

- **Catálogo**: `data/animo-catalog.json` (160 mensajes, 18 contextos)
- **Validación**: `src/config/animo.ts` (Zod schema + forbidden words linter)
- **Lógica pura**: `src/domain/animo/pick-animo-message.ts`
- **Hook**: `src/ui/animo/use-animo-message.ts`
- **Componente**: `src/ui/animo/animo-bubble.tsx`
- **Settings**: `src/ui/settings/animo-settings.tsx`
- **Métricas**: `src/domain/animo/animo-metrics.ts`
- **Integración**: `src/ui/result/result-view.tsx` (línea 131-143, 206-215)

---

## Despliegue

### Pre-requisitos

1. **Node.js 24.x** (ver `package.json` engines)
2. **Supabase** configurado (variables de entorno)
3. **Vercel** o servidor con soporte para Next.js 16

### Pasos

1. **Verificar catálogo**:
   ```bash
   npm run data:validate  # Valida animo-catalog.json
   npm test src/config/animo.test.ts  # 8 tests de validación
   npm test src/domain/animo/pick-animo-message.test.ts  # 18 tests de lógica
   ```

2. **Verificar integración**:
   ```bash
   npm run typecheck  # 0 errores
   npm run lint  # 0 errores (warnings preexistentes OK)
   npm test  # 1186+ tests pasando
   ```

3. **Deploy a preview** (Vercel):
   ```bash
   git push origin feature/animo-messages
   # Vercel crea preview URL automáticamente
   ```

4. **QA en preview**:
   - Abrir preview URL
   - Entrar con matrícula de prueba (426144890)
   - Verificar que aparece el bubble en /resultado
   - Probar settings: cambiar frecuencia, probar preview
   - Verificar que no aparece en otras rutas
   - Probar dismiss: cerrar bubble, recargar, no debe aparecer en misma sesión

5. **Merge a main**:
   ```bash
   gh pr create --title "feat(animo): mensajes de ánimo" --body "..."
   gh pr merge --squash
   ```

6. **Deploy a producción**:
   ```bash
   # Vercel deploy automático desde main
   # Monitorear: https://vercel.com/zooenes/deployments
   ```

---

## Configuración

### Frecuencia por Defecto

- **Valor**: `"cada_sesion"` (una vez por sesión del navegador)
- **Opciones**: `"cada_sesion"` | `"diaria"` | `"semanal"` | `"off"`
- **Storage key**: `zm-animo-frequency`
- **Cambio**: Settings → "Mensajes de ánimo" → seleccionar opción

### Historial de Mensajes

- **Tamaño máximo**: 50 mensajes
- **Storage key**: `zm-animo:history:v1`
- **Propósito**: Evitar repetición de mensajes recientes
- **Limpieza**: Automática (FIFO cuando llega a 50)

### Sesión

- **Storage key**: `zm-animo:session:v1`
- **Data**: `{ lastShownAt, lastShownDate, lastShownWeek, shownThisSession }`
- **Expiración**: sessionStorage (se limpia al cerrar pestaña)

---

## Métricas y Monitoreo

### Métricas Locales

- **Storage key**: `zm-animo:metrics:v1`
- **Data**: Array de `{ messageId, context, categoria, shownAt, dismissedAt, viewDurationMs }`
- **Tamaño máximo**: 1000 entradas (FIFO)
- **Acceso**: `getAnimoMetrics()` en `src/domain/animo/animo-metrics.ts`

### Métricas Admin (Fase 6 pendiente)

Para habilitar métricas en admin dashboard:

1. Crear endpoint `/api/admin/animo-metrics` que lea métricas agregadas
2. Agregar sección "Ánimo" en `src/ui/admin/admin-dashboard.tsx`
3. Mostrar:
   - Total mensajes mostrados (últimos 7 días)
   - Tasa de dismiss (dismissals / impresions)
   - Duración promedio de vista
   - Distribución por contexto
   - Distribución por categoría

**Nota**: Las métricas locales NO se envían al servidor automáticamente. Requiere consentimiento explícito del usuario (Fase 6).

---

## Troubleshooting

### El mensaje no aparece

1. **Verificar frecuencia**:
   ```javascript
   localStorage.getItem("zm-animo-frequency")
   // Debe ser "cada_sesion", "diaria", "semanal", o null (default: "cada_sesion")
   ```

2. **Verificar sesión**:
   ```javascript
   JSON.parse(sessionStorage.getItem("zm-animo:session:v1"))
   // shownThisSession debe ser false para que aparezca (con frecuencia "cada_sesion")
   ```

3. **Verificar sonido**:
   - El mensaje requiere `soundPrefs.sound === true`
   - Verificar en Settings → "Soniditos" → activado

4. **Verificar catálogo**:
   ```bash
   npm run data:validate
   # Debe pasar sin errores
   ```

### El mensaje aparece dos veces en la misma sesión

1. **Limpiar sesión**:
   ```javascript
   sessionStorage.removeItem("zm-animo:session:v1")
   ```

2. **Verificar hook**: El hook debe actualizar `shownThisSession: true` después de mostrar el mensaje (línea 152-161 en `use-animo-message.ts`)

### Los mensajes se repiten mucho

1. **Verificar historial**:
   ```javascript
   JSON.parse(localStorage.getItem("zm-animo:history:v1"))
   // Debe tener hasta 50 IDs de mensajes mostrados
   ```

2. **Verificar lógica de selección**: `pickAnimoMessage()` debe filtrar mensajes en historial antes de seleccionar (línea 85-95 en `pick-animo-message.ts`)

---

## Testing

### Tests Unitarios

```bash
# Validación de catálogo
npm test src/config/animo.test.ts

# Lógica de selección
npm test src/domain/animo/pick-animo-message.test.ts

# Métricas
npm test src/domain/animo/animo-metrics.test.ts
```

### Tests de Integración

```bash
# Con BASE apuntando a deploy local o preview
BASE=http://localhost:3124 npm test src/app/chat-integration.test.ts
```

### QA Manual

1. Entrar a `/resultado` con cuenta de prueba
2. Verificar que aparece el bubble
3. Cambiar frecuencia en settings a "diaria"
4. Cerrar pestaña, volver a abrir
5. Verificar que NO aparece (ya se mostró hoy)
6. Cambiar frecuencia a "cada_sesion"
7. Limpiar sessionStorage
8. Recargar
9. Verificar que SÍ aparece

---

## Futuras Mejoras (Post-Fase 6)

1. **Métricas server-side**: Enviar métricas agregadas al servidor (con consentimiento)
2. **A/B testing**: Probar diferentes frecuencias por defecto
3. **Personalización avanzada**: Usar status de ánimo para seleccionar mensajes
4. **Animaciones**: Agregar micro-animaciones al bubble (CSS only)
5. **Multimedia**: Agregar sonidos personalizados por contexto
6. **Internacionalización**: Soporte para otros idiomas (en-US, pt-BR)

---

## Contacto

- **Desarrollo**: Equipo ZooMatch
- **Diseño**: Equipo de diseño UX
- **Producto**: Product manager ZooMatch

---

**Última actualización**: 2026-11-07
