# Acceso desde Red Interna

## Configuración Automática (Recomendado)

El servidor ya está configurado para aceptar conexiones desde cualquier IP de red privada:

- `192.168.x.x` (redes domésticas típicas)
- `10.x.x.x` (redes empresariales)
- `172.16-31.x.x` (redes privadas alternativas)

## Cómo Acceder

### 1. Obtén tu IP local

En el servidor donde corre AutoMakeIt:

```bash
hostname -I | awk '{print $1}'
# Ejemplo de salida: 192.168.1.100
```

O revisa el log cuando inicies el servidor - mostrará la IP de red automáticamente.

### 2. Inicia AutoMakeIt en modo web

```bash
cd /home/shevanio/dev/automaker
npm run dev:web
```

El servidor mostrará algo como:

```
╔═══════════════════════════════════════════════════════╗
║           AutoMakeIt Backend Server                    ║
╠═══════════════════════════════════════════════════════╣
║  Local:       http://localhost:3008                   ║
║  Network:     http://192.168.1.100:3008               ║
║  WebSocket:   ws://192.168.1.100:3008/api/events      ║
╚═══════════════════════════════════════════════════════╝
```

### 3. Accede desde otro equipo

Desde cualquier dispositivo en la misma red:

**Frontend**: `http://192.168.1.100:3007`

_(Reemplaza `192.168.1.100` con tu IP real)_

---

## Configuración Manual de CORS (Opcional)

Si necesitas configuración específica de CORS:

```bash
# Opción 1: Variable de entorno
export CORS_ORIGIN="http://192.168.1.100:3007"

# Opción 2: Archivo .env
echo "CORS_ORIGIN=http://192.168.1.100:3007" >> .env

# Múltiples IPs (separadas por espacios)
export CORS_ORIGIN="http://192.168.1.100:3007 http://192.168.1.101:3007"
```

Luego inicia el servidor:

```bash
npm run dev:web
```

---

## Seguridad

### ⚠️ IMPORTANTE

- **Solo para redes privadas confiables**: No expongas AutoMakeIt a Internet público
- **Firewall**: El servidor solo acepta conexiones de IPs privadas por defecto
- **Sandbox**: Considera usar Docker para mayor aislamiento

### IPs permitidas por defecto:

- `localhost` / `127.0.0.1` / `::1`
- `192.168.0.0 - 192.168.255.255` (Clase C privada)
- `10.0.0.0 - 10.255.255.255` (Clase A privada)
- `172.16.0.0 - 172.31.255.255` (Clase B privada)

Cualquier otra IP será rechazada automáticamente.

---

## Solución de Problemas

### El navegador no se conecta

1. **Verifica que ambos puertos estén abiertos:**

   ```bash
   # En el servidor
   sudo netstat -tulpn | grep -E '3007|3008'
   ```

2. **Verifica el firewall:**

   ```bash
   # Ubuntu/Debian
   sudo ufw status
   sudo ufw allow 3007/tcp
   sudo ufw allow 3008/tcp

   # CentOS/RHEL
   sudo firewall-cmd --add-port=3007/tcp --permanent
   sudo firewall-cmd --add-port=3008/tcp --permanent
   sudo firewall-cmd --reload
   ```

3. **Prueba la conexión desde el cliente:**
   ```bash
   curl http://192.168.1.100:3008/api/health
   # Debería devolver: {"status":"ok"}
   ```

### CORS errors en el navegador

Verifica que la variable `CORS_ORIGIN` incluya la IP del cliente:

```bash
export CORS_ORIGIN="http://$(hostname -I | awk '{print $1}'):3007"
npm run dev:web
```

---

## Modo Electron

**Nota:** Electron solo funciona en modo local. Para acceso remoto, usa el modo web.

```bash
# Solo local
npm run dev:electron

# Modo web para acceso remoto
npm run dev:web
```
