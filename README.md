# Dartpac Outreach

Plataforma propia de prospección por email para el equipo comercial de Dartpac: secuencias automáticas con esperas, contactos, bandeja de respuestas, tareas manuales y analíticas. Marca Dartpac en azul marino.

## Qué hace

- **Contactos**: alta manual o importación CSV (columnas en español o inglés), etiquetas, búsqueda.
- **Secuencias**: firma propia que se añade al final de cada email; pasos de email o tarea manual con esperas en días. Variables `{{nombre}}`, `{{apellido}}`, `{{empresa}}`, `{{cargo}}`, `{{email}}`, con valor por defecto `{{nombre|hola}}`. Los seguimientos van en el mismo hilo.
- **Envío programado**: `/api/cron` se ejecuta cada 10 minutos (Vercel Cron). Solo envía de lunes a viernes dentro del horario configurado y respeta el límite diario de cada secuencia.
- **Bandeja**: lee el buzón por IMAP; cuando un contacto responde sale de sus secuencias. Las respuestas se clasifican (interesado, reunión, más adelante, no interesado).
- **Tareas**: los pasos manuales (llamar, LinkedIn) aparecen aquí.
- **Analíticas**: enviados, aperturas (píxel), respuestas y rebotes por semana y por secuencia.
- **Baja**: cada email lleva enlace firmado de baja y cabecera `List-Unsubscribe`.

## Puesta en marcha local

```bash
cp .env.example .env      # rellena DATABASE_URL, APP_PASSWORD, SESSION_SECRET y el buzón
npm install
npm run db:push           # crea las tablas
npm run db:seed           # opcional: datos de ejemplo
npm run dev               # http://localhost:3000
```

Para probar el envío sin buzón real puedes poner en `.env` un servidor SMTP de pruebas (por ejemplo Mailpit) y llamar a mano al cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

## Despliegue en Vercel

1. Crea una base de datos Postgres (Neon o Vercel Postgres) y copia su URL en `DATABASE_URL`.
2. Importa el repositorio en Vercel y añade todas las variables de `.env.example`.
3. Ejecuta `npx prisma db push` una vez contra esa base de datos.
4. El cron de `vercel.json` llama a `/api/cron` cada 10 minutos con `CRON_SECRET`.

Con Gmail o Google Workspace usa una **contraseña de aplicación** para SMTP e IMAP.

## Pruebas

```bash
npm test         # plantillas, horario de envío, CSV y limpieza de respuestas
npm run typecheck
```

## Stack

Next.js 15 (App Router, server actions) · TypeScript · Tailwind · Prisma + Postgres · Nodemailer · ImapFlow.
