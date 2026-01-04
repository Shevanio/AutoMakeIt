# WebSocket Sync Issues - Debugging Guide

## 🐛 Problema Reportado

**Síntoma:** Cuando un feature termina, el estado no se actualiza en el frontend hasta refrescar el navegador. El botón se queda en "Resume" aunque el feature ya terminó.

## 🔍 Diagnóstico

### 1. Verificar Logs del Servidor

Después de que termine el feature, busca estas líneas en la consola del servidor:

```bash
# QA Validation
[QAService] Starting QA validation for feature feat-xxxx
[QAService] Running QA check: ESLint
[QAService] Running QA check: TypeScript Type Check
[QAService] Running QA check: Build
[QAService] Running QA check: Tests
[QAService] QA validation completed for feat-xxxx: PASSED

# Status Update
[AutoMode] QA validation passed for feat-xxxx, auto-verifying
[AutoMode] Emitting feature_complete event: featureId=feat-xxxx, status=verified, projectPath=/path/to/project

# Event Emission
[AutoMode] Feature feat-xxxx execution ended, cleaning up runningFeatures
```

**Si NO ves el log de "Emitting feature_complete event":**

- El feature no terminó correctamente
- Revisa si hay errores antes

**Si ves el log pero el frontend no actualiza:**

- Problema de WebSocket
- El frontend no está escuchando el evento correcto
- El projectPath no coincide

### 2. Verificar WebSocket Connection

Abre DevTools del navegador → Console:

```javascript
// Verificar que WebSocket está conectado
// Debería mostrar: WebSocket { url: "ws://localhost:3008", readyState: 1, ... }
// readyState: 1 = OPEN (conectado)
```

**Estados de WebSocket:**

- 0 = CONNECTING
- 1 = OPEN ✅
- 2 = CLOSING
- 3 = CLOSED ❌

### 3. Verificar Eventos en DevTools

En DevTools → Console, pega esto para interceptar eventos WebSocket:

```javascript
// Interceptar todos los eventos
const originalEmit = window.addEventListener;
window.addEventListener = function (type, listener, options) {
  if (type.includes('auto-mode') || type.includes('feature')) {
    console.log('[Event Interceptor]', type, listener);
  }
  return originalEmit.call(this, type, listener, options);
};
```

Luego ejecuta un feature y observa qué eventos llegan.

### 4. Verificar que el Feature se Guardó Correctamente

```bash
# Ver el status final del feature
cat .automakeit/features/feat-*/feature.json | jq '{id, status, error, updatedAt}'
```

**Debería mostrar:**

```json
{
  "id": "feat-xxxx",
  "status": "verified", // O "waiting_approval"
  "error": null, // O mensaje de error si QA falló
  "updatedAt": "2026-01-04T..." // Timestamp reciente
}
```

Si el archivo está correcto pero el frontend no actualiza → problema de eventos.

## 🔧 Soluciones

### Solución 1: Reiniciar Servidor y Frontend

```bash
# Mata todos los procesos
pkill -f "node.*server"
pkill -f "vite"

# Reinicia desde cero
npm run dev
```

### Solución 2: Forzar Reconexión WebSocket

En DevTools → Console:

```javascript
// Esto debería forzar reconexión
location.reload();
```

### Solución 3: Verificar CORS y Proxy

El frontend en `localhost:3007` debe poder conectarse al WebSocket en `localhost:3008`.

**Verificar en `apps/ui/vite.config.mts`:**

```typescript
server: {
  port: 3007,
  proxy: {
    '/api': {
      target: 'http://localhost:3008',
      changeOrigin: true,
      ws: true, // ← Importante para WebSocket
    },
  },
}
```

### Solución 4: Debug WebSocket en Frontend

Busca el archivo que maneja WebSocket (probablemente `http-api-client.ts`):

```typescript
// Añadir logs de debug
socket.onmessage = (event) => {
  console.log('[WebSocket] Message received:', event.data);
  const data = JSON.parse(event.data);
  console.log('[WebSocket] Parsed event:', data.type, data);
  // ... resto del código
};
```

### Solución 5: Verificar Filtros de Eventos

El frontend puede estar filtrando eventos por `projectPath`. Verifica que el `projectPath` del evento coincide con el del frontend.

**En el código que escucha eventos, busca:**

```typescript
if (event.projectPath !== currentProjectPath) {
  return; // ← Esto podría estar filtrando el evento
}
```

## 📊 Datos Útiles para Reportar Bug

Si el problema persiste, recopila:

1. **Logs del servidor** (últimas 100 líneas después de terminar feature)
2. **Console del navegador** (filtrar por "WebSocket" o "auto-mode")
3. **Estado del feature** (`cat .automakeit/features/feat-*/feature.json`)
4. **Estado WebSocket** (DevTools → Network → WS tab)
5. **Versión del navegador y OS**

## 🎯 Workaround Temporal

Mientras se soluciona, puedes:

1. **Refrescar manualmente** después de que termine (F5)
2. **Usar polling** - El frontend refresca features cada X segundos automáticamente (si está implementado)
3. **Observar los archivos** - Usa `watch` para ver cambios:
   ```bash
   watch -n 1 'cat .automakeit/features/feat-*/feature.json | jq .status'
   ```

## ✅ Verificación Post-Fix

Después de aplicar una solución:

1. Crear feature de prueba simple
2. Ejecutarlo completamente
3. **NO refrescar el navegador**
4. Verificar que el card cambia de "Resume" al estado final automáticamente
5. Verificar que aparece en la columna correcta (verified / waiting_approval)

Si todo funciona → ✅ Problema resuelto
Si sigue igual → Recopilar datos y reportar

---

## 🔄 Próximos Pasos

Una vez identifies el problema exacto, puedo ayudarte a:

1. Arreglar el código de eventos
2. Mejorar el manejo de WebSocket
3. Añadir retry automático
4. Implementar fallback polling

**¿Qué logs ves en tu servidor cuando el feature termina?** Cópiame las últimas ~50 líneas.
