# Guía de Prueba: Auto-Validación QA Loop

Esta guía te ayudará a probar el nuevo sistema de Auto-Validación QA implementado en AutoMakeIt.

---

## 📋 Preparación

### 1. Compilar el proyecto

```bash
npm run build:packages
npm run build:server
```

### 2. Iniciar AutoMakeIt

```bash
npm run dev:web
# O si prefieres Electron:
# npm run dev:electron
```

---

## 🧪 Escenarios de Prueba

### **Escenario 1: Feature con QA Exitoso (Happy Path)** ✅

**Objetivo:** Verificar que un feature simple pasa QA automáticamente y va a `verified`.

**Pasos:**

1. **Crear un feature simple:**
   - Título: `Add Hello World function`
   - Descripción:

     ```
     Create a simple utility function that returns "Hello World".

     Requirements:
     - Create file: libs/utils/src/hello-world.ts
     - Export a function called getHelloWorld()
     - Function should return the string "Hello World"
     - Add proper TypeScript types
     - Export from libs/utils/src/index.ts
     ```

2. **Configurar el feature:**
   - ✅ **IMPORTANTE:** Desmarca `Skip Tests` (debe estar en `false`)
   - Modelo: Sonnet o Haiku (para rapidez)
   - Planning Mode: Skip (no necesitamos planning para esto)

3. **Ejecutar:**
   - Arrastra el feature a "In Progress"
   - Espera a que el agente termine la implementación

4. **Resultado esperado:**
   - El feature debería pasar automáticamente a `verified` ✅
   - En la consola del servidor deberías ver:
     ```
     [QAService] Starting QA validation for feature feat-xxxx
     [QAService] Running QA check: ESLint
     [QAService] Running QA check: TypeScript Type Check
     [QAService] Running QA check: Build
     [QAService] Running QA check: Tests
     [QAService] QA validation completed for feat-xxxx: PASSED
     [AutoMode] QA validation passed for feat-xxxx, auto-verifying
     ```

5. **Verificar reporte QA:**
   - Abre: `.automakeit/features/{featureId}/qa-report.json`
   - Deberías ver algo como:
     ```json
     {
       "featureId": "feat-xxxx",
       "validatedAt": "2026-01-04T...",
       "result": {
         "passed": true,
         "confidence": "high",
         "recommendation": "approve",
         "summary": "All 4 QA checks passed successfully...",
         "stats": {
           "total": 4,
           "passed": 4,
           "failed": 0,
           "critical": 0,
           "warnings": 0
         }
       }
     }
     ```

---

### **Escenario 2: Feature con Errores de TypeScript (Fallo QA)** ❌

**Objetivo:** Verificar que el QA Loop detecta errores y mueve a `waiting_approval` con reporte.

**Pasos:**

1. **Crear un feature que intencionalmente tendrá errores:**
   - Título: `Add User Authentication (with intentional TS errors)`
   - Descripción:

     ```
     Create a user authentication module with a deliberate type error for testing.

     Requirements:
     - Create file: apps/server/src/lib/test-auth.ts
     - Create an interface User with properties: id (number), name (string)
     - Create a function authenticateUser(userId: string) that returns User
     - IMPORTANT: Inside the function, assign a string to user.id (this will cause a type error)
     - Example: const user: User = { id: "123", name: "Test" }; // Wrong type!
     ```

2. **Configurar:**
   - ✅ **CRÍTICO:** `Skip Tests` debe estar **desmarcado** (`false`)
   - Modelo: Sonnet

3. **Ejecutar:**
   - Mueve a "In Progress"

4. **Resultado esperado:**
   - El feature **NO** debería ir a `verified`
   - Debería ir a `waiting_approval` ⚠️
   - El card debería mostrar un mensaje de error con sugerencias QA
   - En la consola:
     ```
     [QAService] Running QA check: TypeScript Type Check
     [QAService] QA validation completed for feat-xxxx: FAILED
     [AutoMode] QA validation failed for feat-xxxx: QA validation: 1 of 4 checks failed...
     ```

5. **Verificar reporte QA:**
   - `.automakeit/features/{featureId}/qa-report.json`
   - Debería mostrar:
     ```json
     {
       "result": {
         "passed": false,
         "confidence": "low",
         "recommendation": "reject",
         "checks": [
           {
             "id": "typecheck",
             "name": "TypeScript Type Check",
             "passed": false,
             "severity": "critical",
             "message": "TypeScript Type Check failed: ...",
             "output": "error TS2322: Type 'string' is not assignable to type 'number'"
           }
         ],
         "suggestions": ["Review TypeScript errors and add proper type annotations"]
       }
     }
     ```

6. **Verificar mensaje en UI:**
   - El feature card debería mostrar el error
   - Abre el feature detail y verifica que aparece el mensaje QA con sugerencias

---

### **Escenario 3: Feature con Skip Tests (QA Deshabilitado)** ⏭️

**Objetivo:** Verificar que con `Skip Tests = true` el QA Loop se omite.

**Pasos:**

1. **Crear feature:**
   - Título: `Add simple logger utility`
   - Descripción:

     ```
     Create a basic console logger wrapper.

     - Create libs/utils/src/simple-logger.ts
     - Export function log(message: string): void
     - Just call console.log internally
     ```

2. **Configurar:**
   - ✅ **Marca** `Skip Tests` como `true`

