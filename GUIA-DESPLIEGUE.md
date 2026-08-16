# Guía de Despliegue — FarmaControl Web

Esta guía asume que **no** tienes experiencia previa con Supabase ni con Netlify/Vercel. Sigue los pasos en orden.

---

## PARTE 1 — Configurar Supabase (tu base de datos)

### 1.1 Crear el proyecto
1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Clic en **"New Project"**.
3. Ponle un nombre (ej: `farmacontrol`), crea una contraseña de base de datos (guárdala en un lugar seguro) y elige la región más cercana (ej: `South America (São Paulo)`).
4. Espera 1-2 minutos a que el proyecto termine de crearse.

### 1.2 Ejecutar el esquema de la base de datos
1. En el menú izquierdo, ve a **SQL Editor** → **New query**.
2. Abre el archivo `supabase-schema.sql` (incluido en este proyecto), copia **todo** su contenido y pégalo en el editor.
3. Clic en **Run**. Deberías ver "Success. No rows returned".
   - Esto crea las tablas `perfiles`, `productos`, `lotes`, `movimientos`, `facturas`, los permisos de tabla (`GRANT`), las reglas de seguridad por fila (RLS), el trigger que crea automáticamente el perfil de cada usuario nuevo, y siembra los 4 productos de demostración.
   - Esta versión del script ya incluye las correcciones de los permisos de tabla (`GRANT`) y de la creación automática del perfil vía trigger — si sigues esta guía desde cero para un cliente nuevo, **no deberías encontrarte ningún error de "cuenta pendiente" ni de 403**, ni tener que hacer ningún ajuste manual después.

### 1.3 Conectar el sitio a tu proyecto
1. Ve a **Project Settings** (ícono de engranaje) → **API**.
2. Copia el valor de **Project URL**.
3. Copia el valor de **anon public** (clave pública, es segura de usar en el navegador).
4. Abre el archivo `js/supabaseClient.js` de este proyecto y reemplaza:
   ```js
   const SUPABASE_URL = "PEGA_AQUI_TU_PROJECT_URL";
   const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_ANON_KEY";
   ```
   con tus valores reales.

### 1.4 Configurar los correos de autenticación (registro / recuperación)
1. Ve a **Authentication** → **URL Configuration**.
2. En **Site URL**, pon la URL donde vas a publicar el sitio (la obtendrás en la Parte 2; por ahora puedes dejar `http://localhost:8080` y volver a editar esto después del despliegue).
3. En **Redirect URLs**, agrega esa misma URL (y también `http://localhost:8080/*` si vas a probar en tu computadora).
4. (Opcional pero recomendado) Ve a **Authentication** → **Providers** → **Email** y revisa que "Confirm email" esté activado si quieres que los usuarios confirmen su correo antes de entrar.

### 1.5 El primer registro es automáticamente el administrador
No tienes que tocar el SQL Editor para esto. En cuanto ejecutaste el `supabase-schema.sql` (Parte 1.2), quedó activa la regla: **la primera persona que se registre en el sitio se convierte automáticamente en administrador**. Todo el que se registre después de esa primera cuenta entra como "sin permisos", esperando aprobación — normal.

Entonces, para arrancar:
1. Abre tu sitio ya publicado.
2. Regístrate tú (o el dueño del negocio) como el primer usuario, con sus datos reales.
3. Esa cuenta entra directo al panel de administrador — sin pantalla de espera, sin SQL, nada manual.
4. Desde la pestaña **"Usuarios y Permisos"**, ese administrador ya puede asignarle rol a todos los que se registren después.

> ⚠️ Importante: esto solo aplica a la **primera** cuenta que se registre en cada proyecto de Supabase nuevo. Si por error alguien más se registra antes que el dueño, esa persona quedará como administrador en su lugar — en ese caso sí tendrías que corregirlo manualmente por SQL (`update perfiles set rol = 'administrador' where id = (select id from auth.users where email = '...')`, y bajarle el rol al que se coló por error). Por eso, en cada proyecto nuevo, asegúrate de que el dueño sea literalmente la primera persona en registrarse.

---

## PARTE 1.6 — Si vas a vender o alquilar este sistema a otras farmacias

Cada farmacia/cliente necesita su **propio proyecto de Supabase** (su propia base de datos, separada de las demás — así los datos de un cliente nunca se mezclan con los de otro) y, si le vas a dar su propio dominio o subdominio, su **propio despliegue en Netlify/Vercel**. El proceso para cada cliente nuevo es repetir exactamente la Parte 1 y la Parte 2 de esta guía desde cero:

1. Crea un proyecto de Supabase nuevo para ese cliente (Parte 1.1).
2. Corre el mismo `supabase-schema.sql` sin modificar nada (Parte 1.2) — ya incluye todas las correcciones, así que no deberías necesitar ajustes manuales.
3. Copia la URL y la anon key de **ese** proyecto (no la tuya) en su copia de `js/supabaseClient.js` (Parte 1.3).
4. Publica esa copia del sitio en su propio Netlify/Vercel (Parte 2).
5. Regístrate tú mismo como el primer administrador de esa instancia (Parte 1.5) y desde ahí le entregas el acceso a tu cliente para que asigne los demás roles.

