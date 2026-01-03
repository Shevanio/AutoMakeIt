# Documentación de AutoMakeIt

Índice centralizado de la documentación técnica y arquitectónica de AutoMakeIt.

---

## 🏗️ Arquitectura y Patrones

### Arquitectura de Agentes

- **[Arquitectura de Contexto de Agentes](AGENT_CONTEXT_ARCHITECTURE.md)**  
  Cómo los agentes acceden a documentación del proyecto mediante symlinks automáticos.

- **[Patrón de Archivos de Contexto](context-files-pattern.md)**  
  Sistema de archivos de contexto en `.automakeit/context/` para guías específicas del proyecto.

### Organización del Código

- **[Patrón de Carpetas](folder-pattern.md)**  
  Convenciones de nomenclatura (kebab-case) y estructura de carpetas para vistas.

- **[Paquetes Compartidos LLM](llm-shared-packages.md)**  
  Guía completa de paquetes compartidos (`@automakeit/*`) y cómo usarlos correctamente.

### Funcionalidades Principales

- **[Pipeline Feature](pipeline-feature.md)**  
  Pasos de pipeline personalizados que se ejecutan automáticamente tras la implementación.

---

## 🔧 Backend (Server)

### Arquitectura del Servidor

- **[Arquitectura de Proveedores](server/providers.md)**  
  Sistema modular de proveedores AI (Claude SDK, OpenAI Codex CLI) con interfaz unificada.

- **[Organización de Rutas](server/route-organization.md)**  
  Patrón para organizar rutas Express de forma modular y mantenible.

- **[Utilidades del Servidor](server/utilities.md)**  
  Referencia completa de utilidades en `apps/server/src/lib/`.

---

## 📘 Guías de Desarrollo

### Estándares de Código

- **[Código Limpio](clean-code.md)**  
  Principios fundamentales: DRY, reusabilidad, abstracciones, extensibilidad.

### Infraestructura y Setup

- **[Aislamiento Docker](docker-isolation.md)**  
  Guía para ejecutar AutoMakeIt en contenedores Docker aislados.

- **[Terminal Integrada](terminal.md)**  
  Configuración y uso del terminal integrado con xterm.js.

---

## 🔒 Seguridad

- **[Guías de Seguridad](SECURITY.md)**  
  Medidas de seguridad implementadas: CORS, rate limiting, sanitización de inputs, validación de paths.

---

## 📚 Recursos Adicionales

### Archivos de Contexto Principal

- **[CLAUDE.md](../CLAUDE.md)** - Guía principal para Claude Code AI
- **[README.md](../README.md)** - Visión general del proyecto
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Guía de contribución

### Documentación por Aplicación

- **UI**: Ver `apps/ui/docs/` para arquitectura del frontend
- **Server**: Ver `apps/server/` para documentación específica del backend

---

## 🗂️ Estructura de Documentación

```
docs/
├── INDEX.md                          # Este archivo
├── AGENT_CONTEXT_ARCHITECTURE.md     # Arquitectura de contexto
├── clean-code.md                     # Estándares de código
├── context-files-pattern.md          # Sistema de contexto
├── docker-isolation.md               # Guía Docker
├── folder-pattern.md                 # Convenciones de carpetas
├── llm-shared-packages.md            # Guía de paquetes
├── pipeline-feature.md               # Documentación de pipeline
├── SECURITY.md                       # Guías de seguridad
├── terminal.md                       # Terminal integrada
└── server/
    ├── providers.md                  # Arquitectura de proveedores
    ├── route-organization.md         # Organización de rutas
    └── utilities.md                  # Utilidades del servidor
```

---

## 🎯 Navegación Rápida

| Necesitas...                        | Ve a...                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| Entender cómo funcionan los agentes | [AGENT_CONTEXT_ARCHITECTURE.md](AGENT_CONTEXT_ARCHITECTURE.md) |
| Crear un nuevo provider AI          | [server/providers.md](server/providers.md)                     |
| Organizar rutas del servidor        | [server/route-organization.md](server/route-organization.md)   |
| Añadir un paquete compartido        | [llm-shared-packages.md](llm-shared-packages.md)               |
| Implementar features de seguridad   | [SECURITY.md](SECURITY.md)                                     |
| Configurar pipeline de CI/CD        | [pipeline-feature.md](pipeline-feature.md)                     |
| Escribir código limpio              | [clean-code.md](clean-code.md)                                 |

---

**Última actualización**: 2026-01-03  
**Mantenido por**: Equipo AutoMakeIt
