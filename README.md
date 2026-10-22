# Dartpac Outreach

Plataforma propia de prospección por email para el equipo comercial de Dartpac: secuencias automáticas con esperas, contactos, bandeja de respuestas, tareas manuales y analíticas. Marca Dartpac en azul marino.

## Qué hace

- **Contactos**: alta manual o importación CSV (columnas en español o inglés), etiquetas, búsqueda.
- **Secuencias**: eligen qué comercial envía; pasos de email o tarea manual con esperas en días. Variables `{{nombre}}`, `{{apellido}}`, `{{empresa}}`, `{{cargo}}`, `{{email}}`, con valor por defecto `{{nombre|hola}}`. Los seguimientos van en el mismo hilo.
- **Envío programado**: `/api/cron` se ejecuta cada 10 minutos (cron-job.org o Vercel Cron en el plan Pro). Solo envía de lunes a viernes dentro del horario configurado y respeta el límite diario de cada secuencia.
- **Bandeja**: lee el buzón por IMAP; cuando un contacto responde sale de sus secuencias. Las respuestas se clasifican (interesado, reunión, más adelante, no interesado).
- **Remitentes**: cada comercial (Luis, Ailén, Julián, Enzo) envía desde su Gmail con su firma. Su contraseña de aplicación se guarda cifrada (AES-256-GCM con `ENCRYPTION_KEY`) y la bandeja lee también sus buzones. Botón para probar la conexión.
- **Tareas**: los pasos manuales (llamar, LinkedIn) aparecen aquí.
- **Analíticas**: enviados, aperturas (píxel), respuestas y rebotes por semana y por secuencia.
- **Baja**: cada email lleva enlace firmado de baja y cabecera `List-Unsubscribe`.

## Puesta en marcha local

```bash
cp .env.example .env      # rellena DATABASE_URL, APP_PASSWORD, SESSION_SECRET y el buzón
npm install
npm run db:push           # crea las tablas
npm run db:seed           # opcional: datos de ejemplo (en producción: npm run db:seed -- --solo-remitentes)
npm run dev               # http://localhost:3000
```

Para probar el envío sin buzón real puedes poner en `.env` un servidor SMTP de pruebas (por ejemplo Mailpit) y llamar a mano al cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

## Despliegue en Vercel

1. Crea una base de datos Postgres (Neon o Vercel Postgres) y copia su URL en `DATABASE_URL`.
2. Importa el repositorio en Vercel y añade todas las variables de `.env.example`.
3. En Vercel el script `vercel-build` crea o actualiza las tablas (`prisma db push`) y da de alta los remitentes en cada despliegue.
4. El plan gratuito (Hobby) de Vercel solo permite un cron al día: `vercel.json` llama a `/api/cron` a las 7:00 UTC como respaldo.
   Para enviar cada 10 minutos crea una tarea gratuita en [cron-job.org](https://cron-job.org) que haga `GET https://TU-APP.vercel.app/api/cron`
   cada 10 minutos con la cabecera `Authorization: Bearer <CRON_SECRET>`. En el plan Pro basta con cambiar el horario de `vercel.json` a `*/10 * * * *`.

Con Gmail o Google Workspace usa una **contraseña de aplicación** para SMTP e IMAP.

## Pruebas

```bash
npm test         # plantillas, horario de envío, CSV y limpieza de respuestas
npm run typecheck
```

## Stack

Next.js 15 (App Router, server actions) · TypeScript · Tailwind · Prisma + Postgres · Nodemailer · ImapFlow.
