import { db } from "@/lib/db";
import { iaConfigurada } from "@/lib/radar/claude";
import { RadarFrame } from "./RadarFrame";

export const metadata = { title: "Radar comercial" };

export default async function RadarPage({ searchParams }: { searchParams: Promise<{ ir?: string }> }) {
  const [{ ir }, prospectos] = await Promise.all([searchParams, db.radarDoc.count({ where: { col: "prospectos", deleted: false } })]);
  return <RadarFrame ir={ir ?? null} vacio={prospectos === 0} ia={iaConfigurada()} />;
}
