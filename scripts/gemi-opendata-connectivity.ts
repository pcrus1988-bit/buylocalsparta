import { GemiOpenDataClient } from "../packages/gemi-opendata/src/index.ts";

const arg = process.argv[2]?.trim();
const client = new GemiOpenDataClient();

if (!arg) {
  const statuses = await client.getReferenceData("companyStatuses");
  console.log(JSON.stringify({
    ok: true,
    provider: "GEMI_OPENDATA_OFFICIAL",
    operation: "metadata/companyStatuses",
    received: Array.isArray(statuses) ? statuses.length : undefined
  }, null, 2));
  process.exit(0);
}

const digits = arg.replace(/\D/g, "");
if (/^\d{9}$/.test(digits)) {
  const response = await client.searchCompanies({ afm: digits, resultsSize: 25 });
  console.log(JSON.stringify({
    ok: true,
    provider: "GEMI_OPENDATA_OFFICIAL",
    operation: "companies/search-by-afm",
    afm: digits,
    count: response.searchResults?.length ?? 0,
    results: (response.searchResults ?? []).map((company) => ({
      arGemi: String(company.arGemi),
      afm: company.afm,
      legalName: company.coNameEl,
      tradeNames: company.coTitlesEl,
      status: company.status?.descr,
      city: company.city,
      municipality: company.municipality?.descr,
      prefecture: company.prefecture?.descr
    }))
  }, null, 2));
  process.exit(0);
}

if (/^\d{6,15}$/.test(digits)) {
  const company = await client.getCompany(digits);
  console.log(JSON.stringify({
    ok: true,
    provider: "GEMI_OPENDATA_OFFICIAL",
    operation: "companies/detail",
    company: {
      arGemi: String(company.arGemi),
      afm: company.afm,
      legalName: company.coNameEl,
      tradeNames: company.coTitlesEl,
      status: company.status?.descr,
      city: company.city,
      municipality: company.municipality?.descr,
      prefecture: company.prefecture?.descr,
      legalType: company.legalType?.descr,
      gemiOffice: company.gemiOffice?.descr
    }
  }, null, 2));
  process.exit(0);
}

const response = await client.searchCompanies({ name: arg, resultsSize: 25 });
console.log(JSON.stringify({
  ok: true,
  provider: "GEMI_OPENDATA_OFFICIAL",
  operation: "companies/search-by-name",
  query: arg,
  count: response.searchResults?.length ?? 0,
  results: (response.searchResults ?? []).map((company) => ({
    arGemi: String(company.arGemi),
    afm: company.afm,
    legalName: company.coNameEl,
    tradeNames: company.coTitlesEl,
    status: company.status?.descr,
    city: company.city,
    municipality: company.municipality?.descr,
    prefecture: company.prefecture?.descr
  }))
}, null, 2));
