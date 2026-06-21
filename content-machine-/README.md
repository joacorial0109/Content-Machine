# Content Machine

Convierte una idea, noticia o tweet en un reel vertical: guion, avatar con voz, b-roll, música, subtítulos y MP4 final.

## Prueba inmediata

Requiere Node.js 20 o superior.

```powershell
Copy-Item .env.example .env
npm start
```

Abrí `http://localhost:3000`. El proyecto arranca en modo demo: permite probar el flujo y la interfaz sin consumir APIs.

## Producción real

1. Instalá FFmpeg y comprobá que `ffmpeg` y `ffprobe` funcionen desde la terminal.
2. Creá un avatar y una voz autorizados en HeyGen y copiá sus identificadores.
3. Conseguí claves de OpenAI, HeyGen y Pexels.
4. Completá `.env` y cambiá `DEMO_MODE=false`.
5. Opcional: indicá en `MUSIC_FILE` la ruta absoluta a una pista propia o con licencia.
6. Ejecutá `npm start`.

Los resultados se guardan en `runs/<id>/`: plan JSON, avatar, clips, subtítulos y `reel.mp4`.

## Flujo

1. OpenAI estructura el disparador en hook, narración y escenas visuales.
2. HeyGen produce el presentador usando el avatar y la voz configurados.
3. Pexels obtiene clips verticales para las escenas.
4. FFmpeg intercala el material, mezcla música y quema los subtítulos.

Usá únicamente una voz y un avatar propios o con permiso explícito. Revisá hechos, derechos de música y material visual antes de publicar. El costo depende de las cuentas y planes contratados; el proyecto no puede garantizar los “USD 5” mencionados en el video.
