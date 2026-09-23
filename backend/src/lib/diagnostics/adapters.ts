import type { Parameter } from "./service";
export type AdapterProtocol =
  "MANUAL" | "CSV" | "JSON" | "API" | "HL7" | "ASTM";
export type ImportResult = {
  source: "CSV" | "JSON";
  raw: string;
  values: Record<string, string>;
};
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw new Error("Invalid CSV quoting");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      closed = false;
    } else {
      if (closed) throw new Error("Invalid text after quoted CSV cell");
      cell += c;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function importMachine(
  raw: string,
  source: "CSV" | "JSON",
  sampleCode: string,
  testCode: string,
  parameters: Parameter[],
): ImportResult {
  if (new TextEncoder().encode(raw).length > 2097152)
    throw new Error("Import exceeds 2 MB");
  let records: Record<string, unknown>[];
  if (source === "JSON") {
    const doc = JSON.parse(raw);
    if (
      !doc ||
      Array.isArray(doc) ||
      doc.sample_id !== sampleCode ||
      doc.test_code !== testCode
    )
      throw new Error(
        "JSON sample_id and test_code must match this specimen and test",
      );
    if (!Array.isArray(doc.observations) || !doc.observations.length)
      throw new Error("No observations");
    records = doc.observations;
  } else {
    const [headers, ...rows] = csvRows(raw);
    if (!headers || !rows.length || new Set(headers).size !== headers.length)
      throw new Error("CSV headers must be unique and include observations");
    if (
      !["sample_id", "test_code", "parameter_code", "value", "unit"].every(
        (h) => headers.includes(h),
      )
    )
      throw new Error(
        "CSV requires sample_id,test_code,parameter_code,value,unit",
      );
    records = rows.map((row) => {
      if (row.length !== headers.length)
        throw new Error("CSV row length mismatch");
      const r = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
      if (r.sample_id !== sampleCode || r.test_code !== testCode)
        throw new Error("CSV sample or test mismatch");
      return r;
    });
  }
  const values: Record<string, string> = {};
  for (const row of records) {
    if (!row || typeof row !== "object") throw new Error("Invalid observation");
    const code = row.parameter_code ?? row.code;
    const p = parameters.find((p) => p.parameter_code === code);
    if (!p) throw new Error(`Unknown parameter code: ${String(code)}`);
    if (p.id in values)
      throw new Error(`Duplicate parameter: ${p.parameter_code}`);
    if ((row.unit ?? "") !== (p.unit ?? ""))
      throw new Error(`Unit mismatch: ${p.parameter_code}`);
    if (!["string", "number", "boolean"].includes(typeof row.value))
      throw new Error(`Invalid value: ${p.parameter_code}`);
    const value = String(row.value);
    if (
      p.data_type === "NUMBER" &&
      (!value.trim() || !Number.isFinite(Number(value)))
    )
      throw new Error(`Invalid number: ${p.parameter_code}`);
    values[p.id] = value;
  }
  return { source, raw, values };
}
