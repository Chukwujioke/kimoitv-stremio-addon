const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const cheerio = require("cheerio");

const BASE = "https://kimoitv.com";
const PORT = process.env.PORT || 7000;

const manifest = {
  id: "com.personal.kimoitv",
  version: "1.0.0",
  name: "KimoiTV",
  description: "KimoiTV movie and series catalog/search addon.",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  catalogs: [
    {
      type: "movie",
      id: "kimoitv-movies",
      name: "KimoiTV Movies",
      extra: [{ name: "search", isRequired: false }]
    },
    {
      type: "series",
      id: "kimoitv-series",
      name: "KimoiTV Series",
      extra: [{ name: "search", isRequired: false }]
    }
  ]
};

const builder = new addonBuilder(manifest);

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function makeId(type, url) {
  return `kimoitv:${type}:${encodeURIComponent(url)}`;
}

function parseListing(html, forcedType) {
  const $ = cheerio.load(html);
  const metas = [];
  const seen = new Set();

  $("a[href*='/title/']").each((_, el) => {
    const href = $(el).attr("href");
    const name = $(el).text().trim();

    if (!href || !name) return;

    const url = new URL(href, BASE).href;

    if (!url.includes("/title/")) return;
    if (seen.has(url)) return;

    seen.add(url);

    const type = forcedType || "movie";

    const yearMatch = name.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? Number(yearMatch[0]) : undefined;

    metas.push({
      id: makeId(type, url),
      type,
      name,
      year,
      poster: undefined
    });
  });

  return metas.slice(0, 20);
}

function parseTitle(html, sourceUrl, typeHint) {
  const $ = cheerio.load(html);

  let title = $("h1").first().text().trim();

  if (!title) {
    title = $("title").first().text().trim();
  }

  title = title
    .replace(/\s*\|\s*KimoiTV.*$/i, "")
    .replace(/\s+(WebDL|WEB-DL|HDTV|Download).*$/i, "")
    .trim();

  const text = $("body").text();

  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : undefined;

  const poster =
    $("meta[property='og:image']").attr("content") ||
    $("img").first().attr("src");

  const meta = {
    id: makeId(typeHint, sourceUrl),
    type: typeHint,
    name: title || "KimoiTV",
    year,
    poster: poster ? new URL(poster, BASE).href : undefined
  };

  return meta;
}

builder.defineCatalogHandler(async ({ type, extra }) => {
  try {
    let url;

    if (extra && extra.search) {
      url = `${BASE}/search/?q=${encodeURIComponent(extra.search)}`;
    } else if (type === "series") {
      url = `${BASE}/genre/Tv-series/c/Drama.html?sort=newest`;
    } else {
      url = `${BASE}/genre/Movies/c/.html?sort=newest`;
    }

    const html = await fetchHtml(url);

    return {
      metas: parseListing(html, type)
    };
  } catch (error) {
    console.error("Catalog error:", error);

    return {
      metas: []
    };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  try {
    const prefix = `kimoitv:${type}:`;

    if (!id.startsWith(prefix)) {
      return { meta: null };
    }

    const sourceUrl = decodeURIComponent(id.slice(prefix.length));

    const html = await fetchHtml(sourceUrl);
    const meta = parseTitle(html, sourceUrl, type);

    return {
      meta
    };
  } catch (error) {
    console.error("Meta error:", error);

    return {
      meta: null
    };
  }
});

builder.defineStreamHandler(async ({ type, id }) => {
  try {
    const prefix = `kimoitv:${type}:`;

    if (!id.startsWith(prefix)) {
      return { streams: [] };
    }

    const sourceUrl = decodeURIComponent(id.slice(prefix.length));

    return {
      streams: [
        {
          name: "KimoiTV",
          title: "Open source page",
          externalUrl: sourceUrl
        }
      ]
    };
  } catch (error) {
    console.error("Stream error:", error);

    return {
      streams: []
    };
  }
});

serveHTTP(builder.getInterface(), {
  port: PORT
});

console.log(`KimoiTV Stremio addon running on port ${PORT}`);
