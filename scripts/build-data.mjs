/* build-data.mjs
 * Generate v1/hazards.json, v1/regulatory.json, v1/ingredients.json
 * from Open Food Facts taxonomies + your overrides.
 * Run:  node scripts/build-data.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.cwd());
const V1_DIR = path.join(ROOT, 'v1');
const OV_DIR = path.join(ROOT, 'overrides');

const OFF_ADD_URL = 'https://static.openfoodfacts.org/data/taxonomies/additives.json';
const OFF_ING_URL = 'https://static.openfoodfacts.org/data/taxonomies/ingredients.json';

const hazardsOverrides = JSON.parse(await fs.readFile(path.join(OV_DIR, 'hazards.overrides.json'), 'utf8'));
const regulatoryOverrides = JSON.parse(await fs.readFile(path.join(OV_DIR, 'regulatory.overrides.json'), 'utf8'));

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'clean-plate-data-builder/1.0' } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

function normName(s) {
  return (s || '').toLowerCase().trim();
}

function addENumberAliases(tag) {
  // tag like "en:e171" → ["E171","E-171","e171","e-171"]
  const m = /:e(\d+[a-z]?)$/i.exec(tag);
  if (!m) return [];
  const code = m[1].toUpperCase();
  return [`E${code}`, `E-${code}`, `e${code}`, `e-${code}`];
}

function extractEnglishAliases(entry, tag) {
  const names = new Set();

  // display name
  const display =
    (entry?.name?.en) ||
    (entry?.name && typeof entry.name === 'string' ? entry.name : null) ||
    null;
  if (display) names.add(display);

  // synonyms.en is usually an array
  const syns = entry?.synonyms?.en;
  if (Array.isArray(syns)) syns.forEach((s) => s && names.add(s));

  // sometimes ingredients have 'synonyms' as object of arrays
  // keep only en
  // Add E-number aliases if present
  addENumberAliases(tag).forEach((a) => names.add(a));

  // plus a fallback humanized from the tag
  const t = tag.replace(/^en:/, '').replace(/-/g, ' ');
  if (t && !/^[a-z]?\d+$/i.test(t)) names.add(t);

  // de-dupe and return as plain array
  return Array.from(names).map((s) => s.trim()).filter(Boolean);
}

function enumberFromTag(tag) {
  const m = /:e(\d+[a-z]?)$/i.exec(tag);
  return m ? [`e${m[1].toLowerCase()}`] : [];
}

function toHazardItem(tag, entry, hazardLevel, note) {
  const aliases = extractEnglishAliases(entry, tag);
  const enumbers = enumberFromTag(tag).map((e) => e.toUpperCase());
  const keyName = (entry?.name?.en) || aliases[0] || tag.replace(/^en:/, '');
  return {
    key: keyName.toLowerCase(),
    aliases,
    enumbers,
    hazard_level: hazardLevel,
    note: note || ''
  };
}

function toIngredientItem(tag, entry) {
  const aliases = extractEnglishAliases(entry, tag);
  const enumbers = enumberFromTag(tag).map((e) => e.toUpperCase());
  const keyName = (entry?.name?.en) || aliases[0] || tag.replace(/^en:/, '');
  return {
    key: keyName.toLowerCase(),
    aliases,
    enumbers,
    summary: "",
    detail: "",
    references: ["Open Food Facts ingredient taxonomy"]
  };
}

function applyHazardLevel(tag) {
  const t = tag.toLowerCase();
  if (hazardsOverrides.avoid?.includes(t)) return 'avoid';
  if (hazardsOverrides.caution?.includes(t)) return 'caution';
  return 'info';
}

function hazardNote(tag) {
  return hazardsOverrides.notes?.[tag] || '';
}

function toRegulatoryItem(ov) {
  // minimal normalization: ensure arrays exist
  return {
    key: (ov.aliases?.[0] || ov.tag.replace(/^en:/, '')).toLowerCase(),
    aliases: ov.aliases || [],
    enumbers: ov.enumbers || [],
    regions: ov.regions || {}
  };
}

async function main() {
  await fs.mkdir(V1_DIR, { recursive: true });

  // 1) ADDITIVES → hazards.json (large: thousands)
  const additives = await getJSON(OFF_ADD_URL); // object keyed by tag (e.g., "en:e171")
  const hazardItems = [];
  for (const [tag, entry] of Object.entries(additives)) {
    if (!tag.startsWith('en:')) continue;        // keep English namespace
    // Build item
    const level = applyHazardLevel(tag);
    const note = hazardNote(tag);
    hazardItems.push(toHazardItem(tag, entry, level, note));
  }
  // Append a virtual record for "partially-hydrogenated-oils" (not an OFF additive tag)
  if (!hazardItems.find(i => i.key.includes('partially hydrogenated'))) {
    hazardItems.push({
      key: "partially hydrogenated oils",
      aliases: ["partially hydrogenated oil", "industrial trans fat", "phos", "trans fat"],
      enumbers: [],
      hazard_level: "avoid",
      note: hazardsOverrides.notes?.["en:partially-hydrogenated-oils"] || ""
    });
  }
  await fs.writeFile(path.join(V1_DIR, 'hazards.json'), JSON.stringify({ version: 1, items: hazardItems }, null, 2), 'utf8');

  // 2) REGULATORY → regulatory.json (curated, credible)
  const regulatoryItems = (regulatoryOverrides.items || []).map(toRegulatoryItem);
  await fs.writeFile(path.join(V1_DIR, 'regulatory.json'), JSON.stringify({ version: 1, items: regulatoryItems }, null, 2), 'utf8');

  // 3) INGREDIENTS → ingredients.json (very large: tens of thousands)
  const ingredients = await getJSON(OFF_ING_URL);
  const ingredientItems = [];
  for (const [tag, entry] of Object.entries(ingredients)) {
    if (!tag.startsWith('en:')) continue;
    ingredientItems.push(toIngredientItem(tag, entry));
  }
  await fs.writeFile(path.join(V1_DIR, 'ingredients.json'), JSON.stringify({ version: 1, items: ingredientItems }, null, 2), 'utf8');

  console.log(`Built:
  - v1/hazards.json (${hazardItems.length} entries)
  - v1/regulatory.json (${regulatoryItems.length} entries)
  - v1/ingredients.json (${ingredientItems.length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

