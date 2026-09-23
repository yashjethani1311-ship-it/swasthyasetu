import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(
  new URL("../src/lib/diagnostics/adapters.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { csvRows, importMachine } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const parameters = [
  {
    id: "parameter",
    parameter_code: "VALUE",
    parameter_name: "Test parameter",
    unit: "unit",
    data_type: "NUMBER",
    required: true,
  },
];
const data = {
  sample_id: "sample",
  test_code: "test",
  observations: [{ parameter_code: "VALUE", value: 0, unit: "unit" }],
};
let n = 0;
function test(name, fn) {
  fn();
  n++;
  console.log("PASS " + name);
}
test("zero retained and original JSON preserved", () => {
  const raw = JSON.stringify(data);
  const result = importMachine(raw, "JSON", "sample", "test", parameters);
  assert.equal(result.values.parameter, "0");
  assert.equal(result.raw, raw);
});
test("wrong sample rejected", () =>
  assert.throws(() =>
    importMachine(JSON.stringify(data), "JSON", "other", "test", parameters),
  ));
test("wrong test rejected", () =>
  assert.throws(() =>
    importMachine(JSON.stringify(data), "JSON", "sample", "other", parameters),
  ));
test("wrong units rejected", () =>
  assert.throws(() =>
    importMachine(
      JSON.stringify({
        ...data,
        observations: [{ ...data.observations[0], unit: "other" }],
      }),
      "JSON",
      "sample",
      "test",
      parameters,
    ),
  ));
test("unknown code rejected", () =>
  assert.throws(() =>
    importMachine(
      JSON.stringify({
        ...data,
        observations: [{ ...data.observations[0], parameter_code: "UNKNOWN" }],
      }),
      "JSON",
      "sample",
      "test",
      parameters,
    ),
  ));
test("duplicate observation rejected", () =>
  assert.throws(() =>
    importMachine(
      JSON.stringify({
        ...data,
        observations: [...data.observations, ...data.observations],
      }),
      "JSON",
      "sample",
      "test",
      parameters,
    ),
  ));
test("non-finite numeric value rejected", () =>
  assert.throws(() =>
    importMachine(
      JSON.stringify({
        ...data,
        observations: [{ ...data.observations[0], value: "Infinity" }],
      }),
      "JSON",
      "sample",
      "test",
      parameters,
    ),
  ));
test("CSV multiline and escaped quotes parsed correctly", () =>
  assert.deepEqual(csvRows('a,b\r\n"line\none","two""quotes"\r\n'), [
    ["a", "b"],
    ["line\none", 'two"quotes'],
  ]));
test("unclosed CSV quoting rejected", () =>
  assert.throws(() => csvRows('a\n"value')));
test("CSV headers validated", () =>
  assert.throws(() =>
    importMachine("value\n10", "CSV", "sample", "test", parameters),
  ));
test("CSV identity and zero retained", () => {
  const raw =
    "sample_id,test_code,parameter_code,value,unit\nsample,test,VALUE,0,unit";
  const r = importMachine(raw, "CSV", "sample", "test", parameters);
  assert.equal(r.values.parameter, "0");
  assert.equal(r.raw, raw);
});
console.log(`${n} import adapter tests passed`);
