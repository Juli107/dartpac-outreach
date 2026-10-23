# Dartpac Outreach

Plataforma propia de prospección del equipo comercial de Dartpac: el **Radar comercial** encuentra empresas en todo el país y las **secuencias** las contactan por email, WhatsApp y llamadas. Diseño azul marino con vidrio, en el escritorio y en el celular.

## Qué hace

- **Radar comercial** (`/radar`): mapa 3D de la Argentina con regiones, provincias, partidos/departamentos y localidades; las empresas con su ficha, etapa, puntaje y seguimiento. **Buscar clientes** pide a Claude (API de Anthropic, con búsqueda web) que recorra una zona —una localidad, un partido, una provincia, una región o los partidos que elijas— y cargue empresas reales verificadas, sin repetir las que ya están ni a los clientes de Dartpac. También completa datos que faltan y trae alertas de oportunidades.
- **Búsqueda de los lunes**: un workflow de GitHub dispara `/api/radar/semanal`, que elige los partidos con más habitantes y menos prospectos y los recorre solo.
- **Secuencias**: las arma el equipo, sin plantillas de fábrica. Cada paso es un **email** (sale solo desde el buzón de la secuencia), un **WhatsApp** (queda en Tareas con el mensaje listo y el botón para abrirlo) o una **llamada/tarea**, con los días de espera. Variables `{{saludo}}`, `{{empresa}}`, `{{nombre}}`, `{{ciudad}}`, `{{provincia}}`, `{{vendedor}}`, `{{mi_empresa}}`, `{{web}}`, `{{cargo}}`… y botón **Redactar con IA**. Las empresas del Radar se suman desde el Radar («Sumar a una secuencia»); cada mail, WhatsApp, respuesta, rebote o baja vuelve a su ficha.
- **Verificar correos** (`/verificador`): formato, errores de tipeo (`gmial.com` → `gmail.com`), dominios de prueba o temporales, casillas genéricas y consulta al DNS (si el dominio no existe o no recibe correo). Se usa al importar, al cargar contactos, al sumar empresas del Radar y para revisar listas pegadas. No manda ningún correo para comprobar.
- **Buzones** (`/buzones`): salida y entrada de cada Gmail y la **salud del correo**: SPF, DKIM y DMARC del dominio, programador, rebotes y errores de los últimos 30 días, bajas y calidad de la base.
- **Campanita**: avisos de respuestas, WhatsApp para mandar, búsquedas terminadas, alertas nuevas y problemas de envío.
- **Contactos**, **Bandeja** (lee los buzones por IMAP; quien responde sale de sus secuencias), **Tareas**, **Analíticas**, **Remitentes** (Gmail de cada comercial, con Google o contraseña de aplicación cifrada) y **baja** firmada en cada email con `List-Unsubscribe`.

## Variables de entorno

Todas las de `.env.example`. Para el Radar:

| Variable | Para qué |
| --- | --- |
| `ANTHROPIC_API_KEY` | **Obligatoria para buscar clientes.** Sin ella el mapa, las fichas y las secuencias funcionan, pero no las búsquedas. |
| `RADAR_DAILY_USD` | Tope de gasto diario de las búsquedas en dólares (por defecto 25). |
| `RADAR_MODEL` / `RADAR_MODEL_QUICK` | Modelos (por defecto `claude-sonnet-5-5` y `claude-haiku-5-5`). |
| `RADAR_SEMANAL_DEPS` | Cuántos partidos recorre la búsqueda de los lunes (por defecto 12). |
| `RADAR_MAX_SEARCHES` / `RADAR_MAX_FETCHES` | Búsquedas y lecturas web por partido (por defecto 8 y 8). |

`CRON_SECRET` protege `/api/cron` y la cadena de búsquedas; los workflows de GitHub entran con su token OIDC, sin secretos.

## Puesta en marcha local

```bash
cp .env.example .env      # rellena DATABASE_URL, APP_PASSWORD, SESSION_SECRET y ENCRYPTION_KEY
npm install
npm run db:push           # crea las tablas
npm run db:seed           # da de alta los remitentes
npm run dev               # http://localhost:3000
```

Para probar envíos sin buzón real, apuntá `SMTP_HOST`/`SMTP_PORT` a un servidor SMTP de pruebas (por ejemplo Mailpit) y llamá al cron a mano:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

## Despliegue en Vercel

1. Base Postgres (Neon) en `DATABASE_URL` y el resto de las variables en el proyecto de Vercel.
2. `vercel-build` actualiza las tablas (`prisma db push`) y da de alta los remitentes en cada despliegue. Los cambios de esquema tienen que ser aditivos: las previews usan la misma base.
3. **Envíos**: `.github/workflows/envios.yml` llama a `/api/cron` cada 10 minutos en horario comercial (y `vercel.json` una vez al día como respaldo).
4. **Búsqueda de los lunes**: `.github/workflows/radar-semanal.yml`, a las 8:47 de Buenos Aires.
5. **Base del Radar**: la primera vez que se abre `/radar` con la base vacía, se puede subir el archivo `radar-dartpac.json` exportado del Radar de Claude. Ese archivo tiene datos comerciales: no se sube al repositorio.

El Radar corre como página propia (`public/radar-app/`) dentro de `/radar`, y guarda todo en la tabla `RadarDoc` a través de `/api/radar/*`.

## Pruebas

```bash
npm test         # plantillas, horario, CSV, limpieza de respuestas, WhatsApp y verificador
npm run typecheck
```

## Stack

Next.js 15 (App Router, server actions) · TypeScript · Tailwind · Prisma + Postgres · Nodemailer · ImapFlow · API de Claude (búsqueda web) · Three.js (mapa del Radar).