3. **Ejecutar:**
   - Mueve a "In Progress"

4. **Resultado esperado:**
   - El feature va **directo** a `waiting_approval` (sin QA)
   - En la consola **NO** deberías ver logs de `[QAService]`
   - **NO** se crea archivo `qa-report.json`

---

### **Escenario 4: API Manual - Obtener Reporte QA** 🔍

**Objetivo:** Verificar que la API REST funciona correctamente.

**Pasos:**

1. **Ejecuta primero el Escenario 1 o 2** para tener un reporte QA guardado

2. **Obtener el feature ID:**
   - Abre `.automakeit/features/` y copia el ID de un feature con QA

3. **Llamar a la API:**

   ```bash
   # Reemplaza {featureId} y {projectPath}
   curl "http://localhost:3008/api/qa/report/{featureId}?projectPath=/ruta/a/tu/proyecto"
   ```

4. **Resultado esperado:**
   - Respuesta JSON con el reporte QA completo
   - Status 200 si existe, 404 si no

---

### **Escenario 5: API Manual - Ejecutar QA Bajo Demanda** 🚀

**Objetivo:** Probar la validación manual de un feature existente.

**Pasos:**

1. **Crear/tener un feature en cualquier estado**

2. **Llamar a la API:**

   ```bash
   curl -X POST http://localhost:3008/api/qa/validate \
     -H "Content-Type: application/json" \
     -d '{
       "projectPath": "/ruta/a/tu/proyecto",
       "featureId": "feat-xxxx"
     }'
   ```

3. **Resultado esperado:**
   - Respuesta JSON con resultado de validación
   - Se crea/actualiza el archivo `qa-report.json`

---

## 🔍 Puntos de Verificación

### **Logs del Servidor**

Busca estas líneas en la consola del servidor:

```bash
# QA iniciado
[QAService] Starting QA validation for feature feat-xxxx

# Checks individuales
[QAService] Running QA check: ESLint
[QAService] Running QA check: TypeScript Type Check
[QAService] Running QA check: Build
[QAService] Running QA check: Tests

# Resultado
[QAService] QA validation completed for feat-xxxx: PASSED
# O:
[QAService] QA validation completed for feat-xxxx: FAILED

# Decisión de AutoMode
[AutoMode] QA validation passed for feat-xxxx, auto-verifying
# O:
[AutoMode] QA validation failed for feat-xxxx: QA validation: X of Y checks failed...
```

### **Archivos a Verificar**

1. **Reporte QA:**

   ```
   .automakeit/features/{featureId}/qa-report.json
   ```

2. **Feature JSON (debería tener error si QA falló):**

   ```
   .automakeit/features/{featureId}/feature.json
   ```

   - Campo `error` debería contener mensaje QA + sugerencias

3. **Status del Feature:**
   - `verified` si QA pasó (y skipTests=false)
   - `waiting_approval` si QA falló o skipTests=true

---

## 🐛 Troubleshooting

### **Problema: QA no se ejecuta nunca**

**Solución:**

- Verifica que `Skip Tests` esté **desmarcado** (false)
- Revisa logs del servidor para errores de compilación
- Asegúrate de que el proyecto tiene `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` configurados

### **Problema: QA falla inmediatamente**

**Solución:**

- Verifica que el proyecto compila correctamente: `npm run build`
- Revisa que los scripts existen en `package.json`
- Chequea el reporte QA para ver qué check específico falló

### **Problema: No se crea qa-report.json**

**Solución:**

- Verifica permisos de escritura en `.automakeit/features/`
- Revisa logs del servidor para errores de I/O
- Asegúrate de que el feature se ejecutó completamente (no fue abortado)

---

## 📊 Métricas a Recopilar

Durante tus pruebas, anota:

1. **Tiempo de QA:** ¿Cuánto tarda en ejecutarse? (en `totalDurationMs`)
2. **Precisión:** ¿Los rechazos QA son correctos o hay falsos positivos?
3. **Cobertura:** ¿Detecta los errores que debería detectar?
4. **Usabilidad:** ¿El mensaje de error es claro y útil?

---

## ✅ Checklist de Prueba Completa

- [ ] Escenario 1: Feature simple pasa QA → `verified` ✅
- [ ] Escenario 2: Feature con errores TS falla QA → `waiting_approval` ❌
- [ ] Escenario 3: Skip Tests omite QA → `waiting_approval` ⏭️
- [ ] Escenario 4: API GET /qa/report funciona 🔍
- [ ] Escenario 5: API POST /qa/validate funciona 🚀
- [ ] Verificar qa-report.json se crea correctamente
- [ ] Verificar logs del servidor muestran QA execution
- [ ] Verificar mensaje de error aparece en feature card

---

## 🎯 Próximos Pasos Después de Pruebas

1. **Si todo funciona:** ¡Celebrar! 🎉
2. **Si hay bugs:** Reportar con logs y capturas
3. **Feedback de UX:** ¿Los mensajes son claros? ¿Qué mejorarías?
4. **Fase 2:** Habilitar validación semántica AI
5. **Fase 3:** Implementar auto-fix

---

**¿Preguntas? ¿Problemas?** Revisa los logs del servidor y el archivo `qa-report.json` para debugging.

¡Buena suerte con las pruebas! 🚀
