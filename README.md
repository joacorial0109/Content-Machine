# Content Machine

Aplicación local que convierte una idea, noticia o texto en un reel vertical. El flujo puede crear el guion, investigar fuentes, generar un avatar con voz, buscar b-roll, agregar música y subtítulos, y renderizar un MP4 en formato 1080 × 1920.

## Modos disponibles

- **Demo local:** `DEMO_MODE=true`. No consume APIs. Genera un MP4 con voz sintética de Windows, subtítulos y una plantilla visual.
- **Real local:** `DEMO_MODE=false` y `AVATAR_MODE=local`. Usa OpenAI para investigar y escribir, Pexels para el b-roll y voz local con respaldo en OpenAI TTS. No requiere HeyGen.
- **HeyGen:** `DEMO_MODE=false` y `AVATAR_MODE=heygen`. Agrega el avatar y la voz configurados en HeyGen al flujo real.

La generación del plan se controla por separado con `GENERATION_MODE`:

- `ai`: usa OpenAI para investigar y escribir; requiere `OPENAI_API_KEY`.
- `manual`: recibe un plan JSON pegado por el usuario; no requiere OpenAI.
- `template`: crea seis escenas con plantillas locales a partir de la idea; no requiere OpenAI.

Los modos `manual` y `template` requieren `AVATAR_MODE=local`.

## Requisitos

- Node.js 20 o superior.
- npm.
- FFmpeg y FFprobe disponibles desde la terminal.
- Windows para la voz sintética del modo demo. El flujo Pro puede ejecutarse en otros sistemas si FFmpeg está instalado.

En Windows también se puede usar `INICIAR.ps1`, que comprueba FFmpeg, crea `.env` cuando no existe, inicia el servidor y abre la aplicación.

## 1. Instalar dependencias

Cloná el repositorio y entrá en la carpeta:

```powershell
git clone https://github.com/joacorial0109/Content-Machine.git
cd Content-Machine
npm install
```

Instalá FFmpeg si todavía no está disponible:

```powershell
winget install --id Gyan.FFmpeg --exact
```

Comprobá la instalación:

```powershell
node --version
ffmpeg -version
ffprobe -version
```

## 2. Configurar `.env`

Copiá el archivo de ejemplo:

```powershell
Copy-Item .env.example .env
```

Variables requeridas para el modo real local:

```dotenv
OPENAI_API_KEY=
PEXELS_API_KEY=
```

El modo HeyGen requiere además:

```dotenv
HEYGEN_API_KEY=
HEYGEN_AVATAR_ID=
HEYGEN_VOICE_ID=
```

Configuración completa disponible:

```dotenv
PORT=3000
DEMO_MODE=true
AVATAR_MODE=local
GENERATION_MODE=ai
TARGET_DURATION_SECONDS=35
MIN_DURATION_SECONDS=25
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
HEYGEN_API_KEY=
HEYGEN_AVATAR_ID=
HEYGEN_VOICE_ID=
PEXELS_API_KEY=
MUSIC_FILE=
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

`AVATAR_MODE` solo acepta `local` o `heygen`. Para probar OpenAI + Pexels sin HeyGen, usá `DEMO_MODE=false` y `AVATAR_MODE=local`. `TARGET_DURATION_SECONDS` define el objetivo del guion y render; `MIN_DURATION_SECONDS` impide aceptar videos demasiado cortos. `MUSIC_FILE` puede contener la ruta absoluta de una pista propia o licenciada.

Para generar gratis sin OpenAI:

```dotenv
DEMO_MODE=false
AVATAR_MODE=local
GENERATION_MODE=template
OPENAI_API_KEY=
PEXELS_API_KEY=tu_clave_de_pexels
```

También podés usar `GENERATION_MODE=manual` y pegar el plan desde la interfaz.

No subas `.env`, `settings.json`, claves, voces, videos generados ni archivos de usuario. Ya están excluidos por `.gitignore`.

## 3. Ejecutar el servidor local

```powershell
npm start
```

Abrí [http://localhost:3000](http://localhost:3000). El servidor escucha solamente en `127.0.0.1`.

Durante el desarrollo se puede usar:

```powershell
npm run dev
```

## 4. Generar un video demo

1. Dejá `DEMO_MODE=true`.
2. Ejecutá `npm start`.
3. Abrí `http://localhost:3000`.
4. Escribí una idea, elegí plataforma, tono y duración.
5. Presioná **Generar reel**.
6. Reproducí el resultado o descargá `reel.mp4` desde la interfaz.

