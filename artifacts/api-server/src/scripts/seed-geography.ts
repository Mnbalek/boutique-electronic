import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closeDb, eq, getDb } from "@workspace/db";
import { communes, deliveryZones, departments } from "@workspace/db/schema";

const envPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const departmentData = JSON.parse(readFileSync(new URL("../data/benin-departments.json", import.meta.url), "utf8")) as Array<{ id: string; name: { local: string } }>;
const communeData = JSON.parse(readFileSync(new URL("../data/benin-communes.json", import.meta.url), "utf8")) as Array<{ id: string; name: { local: string }; parent: { id: string } }>;

async function seedGeography() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL doit viser une base de développement.");
  if (process.env.NODE_ENV === "production") throw new Error("Seed géographique bloqué en production.");
  if (departmentData.length !== 12 || communeData.length !== 77) throw new Error("Le référentiel doit contenir 12 départements et 77 communes.");
  const db = getDb();
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr-FR");
  const zone1Names = new Set(["Cotonou", "Abomey-Calavi", "Sèmè-Podji"].map(normalize));
  const zone2Names = new Set(["Allada", "Kpomassè", "Ouidah", "Sô-Ava", "Toffo", "Tori-Bossito", "Zè"].map(normalize));
  try {
    await db.transaction(async (tx) => {
      const departmentIds = new Map<string, string>();
      const communeIds = new Map<string, string>();
      for (const item of departmentData) {
        const [saved] = await tx.insert(departments).values({ code: item.id, name: item.name.local })
          .onConflictDoUpdate({ target: departments.code, set: { name: item.name.local, updatedAt: new Date() } })
          .returning({ id: departments.id });
        departmentIds.set(item.id, saved.id);
      }
      for (const item of communeData) {
        const departmentId = departmentIds.get(item.parent.id);
        if (!departmentId) throw new Error(`Département parent absent pour ${item.name.local}`);
        const [saved] = await tx.insert(communes).values({ departmentId, name: item.name.local, active: true })
          .onConflictDoUpdate({ target: [communes.departmentId, communes.name], set: { active: true, updatedAt: new Date() } })
          .returning({ id: communes.id });
        communeIds.set(item.id, saved.id);
      }

      const zones = [
        { key: "zone-1", name: "Zone 1 — Agglomération de Cotonou", feeFCFA: 1000 },
        { key: "zone-2", name: "Zone 2 — Atlantique périphérie", feeFCFA: 2000 },
        { key: "zone-3", name: "Zone 3 — Autres communes du Bénin", feeFCFA: 3500 },
      ] as const;
      const zoneIds = new Map<string, string>();
      for (const zone of zones) {
        const [saved] = await tx.insert(deliveryZones).values({ name: zone.name, feeFCFA: zone.feeFCFA, active: true })
          .onConflictDoUpdate({ target: deliveryZones.name, set: { feeFCFA: zone.feeFCFA, active: true, updatedAt: new Date() } })
          .returning({ id: deliveryZones.id });
        zoneIds.set(zone.key, saved.id);
      }
      for (const item of communeData) {
        const communeId = communeIds.get(item.id);
        const name = normalize(item.name.local);
        const zoneKey = zone1Names.has(name) ? "zone-1" : zone2Names.has(name) ? "zone-2" : "zone-3";
        const zoneId = zoneIds.get(zoneKey);
        if (!communeId || !zoneId) throw new Error(`Rattachement de livraison absent pour ${item.name.local}`);
        await tx.update(communes).set({ deliveryZoneId: zoneId, updatedAt: new Date() }).where(eq(communes.id, communeId));
      }
    });
    console.info(`Référentiel chargé : ${departmentData.length} départements, ${communeData.length} communes et 3 zones de démonstration.`);
  } finally { await closeDb(); }
}
seedGeography().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Échec du seed géographique : ${message}`);
  process.exitCode = 1;
});
