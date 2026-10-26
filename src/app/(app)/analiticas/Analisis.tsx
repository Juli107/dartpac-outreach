import { VARIABLES, MINIMO, SIN_DATO, agrupar, ranking, tiempos, duracion, rate, type Envio, type Grupo, type Variable } from "@/lib/analisis";
import { formatPct } from "@/lib/stats";
import { REPLY_LABEL } from "@/lib/labels";
import { Empty, Pill } from "@/components/ui";

/** Grupos con suficientes envíos primero (por tasa), luego los chicos. */
function ordenar(v: Variable, grupos: Grupo[]) {
  if (v.orden) return grupos;
  return [...grupos].sort((a, b) => Number(b.sent >= MINIMO) - Number(a.sent >= MINIMO) || b.rate - a.rate || b.sent - a.sent);
}

function Barra({ value, max, tone = "brand", className = "w-24" }: { value: number; max: number; tone?: "brand" | "ok"; className?: string }) {
  return (
    <div className={`h-1.5 shrink-0 overflow-hidden rounded-full bg-white/[.08] ${className}`}>
      <div
        className={`h-full rounded-full ${tone === "ok" ? "bg-ok" : "bg-gradient-to-r from-brand-deep to-brand-2"}`}
        style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }}
      />
    </div>
  );
}

/** El ranking muestra las variables que más se destacan; el resto queda en las tablas. */
const TOP = 8;