El modo demo usa una voz sintética instalada en Windows. Los archivos quedan en `runs/<id>/` y no se versionan.

## 5. Probar el flujo real con APIs externas

### OpenAI + Pexels sin HeyGen

1. Conseguí claves válidas de OpenAI y Pexels.
2. Configurá `DEMO_MODE=false` y `AVATAR_MODE=local`.
3. Completá `OPENAI_API_KEY` y `PEXELS_API_KEY`.
4. Reiniciá el servidor y generá primero un video corto.

Este modo usa voz sintética de Windows cuando está disponible. Si falla, intenta OpenAI TTS. Si ambas opciones fallan, genera una pista silenciosa para que el render no quede bloqueado; esta degradación debe revisarse antes de publicar.

### Plan manual sin OpenAI

Configurá `GENERATION_MODE=manual`, `AVATAR_MODE=local` y una clave de Pexels. La interfaz mostrará un editor grande que acepta JSON con esta forma:

```json
{
  "title": "Título",
  "hook": "Hook",
  "narration": "Narración completa de al menos 25 segundos",
  "caption": "Caption #hashtags",
  "scenes": [
    {
      "line": "Texto narrado de la escena",
      "brollQuery": "morning routine",
      "overlayText": "Idea clave"
    }
  ]
}
```

El plan debe contener entre 5 y 8 escenas y narración suficiente para `MIN_DURATION_SECONDS`.

### Template local sin OpenAI

Configurá `GENERATION_MODE=template` y escribí una idea en el disparador. El servidor crea seis escenas locales, queries genéricas para Pexels, overlays, subtítulos y caption. No llama a OpenAI.

El plan real contiene entre 5 y 8 escenas, búsquedas alternativas de b-roll, overlays cortos, subtítulos semánticos y duración estimada. El montaje corta cada 3 a 5 segundos, aplica movimiento suave a los clips y repite material cuando hace falta para alcanzar la duración objetivo.

El modo real local exige al menos tres clips descargados de Pexels. Si no los consigue después de probar queries alternativas, el job falla con `No se encontraron clips de Pexels suficientes`; nunca vuelve a la placa del demo. Después del render, FFprobe confirma que `finalDurationSeconds` sea mayor o igual a `MIN_DURATION_SECONDS`. Un video más corto se marca como fallido.

Cada ejecución guarda `report.json` con `finalDurationSeconds`, `targetDurationSeconds`, `minDurationSeconds`, `brollDownloadedCount`, `brollUsedCount`, `visualMode`, `usedFallback`, `warnings`, `errors` y `durationMinimumPass`.

### Flujo completo con HeyGen

1. Creá un avatar y una voz propios o autorizados en HeyGen.
2. Copiá sus valores `Avatar ID` y `Voice ID`.
3. Configurá `DEMO_MODE=false` y `AVATAR_MODE=heygen`.
4. Completá OpenAI, Pexels y las tres variables de HeyGen.
5. Reiniciá el servidor y generá primero un video corto para controlar costos.

También podés cargar la configuración desde el botón **Configuración** de la interfaz. Se guarda localmente en `settings.json`, que está ignorado por Git.

El flujo real realiza estas etapas:

1. OpenAI investiga el tema y devuelve hook, narración, escenas, caption y fuentes.
2. Pexels busca clips verticales relacionados con cada escena.
3. En `local`, el sistema genera voz simple y usa el b-roll como imagen principal.
4. En `heygen`, HeyGen genera el presentador con el avatar y la voz configurados.
5. FFmpeg monta el video, mezcla música, agrega subtítulos y produce el MP4 final.

## Comandos

```powershell
npm start       # servidor
npm run dev     # servidor con recarga al modificar archivos
npm test        # pruebas automatizadas
```

## Estructura

```text
public/          interfaz web
src/             servidor, clientes de APIs y renderizado
test/            pruebas automatizadas
.env.example     variables de configuración sin secretos
INICIAR.ps1      iniciador para Windows
```

## Seguridad y publicación

- Usá únicamente avatares y voces propios o con autorización explícita.
- Verificá hechos y fuentes antes de publicar.
- Confirmá los derechos de música y material visual.
- Las APIs externas tienen costos y límites propios.
- Revisá manualmente cada video antes de subirlo a una red social.
