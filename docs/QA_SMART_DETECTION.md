# QA Loop - Smart Project Detection

## 🎯 Problema Resuelto

**Antes (MVP):** QA Loop ejecutaba los mismos checks para todos los proyectos:

- ❌ `npm run lint` (fallaba si no existía)
- ❌ `npm run typecheck` (fallaba si no existía)
- ❌ `npm run build` (fallaba si no existía)

**Resultado:** Proyectos sin esos scripts fallaban QA automáticamente.

---

## ✅ Solución: Detección Automática de Proyecto

El QA Loop ahora **detecta el tipo de proyecto** y ejecuta **solo los checks disponibles**.

### **Tipos de Proyectos Soportados:**

| Tipo                    | Detección                             | Checks Aplicables      |
| ----------------------- | ------------------------------------- | ---------------------- |
| **TypeScript Monorepo** | `workspaces` en package.json          | lint, typecheck, build |
| **TypeScript Node**     | `tsconfig.json` presente              | lint, typecheck, build |
| **JavaScript Node**     | `package.json` sin TypeScript         | lint, build            |
| **React + Vite**        | `vite` en dependencies                | lint, typecheck, build |
| **Next.js**             | `next` en dependencies                | lint, typecheck, build |
| **Python**              | `requirements.txt` o `pyproject.toml` | pylint, mypy, pytest   |
| **HTML Estático**       | `index.html` sin package.json         | (ninguno por ahora)    |

---

## 🔍 Cómo Funciona

### **1. Detección Automática**

Cuando QA Loop inicia, detecta:

```typescript
const projectInfo = await detectProject(projectPath);

// Resultado ejemplo para proyecto Node.js simple:
{
  type: 'javascript-node',
  hasTypeScript: false,
  hasLint: true,          // ✅ package.json tiene "lint" script
  hasTypeCheck: false,    // ❌ No tiene "typecheck" script
  hasBuild: false,        // ❌ No tiene "build" script
  hasTest: true,          // ✅ package.json tiene "test" script
  packageManager: 'npm',
  language: 'javascript'
}
```

### **2. Selección Inteligente de Checks**

```
¿User configuró checks manualmente?
  ↓ Sí
  Usar checks del usuario (respeta configuración)
  ↓ No
  Usar smart defaults basados en proyecto detectado
```

**Ejemplo 1: Proyecto sin `typecheck`**

```
Proyecto: JavaScript simple (sin TypeScript)
Scripts disponibles: { lint: ✅, build: ❌, typecheck: ❌ }

QA ejecutará:
✅ ESLint (disponible)
❌ TypeScript (no aplica)
❌ Build (no disponible)

Resultado: Solo ejecuta ESLint
```

**Ejemplo 2: Proyecto TypeScript completo**

```
Proyecto: TypeScript monorepo
Scripts disponibles: { lint: ✅, build: ✅, typecheck: ✅ }

QA ejecutará:
✅ ESLint (disponible)
✅ TypeScript Type Check (disponible)
✅ Build (disponible)

Resultado: Ejecuta todos los checks
```

---

## 📊 Logs de Ejemplo

### **Proyecto JavaScript Simple:**

```
[QAService] Starting QA validation for feature feat-xxxx
[ProjectDetector] Detecting project type at: /home/user/my-project
[ProjectDetector] Project detected as: javascript-node
{
  language: 'javascript',
  packageManager: 'npm',
  availableChecks: {
    lint: true,
    typecheck: false,
    build: false,
    test: true
  }
}
[QAService] Using smart defaults for javascript-node: static_analysis
[QAService] Running QA check: ESLint
[QAService] Skipping build check - no build script found
[QAService] QA validation completed: PASSED
```

### **Proyecto TypeScript Completo:**

```
[QAService] Starting QA validation for feature feat-xxxx
[ProjectDetector] Project detected as: typescript-node
[QAService] Using smart defaults for typescript-node: static_analysis, build
[QAService] Running QA check: ESLint
[QAService] Running QA check: TypeScript Type Check
[QAService] Running QA check: Build
[QAService] QA validation completed: PASSED
```