export function Ranking({ envios }: { envios: Envio[] }) {
  const ganadores = ranking(envios);
  return (
    <section className="card appear min-w-0 overflow-hidden">
      <div className="card-title">
        <h2>Lo que mejor funciona</h2>
        <span className="text-xs text-faint">{envios.length.toLocaleString("es-AR")} emails analizados</span>
      </div>
      {!envios.length ? (
        <Empty title="Todavía no hay envíos para analizar">
          Cuando una secuencia empiece a enviar, acá vas a ver qué consigue más respuestas. Se van a responder estas preguntas:
          <ul className="mt-3 space-y-1 text-left text-[13px]">
            {VARIABLES.map((v) => (
              <li key={v.id}>· {v.pregunta}</li>
            ))}
          </ul>
        </Empty>
      ) : !ganadores.length ? (
        <Empty title="Faltan datos para sacar conclusiones">
          Para comparar hace falta al menos una respuesta y {MINIMO} emails en cada opción (por ejemplo, {MINIMO} seguimientos en el hilo y {MINIMO} como correo
          nuevo). Mientras tanto, las tablas de abajo ya muestran las cifras.
        </Empty>
      ) : (
        <ol className="divide-y divide-line/60">
          {ganadores.slice(0, TOP).map((g, i) => (
            <li key={g.variable.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[.07] font-display text-sm font-semibold text-white ring-1 ring-white/[.1]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-faint">{g.variable.nombre}</div>
                <div className="truncate font-medium text-white">{g.mejor.label}</div>
                <div className="text-[13px] text-muted">
                  {formatPct(g.mejor.rate)} de respuesta ({g.mejor.replied} de {g.mejor.sent}) · le sigue «{g.segundo.label}» con {formatPct(g.segundo.rate)}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.veces > 0 && <Pill tone="ok">{g.veces.toLocaleString("es-AR", { maximumFractionDigits: 1 })}× el promedio</Pill>}
                {g.chico && (
                  <Pill tone="warn" title="Con pocos envíos la diferencia puede ser casualidad: esperá a tener más datos antes de decidir.">
                    Muestra chica
                  </Pill>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** La pregunta principal: seguimientos en el mismo hilo o como correo nuevo. */
export function HiloONuevo({ envios }: { envios: Envio[] }) {
  const v = VARIABLES.find((x) => x.id === "hilo")!;
  const grupos = agrupar(envios, v);
  const hilo = grupos.find((g) => g.key.startsWith("En el mismo hilo"));
  const nuevo = grupos.find((g) => g.key === "Correo nuevo");
  let conclusion = "Todavía no hay seguimientos enviados (paso 2 en adelante) para comparar.";
  if (hilo && nuevo && hilo.sent >= MINIMO && nuevo.sent >= MINIMO && hilo.rate !== nuevo.rate) {
    const [a, b] = hilo.rate > nuevo.rate ? [hilo, nuevo] : [nuevo, hilo];
    const nombre = a === hilo ? "Responder en el mismo hilo" : "Mandar un correo nuevo";
    conclusion = b.rate
      ? `${nombre} consigue ${(a.rate / b.rate).toLocaleString("es-AR", { maximumFractionDigits: 1 })} veces más respuestas.`
      : `${nombre} es lo único que consiguió respuestas hasta ahora.`;
  } else if (hilo || nuevo) {
    conclusion = `Hace falta al menos ${MINIMO} seguimientos de cada tipo para comparar. Para probar, en algunas secuencias desmarcá «Responder en el mismo hilo» en los ajustes de un paso.`;
  }
  const caja = (titulo: string, g?: Grupo) => (
    <div className="rounded-2xl bg-white/[.04] px-4 py-3 ring-1 ring-white/[.06]">
      <div className="text-[12.5px] font-medium text-muted">{titulo}</div>
      <div className="mt-1 font-display text-[28px] font-semibold tabular-nums tracking-tight text-white">{formatPct(g?.rate ?? 0)}</div>
      <div className="text-xs text-faint">
        {g ? `${g.replied} respuestas de ${g.sent.toLocaleString("es-AR")} seguimientos` : "Sin envíos"}
        {g && g.positive > 0 && ` · ${g.positive} interesados`}
      </div>
    </div>
  );
  return (
    <section className="card appear min-w-0 overflow-hidden">
      <div className="card-title"><h2>¿Contestan más en el mismo hilo o con un correo nuevo?</h2></div>
      <div className="grid gap-3 px-5 pb-2 sm:grid-cols-2">
        {caja("En el mismo hilo (Re:)", hilo)}
        {caja("Correo nuevo", nuevo)}
      </div>
      <p className="px-5 pb-4 pt-1 text-[13px] text-muted">{conclusion} Solo cuenta los seguimientos: el primer email siempre es un correo nuevo.</p>
    </section>
  );
}

export function Tiempos({ envios }: { envios: Envio[] }) {
  const t = tiempos(envios);
  const max = Math.max(...t.tramos.map((x) => x.n), 1);
  const etiquetas = Object.entries(REPLY_LABEL).map(([k, [label]]) => ({ label, n: envios.filter((e) => e.reply?.label === k).length }));
  const maxE = Math.max(...etiquetas.map((x) => x.n), 1);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title">
          <h2>Cuánto tardan en contestar</h2>
          {t.mediana !== null && <span className="text-xs text-faint">La mitad contesta en menos de {duracion(t.mediana)}</span>}
        </div>
        {!t.total ? (
          <p className="px-5 pb-5 text-muted">Sin respuestas todavía.</p>
        ) : (
          <table className="table">
            <tbody>
              {t.tramos.map((x) => (
                <tr key={x.label}><td>{x.label}</td><td className="text-right">{x.n}</td><td className="w-28"><Barra value={x.n} max={max} tone="ok" /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card appear min-w-0 overflow-hidden">
        <div className="card-title">
          <h2>Cómo contestan</h2>
          <span className="text-xs text-faint">Según la etiqueta de la Bandeja</span>
        </div>
        {!t.total ? (
          <p className="px-5 pb-5 text-muted">Sin respuestas todavía.</p>
        ) : (
          <table className="table">
            <tbody>
              {etiquetas.map((x) => (
                <tr key={x.label}><td>{x.label}</td><td className="text-right">{x.n}</td><td className="w-28"><Barra value={x.n} max={maxE} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const FILAS = 10;

export function Variables({ envios }: { envios: Envio[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {VARIABLES.filter((v) => v.id !== "hilo").map((v) => {
        const grupos = ordenar(v, agrupar(envios, v));
        const max = Math.max(...grupos.map((g) => g.rate), 0.0001);
        const mejor = grupos.filter((g) => g.sent >= MINIMO && g.key !== SIN_DATO && g.replied).sort((a, b) => b.rate - a.rate)[0];
        const total = grupos.reduce((s, g) => s + g.sent, 0);
        const resp = grupos.reduce((s, g) => s + g.replied, 0);
        return (
          <section key={v.id} className="card appear min-w-0 overflow-hidden">
            <div className="px-5 pb-2 pt-4">
              <h2>{v.nombre}</h2>
              <p className="mt-0.5 text-[13px] text-muted">{v.pregunta}</p>
            </div>
            {!grupos.length ? (
              <p className="px-5 pb-5 text-[13px] text-faint">Sin datos en este período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Opción</th><th className="text-right">Enviados</th><th className="text-right">Resp.</th><th>Tasa</th></tr></thead>
                  <tbody>
                    {grupos.slice(0, FILAS).map((g) => (
                      <tr key={g.key} className={g.sent < MINIMO ? "text-faint" : undefined}>
                        <td className="max-w-[13rem] truncate" title={g.label}>
                          <span className={g === mejor ? "font-medium text-white" : undefined}>{g.label}</span>
                          {g === mejor && <span className="ml-2"><Pill tone="ok">Mejor</Pill></span>}
                        </td>
                        <td className="text-right">{g.sent.toLocaleString("es-AR")}</td>
                        <td className="text-right">{g.replied}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="w-12 text-right">{formatPct(g.rate)}</span>
                            <Barra value={g.rate} max={max} tone={g === mejor ? "ok" : "brand"} className="w-14" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-5 py-2.5 text-xs text-faint">
                  Promedio: {formatPct(rate(resp, total))}
                  {grupos.some((g) => g.sent < MINIMO) && ` · En gris: menos de ${MINIMO} envíos, todavía no se puede comparar`}
                  {grupos.length > FILAS && ` · ${grupos.length - FILAS} opciones más en la descarga`}
                </p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
