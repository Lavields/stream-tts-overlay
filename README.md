# StreamVoice · TTS multistream con avatares para OBS

Lee en voz alta el chat de **Twitch, YouTube, Kick y TikTok al mismo tiempo**, con una cola compartida, voces configurables por usuario y un avatar animado que mueve la boca sincronizado con el audio dentro de OBS.

Lo construí para streamers que transmiten en varias plataformas a la vez y quieren que su audiencia "hable" en el directo sin depender de servicios de pago. Se usó en directos reales y tiene versión de escritorio para macOS y Windows.

> 📸 _Agrega aquí una captura o GIF del estudio y del overlay en OBS (por ejemplo `docs/demo.gif`)._

## Qué hace

- **Multistream real:** varias conexiones simultáneas alimentan una sola cola (hasta 100 mensajes), conservando la plataforma de origen.
- **Varios motores de voz:** Edge TTS (gratis, sin clave), Fish Audio y ElevenLabs con clave propia, voces del sistema y clonación local opcional con Qwen3, sin API.
- **Cambio de voz dentro del mensaje:** `{verity} Hola {chilena} ¿qué tal?` alterna voces en la misma lectura, y `{20}` inserta un efecto de sonido.
- **Overlay para OBS:** avatar transparente que aparece al hablar, abre la boca según el volumen del audio, parpadea al terminar y muestra subtítulos. El estado viaja por **Server-Sent Events**, así funciona entre el navegador del estudio y el de OBS.
- **Moderación:** filtros de comandos, enlaces y longitud (55 palabras), silenciar usuarios, saltar, pausar y vaciar la cola, además de eliminar mensajes moderados en Twitch.
- **Texto pensado para el habla:** expande abreviaciones del chat y describe emojis (más de 3.900 nombres de Unicode CLDR).
- **Cuentas y permisos:** login con hashes **scrypt**, canales y avatares permitidos por cuenta validados en el servidor y token de overlay aislado por usuario.
- **App de escritorio (Electron):** credenciales cifradas con `safeStorage` del sistema, actualizaciones automáticas e instaladores para macOS y Windows.

## Stack

| Área | Tecnologías |
|---|---|
| Backend | Node.js 22 (módulos ES, sin framework), `ws`, Server-Sent Events |
| Plataformas | Twitch IRC por WebSocket, YouTube Data API v3, Kick (público y webhooks firmados RSA-SHA256), TikTok (`tiktok-live-connector`) |
| Voz | Edge TTS, Fish Audio API, ElevenLabs API, Qwen3 local (Python) |
| Frontend | JavaScript vanilla, Web Audio API, IndexedDB, CSS |
| Escritorio | Electron, `safeStorage`, `autoUpdater` / Squirrel |
| Nube (prototipo) | Cloudflare Workers + D1 (cuentas y sesiones, PBKDF2) |
| Calidad | `node:test` (35 archivos, 135 pruebas), scripts de auditoría de UI y rendimiento |

## Arquitectura

```
Twitch / YouTube / Kick / TikTok
              │  (WebSocket, polling, webhooks)
              ▼
     server.mjs  ── cola compartida, filtros, permisos por cuenta
       │    │
       │    └── motores de voz: Edge · Fish · ElevenLabs · local (Qwen3)
       ▼
  Estudio (navegador)  ──SSE──▶  Overlay OBS (/overlay)
  reproduce el audio            avatar + boca + subtítulos
```

## Cómo ejecutarlo

Requiere **Node.js 22+**.

```sh
npm install
npm run setup:admin   # crea la cuenta "admin" (te pide una contraseña)
npm start             # abre http://localhost:4317
```

1. Entra como `admin` y pulsa **Probar una lectura** para habilitar el audio del navegador.
2. En **Conectar canal**, agrega uno o varios canales.
3. En OBS, agrega una **Fuente de navegador** de 600 × 600 con la URL de overlay que muestra tu sesión.

Las claves opcionales (Fish Audio, ElevenLabs, YouTube, Twitch OAuth) se ingresan en **Ajustes** o en un `.env` (ver `.env.example`). El servidor nunca devuelve las claves al navegador.

### Pruebas

```sh
npm test
```

### App de escritorio

```sh
npm run desktop:start    # modo desarrollo
npm run desktop:build    # empaquetar
```

## Seguridad

- El servidor escucha solo en `127.0.0.1`, bloquea orígenes ajenos y no sirve `.env`, cuentas ni código fuente.
- Las contraseñas se guardan con scrypt y sal aleatoria. Las sesiones y los tokens de OBS son independientes por cuenta.
- El webhook de Kick verifica firma, antigüedad y duplicados de cada evento.

## Sobre las voces

Este repositorio **no incluye** muestras de voz, clips de audio ni avatares de personas reales o personajes con derechos de autor. La clonación local (`assets/voice-references/`) está pensada para tu propia voz o voces con permiso explícito de su dueño. Las voces del catálogo de Fish Audio se usan a través de su API con la clave de cada usuario.

## Autor

**Luis Paria** · [LinkedIn](https://www.linkedin.com/in/parialuis/) · [Portafolio](https://lavields.github.io/CV/)
