import { PageHeader } from "@/components/ui";
import { importContacts } from "../actions";

export const metadata = { title: "Importar contactos" };

export default function ImportContacts() {
  return (
    <>
      <PageHeader title="Importar contactos" sub="Sube un CSV o pega el contenido. Si el email ya existe, se actualizan sus datos." />
      <form action={importContacts} className="card grid max-w-3xl gap-4 p-5">
        <div>
          <label htmlFor="file" className="label">Archivo CSV</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" className="input" />
        </div>
        <div>
          <label htmlFor="text" className="label">O pega aquí las filas</label>
          <textarea
            id="text"
            name="text"
            rows={8}
            className="input font-mono text-[13px]"
            placeholder={"email,nombre,apellido,empresa,cargo\nmarta@logisur.es,Marta,Ruiz,Logisur,Jefa de compras"}
          />
        </div>
        <div>
          <label htmlFor="tags" className="label">Etiquetas para todos (separadas por comas)</label>
          <input id="tags" name="tags" placeholder="distribuidores, feria-hispack" className="input" />
        </div>
        <p className="text-xs text-muted">
          Columnas reconocidas: email, nombre, apellido, empresa, cargo, teléfono (también en inglés: first name, last name, company, title, phone). La única obligatoria es email.
        </p>
        <div><button className="btn">Importar</button></div>
      </form>
    </>
  );
}
