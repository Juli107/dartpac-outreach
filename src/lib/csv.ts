import Papa from "papaparse";

export type ParsedContact = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
};

// Nombres de columna aceptados (en minúsculas y sin acentos).
const HEADER_MAP: Record<string, keyof ParsedContact> = {
  email: "email", correo: "email", "correo electronico": "email", "e-mail": "email",
  nombre: "firstName", "first name": "firstName", first_name: "firstName", firstname: "firstName",
  apellido: "lastName", apellidos: "lastName", "last name": "lastName", last_name: "lastName", lastname: "lastName",
  empresa: "company", company: "company", compania: "company", organizacion: "company",
  cargo: "title", puesto: "title", title: "title", "job title": "title",
  telefono: "phone", phone: "phone", movil: "phone",
};

function normalize(h: string) {
  return h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseContactsCsv(text: string): { contacts: ParsedContact[]; skipped: number } {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => HEADER_MAP[normalize(h)] ?? normalize(h),
  });
  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];
  let skipped = 0;
  for (const row of result.data) {
    const email = row.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    const pick = (k: keyof ParsedContact) => row[k]?.trim() || undefined;
    contacts.push({
      email,
      firstName: pick("firstName"),
      lastName: pick("lastName"),
      company: pick("company"),
      title: pick("title"),
      phone: pick("phone"),
    });
  }
  return { contacts, skipped };
}