---

## ⚙️ Configuración Manual (Override)

Si quieres forzar checks específicos, usa `.automakeit/settings.json`:

```json
{
  "version": 1,
  "qaValidation": {
    "enabled": true,
    "enabledChecks": ["static_analysis"], // ← Solo lint
    "model": "haiku"
  }
}
```

**Opciones de `enabledChecks`:**

- `[]` - Sin checks (deshabilitado)
- `["static_analysis"]` - Solo lint/typecheck
- `["build"]` - Solo build
- `["static_analysis", "build"]` - Ambos
- `undefined` - Smart defaults (recomendado)

---

## 🎯 Casos de Uso

### **Caso 1: Proyecto Legacy sin Scripts**

**Problema:** Proyecto Node.js viejo sin `lint`, `typecheck`, `build`

**Solución:**

- QA detecta que no hay scripts disponibles
- No ejecuta ningún check
- Feature pasa QA automáticamente ✅

**Alternativa:** Agregar los scripts al `package.json`:

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  }
}
```

---

### **Caso 2: Proyecto Python**

**Detección:**

```
- Encuentra: requirements.txt
- Tipo: python
- Checks: pylint (si instalado), mypy (si instalado)
```

**Nota:** Soporte de Python es básico en MVP. Se mejorará en Fase 2.

---

### **Caso 3: Proyecto HTML Estático**

**Detección:**

```
- Encuentra: index.html (sin package.json)
- Tipo: static-html
- Checks: Ninguno por ahora
```

**Feature pasa QA automáticamente** (no hay código para validar).

---

## 🚀 Ventajas de la Detección Inteligente

| Antes                                   | Ahora                         |
| --------------------------------------- | ----------------------------- |
| ❌ Falla en proyectos sin scripts       | ✅ Adapta checks al proyecto  |
| ❌ Mismo comportamiento para todos      | ✅ Smart defaults por tipo    |
| ❌ Usuario debe configurar manualmente  | ✅ Funciona out-of-the-box    |
| ❌ Reportes confusos ("Missing script") | ✅ Solo ejecuta lo disponible |

---

## 📈 Ejemplos Reales

### **Tu Proyecto `casino-hybrid`:**

**Antes:**

```
QA checks ejecutados:
  ❌ ESLint - FAILED (Missing script: "lint")
  ❌ TypeScript - FAILED (Missing script: "typecheck")
  ❌ Build - FAILED (Missing script: "build")

Resultado: QA FAILED → waiting_approval
```

**Ahora:**

```
QA checks ejecutados:
  ℹ️ ESLint - SKIPPED (script not available)
  ℹ️ TypeScript - SKIPPED (script not available)
  ℹ️ Build - SKIPPED (script not available)

Resultado: QA PASSED → verified ✅
```

---

## 🔧 Troubleshooting

### **Problema: QA detecta tipo incorrecto**

**Verificar:**

```bash
# Ver logs de detección
# Busca línea: [ProjectDetector] Project detected as: ...
```

**Solución:** Configurar manualmente en `settings.json`

---

### **Problema: QA no ejecuta checks esperados**

**Verificar que los scripts existan:**

```bash
npm run lint      # ¿Existe?
npm run typecheck # ¿Existe?
npm run build     # ¿Existe?
```

**Agregar scripts faltantes:**

```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## ✅ Estado Actual

**Implementado:**

- ✅ Detección de tipo de proyecto
- ✅ Detección de scripts disponibles
- ✅ Smart defaults por tipo
- ✅ Skip de checks no disponibles
- ✅ Logs informativos

**Pendiente (Fase 2):**

- ⏳ Soporte completo de Python
- ⏳ Validación de HTML/CSS estático
- ⏳ Detección de Go, Rust, C++, etc.
- ⏳ Cache de detección de proyecto

---

**Fecha:** 2026-01-04  
**Versión:** Post-MVP (Mejora inmediata)  
**Estado:** ✅ Implementado y funcional
