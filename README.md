# Content Machine

Aplicación local que convierte una idea, noticia o texto en un reel vertical. El flujo puede crear el guion, investigar fuentes, generar un avatar con voz, buscar b-roll, agregar música y subtítulos, y renderizar un MP4 en formato 1080 × 1920.

## Modos disponibles

- **Demo local:** no consume APIs. Genera un MP4 con voz sintética de Windows, subtítulos y una plantilla visual.
- **Pro:** usa OpenAI para investigar y escribir, HeyGen para el avatar y la voz, Pexels para el b-roll y FFmpeg para el montaje final.

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

Variables requeridas para el flujo Pro:

```dotenv
OPENAI_API_KEY=
HEYGEN_API_KEY=
HEYGEN_AVATAR_ID=
HEYGEN_VOICE_ID=
PEXELS_API_KEY=
```

Configuración completa disponible:

```dotenv
PORT=3000
DEMO_MODE=true
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

Para activar el flujo real, completá las cinco credenciales requeridas y cambiá `DEMO_MODE=false`. `MUSIC_FILE` puede contener la ruta absoluta de una pista propia o licenciada.

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

1. Creá un avatar y una voz propios o autorizados en HeyGen.
2. Copiá sus valores `Avatar ID` y `Voice ID`.
3. Conseguí claves válidas de OpenAI, HeyGen y Pexels.
4. Completá `.env` y establecé `DEMO_MODE=false`.
5. Reiniciá el servidor.
6. Generá primero un video corto para controlar costos y validar las cuentas.

También podés cargar la configuración desde el botón **Configuración** de la interfaz. Se guarda localmente en `settings.json`, que está ignorado por Git.

El flujo real realiza estas etapas:

1. OpenAI investiga el tema y devuelve hook, narración, escenas, caption y fuentes.
2. HeyGen genera el presentador con el avatar y la voz configurados.
3. Pexels busca clips verticales relacionados con cada escena.
4. FFmpeg monta el avatar y el b-roll, mezcla música, agrega subtítulos y produce el MP4 final.

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
