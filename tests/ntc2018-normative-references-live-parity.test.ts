import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as TypeScriptApi from "../dist/index.js";
import {
  createNormativeReference as typescriptCreateNormativeReference,
  withNormativeReferences as typescriptWithNormativeReferences,
} from "../dist/norms/normativeReference.js";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceModulePath = path.join(sourceRoot, "src", "norms", "ntc2018", "normativeReferences.js");
const sourceFactoryPath = path.join(sourceRoot, "src", "norms", "normativeReference.js");
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");

const sourceModule = (await import(pathToFileURL(sourceModulePath).href)) as Record<
  string,
  unknown
>;
const sourceFactory = (await import(pathToFileURL(sourceFactoryPath).href)) as Record<
  string,
  unknown
>;
const sourceIndex = (await import(pathToFileURL(sourceIndexPath).href)) as Record<string, unknown>;
const sourceCreateNormativeReference = sourceFactory.createNormativeReference as (
  options: Record<string, unknown>,
) => Readonly<Record<string, unknown>>;
const sourceWithNormativeReferences = sourceFactory.withNormativeReferences as (
  metadata: Record<string, unknown>,
  references: readonly Readonly<Record<string, unknown>>[],
) => Record<string, unknown>;
const typescriptSourceModule = (await import(
  "../dist/norms/ntc2018/normativeReferences.js"
)) as Record<string, unknown>;

const catalogNames = [
  "CIRC2019_RC_REFERENCES",
  "NTC2018_RC_CHAPTER_4_REFERENCES",
  "NTC2018_RC_CHAPTER_7_4_REFERENCES",
  "NTC2018_RC_OUTSIDE_CORPUS_REFERENCES",
] as const;
const scalarNames = [
  "NORMATIVE_REFERENCE_RELATIONS",
  "NORMATIVE_REFERENCE_RESOLUTION_STATUS",
  "NTC2018_NORMATIVE_CORPUS",
] as const;

function gitOutput(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function errorSignature(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function sourceDefinedCatalogValue(name: string, value: unknown): unknown {
  const sourceCatalog = sourceModule[name];
  assert.ok(sourceCatalog && typeof sourceCatalog === "object");
  assert.ok(value && typeof value === "object");
  const targetCatalog = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(sourceCatalog).map((key) => [key, targetCatalog[key]]));
}

function sourceDefinedRootValue(name: string): unknown {
  if (catalogNames.includes(name as (typeof catalogNames)[number])) {
    return sourceDefinedCatalogValue(name, TypeScriptApi[name as keyof typeof TypeScriptApi]);
  }
  return sourceIndex[name];
}

void test("NTC 2018 normative-reference exports match the pinned source exactly", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");
  assert.deepEqual(Object.keys(typescriptSourceModule).sort(), Object.keys(sourceModule).sort());

  for (const name of scalarNames) {
    assert.deepEqual(typescriptSourceModule[name], sourceModule[name]);
    assert.equal(JSON.stringify(typescriptSourceModule[name]), JSON.stringify(sourceModule[name]));
    assert.deepEqual(TypeScriptApi[name as keyof typeof TypeScriptApi], sourceIndex[name]);
  }

  for (const name of catalogNames) {
    const sourceCatalog = sourceModule[name];
    const typescriptCatalog = typescriptSourceModule[name];
    const projected = sourceDefinedCatalogValue(name, typescriptCatalog);
    assert.deepEqual(Object.keys(projected as object), Object.keys(sourceCatalog as object));
    assert.deepEqual(
      Object.keys(typescriptCatalog as object).filter(
        (key) => !Object.hasOwn(sourceCatalog as object, key),
      ),
      name === "NTC2018_RC_CHAPTER_4_REFERENCES"
        ? ["serviceModularRatio"]
        : name === "NTC2018_RC_OUTSIDE_CORPUS_REFERENCES"
          ? ["cosenzaCircularShear"]
          : [],
    );
    assert.deepEqual(projected, sourceCatalog);
    assert.equal(JSON.stringify(projected), JSON.stringify(sourceCatalog));
    assert.deepEqual(
      sourceDefinedRootValue(name),
      sourceDefinedCatalogValue(name, sourceIndex[name]),
    );
    assert.equal(Object.isFrozen(typescriptCatalog), true);
    assert.equal(Object.isFrozen(sourceCatalog), true);
  }

  const unicodeCitation = (sourceModule.NTC2018_RC_CHAPTER_4_REFERENCES as Record<string, unknown>)
    .concreteDesignCompression as Record<string, unknown>;
  const typescriptUnicodeCitation = (
    typescriptSourceModule.NTC2018_RC_CHAPTER_4_REFERENCES as Record<string, unknown>
  ).concreteDesignCompression as Record<string, unknown>;
  assert.deepEqual(
    [...(typescriptUnicodeCitation.citation as string)].map((character) =>
      character.codePointAt(0),
    ),
    [...(unicodeCitation.citation as string)].map((character) => character.codePointAt(0)),
  );
});

void test("normative-reference factory and metadata errors match exactly", () => {
  const invalidUnitOptions = {
    corpusId: "structural-codes",
    corpusRevision: "revision",
    corpusStatus: "extracted",
    documentId: "ntc2018",
    unitId: "NTC2018-7.4.4",
    relation: "implements",
    citation: "ambiguous",
    href: null,
  };
  const invalidRelationOptions = {
    ...invalidUnitOptions,
    unitId: "urn:structural-codes:it:unit:ntc2018:7.4.4",
    relation: "unsupported",
  };
  assert.deepEqual(
    errorSignature(() => sourceCreateNormativeReference(invalidUnitOptions)),
    errorSignature(() => typescriptCreateNormativeReference(invalidUnitOptions)),
  );
  assert.deepEqual(
    errorSignature(() => sourceCreateNormativeReference(invalidRelationOptions)),
    errorSignature(() => typescriptCreateNormativeReference(invalidRelationOptions)),
  );

  const sourceReference = sourceModule.NTC2018_RC_CHAPTER_4_REFERENCES as Record<string, unknown>;
  const typescriptReference = TypeScriptApi.NTC2018_RC_CHAPTER_4_REFERENCES;
  const sourceMetadata = sourceWithNormativeReferences(
    {
      method: "material-design-strength",
      normativeReferences: [sourceReference.concreteDesignCompression],
    },
    [sourceReference.concreteDesignCompression as Readonly<Record<string, unknown>>],
  );
  const typescriptMetadata = typescriptWithNormativeReferences(
    {
      method: "material-design-strength",
      normativeReferences: [typescriptReference.concreteDesignCompression],
    },
    [typescriptReference.concreteDesignCompression],
  );
  assert.equal(JSON.stringify(typescriptMetadata), JSON.stringify(sourceMetadata));
  assert.notEqual(
    (typescriptMetadata.normativeReferences as unknown[])[0],
    typescriptReference.concreteDesignCompression,
  );
});
