/**
 * Free scholarly APIs. Each returns a partial record; nothing here costs
 * Firecrawl credits. Responses are parsed defensively: unexpected shapes yield
 * empty patches, never exceptions.
 */
import type { CrawlerConfig } from "../lib/config.ts";
import type { HttpClient } from "../lib/http.ts";
import { normalizeDoi, stripTags, type LiteratureRecord } from "../lib/records.ts";

type Patch = Partial<LiteratureRecord>;
type Json = Record<string, unknown>;

const asObj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const asNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const enc = encodeURIComponent;

export async function crossref(http: HttpClient, config: CrawlerConfig, doi: string): Promise<Patch> {
  const json = await http.getJson<Json>("crossref", "works", `https://api.crossref.org/works/${enc(doi)}?mailto=${enc(config.contactEmail)}`);
  const msg = asObj(json?.["message"]);
  if (!asStr(msg["DOI"])) return {};
  const authors = asArr(msg["author"])
    .map((a) => asStr(asObj(a)["family"]))
    .filter((a): a is string => a !== null);
  const issued = asArr(asObj(msg["issued"])["date-parts"])[0];
  return {
    doi: normalizeDoi(String(msg["DOI"])),
    title: asStr(asArr(msg["title"])[0]),
    authors: authors.length ? authors.slice(0, 8).join("; ") + (authors.length > 8 ? "; et al." : "") : null,
    year: asNum(asArr(issued)[0]),
    venue: asStr(asArr(msg["container-title"])[0]),
    abstractAvailable: typeof msg["abstract"] === "string",
    citations: asNum(msg["is-referenced-by-count"]),
  };
}

export async function openalex(http: HttpClient, config: CrawlerConfig, doi: string): Promise<Patch> {
  const json = await http.getJson<Json>("openalex", "works", `https://api.openalex.org/works/doi:${enc(doi)}?mailto=${enc(config.contactEmail)}`);
  if (!json || !asStr(json["id"])) return {};
  const oa = asObj(json["open_access"]);
  const best = asObj(json["best_oa_location"]);
  return {
    openalexId: asStr(json["id"]),
    title: asStr(json["display_name"]),
    year: asNum(json["publication_year"]),
    isOa: typeof oa["is_oa"] === "boolean" ? (oa["is_oa"] as boolean) : null,
    oaUrl: asStr(best["pdf_url"]) ?? asStr(best["landing_page_url"]) ?? asStr(oa["oa_url"]),
    oaLicense: asStr(best["license"]),
    citations: asNum(json["cited_by_count"]),
    abstractAvailable: json["abstract_inverted_index"] !== null && json["abstract_inverted_index"] !== undefined,
  };
}

export async function unpaywall(http: HttpClient, config: CrawlerConfig, doi: string): Promise<Patch> {
  const json = await http.getJson<Json>("unpaywall", "v2", `https://api.unpaywall.org/v2/${enc(doi)}?email=${enc(config.contactEmail)}`);
  if (!json || typeof json["is_oa"] !== "boolean") return {};
  const best = asObj(json["best_oa_location"]);
  return {
    isOa: json["is_oa"] as boolean,
    oaUrl: asStr(best["url_for_pdf"]) ?? asStr(best["url_for_landing_page"]) ?? asStr(best["url"]),
    oaLicense: asStr(best["license"]),
  };
}

export async function europepmc(http: HttpClient, doi: string): Promise<Patch> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(`DOI:"${doi}"`)}&format=json&resultType=lite`;
  const json = await http.getJson<Json>("europepmc", "search", url);
  const first = asObj(asArr(asObj(json?.["resultList"])["result"])[0]);
  if (!asStr(first["id"])) return {};
  const isOa = first["isOpenAccess"] === "Y";
  const pmcid = asStr(first["pmcid"]);
  return {
    pmcid,
    ...(isOa ? { isOa: true } : {}),
    ...(isOa && pmcid ? { oaUrl: `https://europepmc.org/article/PMC/${pmcid}` } : {}),
  };
}

