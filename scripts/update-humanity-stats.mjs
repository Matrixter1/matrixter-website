import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, 'data', 'humanity-stats.json');
const WORLD_BANK = 'https://api.worldbank.org/v2/country/WLD/indicator';
const ETHNOLOGUE_FAQ = 'https://www.ethnologue.com/faq/how-many-languages/';

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function formatShort(value) {
  if (typeof value === 'string') return value;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return value.toLocaleString('en-US');
  return String(value);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Matrixter humanity stats refresh'
    }
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'Accept': 'text/html',
      'User-Agent': 'Matrixter humanity stats refresh'
    }
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

async function latestWorldBankIndicator(indicator) {
  const url = `${WORLD_BANK}/${indicator}?format=json&per_page=80`;
  const payload = await fetchJson(url);
  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const latest = rows
    .filter((row) => row.value !== null && row.value !== undefined)
    .sort((a, b) => Number(b.date) - Number(a.date))[0];
  if (!latest) throw new Error(`No World Bank value found for ${indicator}`);
  return {
    year: Number(latest.date),
    value: Number(latest.value)
  };
}

async function fetchLivingLanguages(fallback) {
  try {
    const html = await fetchText(ETHNOLOGUE_FAQ);
    const match = html.match(/There are\s+([\d,]+)\s+living languages/i);
    if (!match) return fallback;
    return Number(match[1].replace(/,/g, ''));
  } catch {
    return fallback;
  }
}

function estimateCurrentPopulation(population, growthRate) {
  const now = new Date();
  const midyear = new Date(Date.UTC(population.year, 6, 1));
  const days = Math.max(0, (now.getTime() - midyear.getTime()) / 86400000);
  const annualGrowth = Number.isFinite(growthRate.value) ? growthRate.value / 100 : 0;
  return population.value * (1 + annualGrowth * (days / 365.25));
}

async function buildStats() {
  const fallback = await readExistingStats();
  const [populationResult, growthResult, birthRateResult] = await Promise.allSettled([
    latestWorldBankIndicator('SP.POP.TOTL'),
    latestWorldBankIndicator('SP.POP.GROW'),
    latestWorldBankIndicator('SP.DYN.CBRT.IN')
  ]);

  const population = populationResult.status === 'fulfilled' ? populationResult.value : null;
  const growthRate = growthResult.status === 'fulfilled' ? growthResult.value : null;
  const crudeBirthRate = birthRateResult.status === 'fulfilled' ? birthRateResult.value : null;

  const fallbackPopulation = fallback?.stats?.population?.value ?? 8_200_000_000;
  const fallbackBirthsPerDay = fallback?.stats?.birthsPerDay?.value ?? 385_000;
  const populationEstimate = population && growthRate
    ? roundTo(estimateCurrentPopulation(population, growthRate), 1_000_000)
    : fallbackPopulation;
  const birthsPerDay = crudeBirthRate
    ? roundTo((populationEstimate * crudeBirthRate.value / 1000) / 365.25, 1000)
    : fallbackBirthsPerDay;
  const livingLanguages = await fetchLivingLanguages(fallback?.stats?.livingLanguages?.value ?? 7159);
  const generatedAt = new Date();

  return {
    generatedAt: generatedAt.toISOString(),
    displayUpdatedAt: formatDate(generatedAt),
    note: 'Global figures are rounded estimates. Population and births are refreshed daily from public demographic datasets; language, country, religion, and genetics figures are reference values.',
    stats: {
      population: {
        value: populationEstimate,
        short: formatShort(populationEstimate),
        label: 'Hearts Beating Now',
        source: population && growthRate
          ? `World Bank WDI SP.POP.TOTL ${population.year}, adjusted with SP.POP.GROW ${growthRate.year}`
          : fallback?.stats?.population?.source ?? 'Cached fallback population estimate'
      },
      birthsPerDay: {
        value: birthsPerDay,
        short: formatShort(birthsPerDay),
        label: 'Born Today',
        source: crudeBirthRate
          ? `World Bank WDI SP.DYN.CBRT.IN ${crudeBirthRate.year}`
          : fallback?.stats?.birthsPerDay?.source ?? 'Cached fallback birth estimate'
      },
      livingLanguages: {
        value: livingLanguages,
        short: livingLanguages.toLocaleString('en-US'),
        label: 'Languages Spoken',
        source: 'Ethnologue public living language count'
      },
      countries: {
        value: 195,
        short: '195',
        label: 'Nations - One Earth',
        source: 'Common reference count of sovereign states'
      },
      religions: {
        value: '10K+',
        short: '10K+',
        label: 'Religion',
        source: 'Approximate reference figure'
      },
      geneticSimilarity: {
        value: '99.9%',
        short: '99.9%',
        label: 'Genetic Similarity',
        source: 'Common scientific shorthand'
      }
    }
  };
}

async function readExistingStats() {
  try {
    return JSON.parse(await readFile(OUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

const stats = await buildStats();
await mkdir(path.dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
console.log(`Updated ${path.relative(ROOT, OUT_PATH)} at ${stats.displayUpdatedAt}`);