Este proyecto no está diseñado (todavía) para que varias farmacias compartan una sola base de datos con un solo despliegue — cada una vive aislada en su propio proyecto de Supabase. Si más adelante quieres ofrecerlo como un solo sistema multi-cliente (una sola URL para todos, cada quien viendo solo lo suyo), es un cambio de arquitectura más grande y con gusto te ayudo a planearlo cuando llegues a ese punto.

### Si un cliente deja de pagar el alquiler
Entra al proyecto de Supabase de ese cliente → **Project Settings → General → "Pause project"**. Esto bloquea al instante todo acceso a su sistema (nadie puede iniciar sesión ni usar el POS/inventario) sin borrar ninguno de sus datos. Si vuelve a pagar, entras y le das **"Restore project"** y todo vuelve a funcionar en un par de minutos, tal como estaba.

---

## PARTE 2 — Publicar el sitio (Netlify o Vercel)

### ¿Cuál elegir?
Este proyecto es un sitio **100% estático** (HTML/CSS/JS que habla directo con Supabase, sin servidor propio). Tanto Netlify como Vercel lo publican gratis en minutos y ambos funcionan igual de bien aquí. Recomendación: **Netlify**, porque:
- Registrum (tu otro sistema) ya está en Netlify, así que todo queda bajo la misma plataforma.
- Su despliegue "arrastrar y soltar" es el más simple si aún no usas Git/GitHub.

Si en el futuro quieres integrar funciones serverless más avanzadas, Vercel también es excelente — pero para este caso no hay diferencia práctica.

### Opción A — Netlify, arrastrar y soltar (sin Git, la más fácil)
1. Entra a [app.netlify.com](https://app.netlify.com) y crea una cuenta gratuita.
2. En el panel, busca la zona que dice **"Drag and drop your site output folder here"**.
3. Arrastra la carpeta completa `farmacontrol-web` (la que contiene `index.html`, `admin.html`, etc.) a esa zona.
4. En segundos tu sitio estará publicado con una URL tipo `https://algo-al-azar.netlify.app`.
5. (Recomendado) Ve a **Site configuration → Change site name** para ponerle un nombre memorable, ej: `farmacontrol`, y quedará en `https://farmacontrol.netlify.app`.
6. **Importante:** vuelve a Supabase (paso 1.4) y actualiza el **Site URL** y **Redirect URLs** con esta URL real de Netlify. Si no lo haces, los enlaces de confirmación de correo y recuperación de contraseña no funcionarán.

> Nota: con "arrastrar y soltar", cada vez que quieras actualizar el sitio (por ejemplo, si te ayudo a agregar una función nueva) tendrás que volver a arrastrar la carpeta completa. Si prefieres que se actualice solo, usa la Opción B.

### Opción B — Netlify conectado a GitHub (se actualiza solo)
1. Sube la carpeta `farmacontrol-web` a un repositorio en [github.com](https://github.com) (puedes arrastrar los archivos directamente desde la web de GitHub si no usas Git por consola).
2. En Netlify: **Add new site → Import an existing project → Deploy with GitHub**, autoriza y selecciona tu repositorio.
3. Como es un sitio estático sin build, deja **Build command** vacío y **Publish directory** como `/` (o `.`).
4. Clic en **Deploy site**.
5. Cada vez que subas cambios a GitHub, Netlify volverá a publicar el sitio automáticamente.

### Opción alterna — Vercel
1. Entra a [vercel.com](https://vercel.com), crea cuenta.
2. **Add New → Project**, sube la carpeta o conéctala desde GitHub igual que en la Opción B.
3. Framework Preset: **Other** (sitio estático). Deja Build command vacío.
4. Deploy.

---

## PARTE 3 — Checklist final

- [ ] Ejecuté `supabase-schema.sql` en el SQL Editor de Supabase.
- [ ] Puse mi `SUPABASE_URL` y `SUPABASE_ANON_KEY` reales en `js/supabaseClient.js`.
- [ ] Publiqué el sitio en Netlify (o Vercel) y tengo mi URL final.
- [ ] Actualicé **Site URL** y **Redirect URLs** en Supabase con esa URL final.
- [ ] Me registré y me asigné `rol = 'administrador'` por SQL una sola vez.
- [ ] Desde el panel de "Usuarios y Permisos" ya puedo asignar Cajero/Administrador a todos los demás.

---

## Notas importantes sobre este traslado

- **Roles:** todo usuario nuevo entra con `rol = 'sin_permisos'` y ve una pantalla de espera. Solo un administrador puede subirlo a `cajero` (solo Punto de Venta) o `administrador` (Inventario + POS + Usuarios), desde la pestaña "Usuarios y Permisos" — nunca desde el código.
- **Facturas en PDF:** como ya no hay un servidor Python generando el PDF, ahora se genera directamente en el navegador (librería `jsPDF`) con el mismo formato y datos que la versión de escritorio.
- **Seguridad de datos:** las reglas de RLS (Row Level Security) en Supabase garantizan que, aunque cualquiera puede ver el código del sitio, solo usuarios con sesión y rol correcto pueden leer o modificar productos, ventas y usuarios — la clave "anon" del frontend NO da acceso directo a la base de datos sin pasar por esas reglas.
- **Datos de la versión de escritorio:** este traslado no importa automáticamente tu inventario actual de `farmacontrol.db`; arranca con los mismos 4 productos de demostración. Si quieres migrar tu inventario real, dime y preparamos un script de importación.