export async function semanticScholar(http: HttpClient, doi: string): Promise<Patch> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${enc(doi)}?fields=paperId,title,year,citationCount,isOpenAccess,openAccessPdf`;
  const json = await http.getJson<Json>("semanticscholar", "paper", url);
  if (!json || !asStr(json["paperId"])) return {};
  const pdf = asObj(json["openAccessPdf"]);
  return {
    s2Id: asStr(json["paperId"]),
    year: asNum(json["year"]),
    citations: asNum(json["citationCount"]),
    ...(json["isOpenAccess"] === true ? { isOa: true, oaUrl: asStr(pdf["url"]) } : {}),
  };
}

export interface SearchHit {
  readonly id: string;
  readonly title: string;
  readonly doi: string | null;
  readonly year: number | null;
  readonly url: string | null;
  readonly source: string;
  readonly recordType: "article" | "preprint";
  readonly authors?: readonly string[];
}

export async function openalexSearch(http: HttpClient, config: CrawlerConfig, query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://api.openalex.org/works?search=${enc(query)}&per-page=${limit}&filter=type:article&sort=relevance_score:desc&select=id,doi,display_name,publication_year,authorships&mailto=${enc(config.contactEmail)}`;
  const json = await http.getJson<Json>("openalex", "search", url);
  return asArr(json?.["results"]).flatMap((r) => {
    const row = asObj(r);
    const title = asStr(row["display_name"]);
    const id = asStr(row["id"]);
    if (!title || !id) return [];
    const doi = asStr(row["doi"]) ? normalizeDoi(String(row["doi"])) : null;
    const authors = asArr(row["authorships"])
      .map((a) => asStr(asObj(asObj(a)["author"])["display_name"]))
      .filter((a): a is string => a !== null);
    return [{ id, title, doi, year: asNum(row["publication_year"]), url: null, source: "openalex", recordType: "article" as const, authors }];
  });
}

export async function europepmcSearch(http: HttpClient, query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(`${query} AND OPEN_ACCESS:y`)}&format=json&resultType=lite&pageSize=${limit}`;
  const json = await http.getJson<Json>("europepmc", "search", url);
  return asArr(asObj(json?.["resultList"])["result"]).flatMap((r) => {
    const row = asObj(r);
    const title = asStr(row["title"]);
    const id = asStr(row["id"]);
    if (!title || !id) return [];
    const yearText = asStr(row["pubYear"]);
    return [{
      id: `europepmc:${id}`, title: stripTags(title), doi: asStr(row["doi"]) ? normalizeDoi(String(row["doi"])) : null,
      year: yearText ? Number(yearText) : null, url: null, source: "europepmc", recordType: "article" as const,
    }];
  });
}

export async function arxivSearch(http: HttpClient, query: string, limit: number): Promise<SearchHit[]> {
  const result = await http.request({
    source: "arxiv", endpoint: "query",
    url: `https://export.arxiv.org/api/query?search_query=${enc(query)}&max_results=${limit}`,
  });
  if (result.status !== 200) return [];
  return [...result.text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap((m) => {
    const entry = m[1] ?? "";
    const id = /<id>([^<]+)<\/id>/.exec(entry)?.[1]?.trim();
    const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1];
    const year = /<published>(\d{4})/.exec(entry)?.[1];
    const doi = /<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/.exec(entry)?.[1];
    if (!id || !title) return [];
    return [{
      id: `arxiv:${id.replace(/^https?:\/\/arxiv\.org\/abs\//, "")}`, title: stripTags(title),
      doi: doi ? normalizeDoi(doi) : null, year: year ? Number(year) : null, url: id, source: "arxiv", recordType: "preprint" as const,
    }];
  });
}

export async function psyarxivSearch(http: HttpClient, titleWord: string, limit: number): Promise<SearchHit[]> {
  const url = `https://api.osf.io/v2/preprints/?filter%5Bprovider%5D=psyarxiv&filter%5Btitle%5D=${enc(titleWord)}&page%5Bsize%5D=${limit}`;
  const json = await http.getJson<Json>("osf", "preprints", url);
  return asArr(json?.["data"]).flatMap((r) => {
    const row = asObj(r);
    const attrs = asObj(row["attributes"]);
    const id = asStr(row["id"]);
    const title = asStr(attrs["title"]);
    if (!id || !title) return [];
    const published = asStr(attrs["date_published"]);
    return [{
      id: `psyarxiv:${id}`, title, doi: asStr(attrs["doi"]) ? normalizeDoi(String(attrs["doi"])) : null,
      year: published ? Number(published.slice(0, 4)) : null, url: `https://osf.io/${id.replace(/_v\d+$/, "")}`,
      source: "psyarxiv", recordType: "preprint" as const,
    }];
  });
}
