# FluxorHUBAnalisispercepciones

Este proyecto utiliza Supabase como base de datos. Para que la aplicación funcione correctamente es necesario indicar las claves de conexión mediante variables de entorno.

## Variables de entorno requeridas

- `SUPABASE_URL`
- `SUPABASE_KEY`

Puedes crear un archivo `.env` en la raíz del proyecto con el siguiente contenido:

```bash
SUPABASE_URL="https://tu-proyecto.supabase.co"
SUPABASE_KEY="tu-clave-supersecreta"
```

Algunos entornos de desarrollo cargan estas variables automáticamente. Si no es tu caso, establece las variables antes de iniciar tu servidor o proceso de build:

```bash
export SUPABASE_URL="https://tu-proyecto.supabase.co"
export SUPABASE_KEY="tu-clave-supersecreta"
```

La aplicación intentará utilizar estas variables. Si no existen, se usarán las credenciales por defecto definidas en `js/config.js` y se mostrará una advertencia en la consola.
