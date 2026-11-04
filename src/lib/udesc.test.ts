import { test } from "node:test";
import assert from "node:assert/strict";
import { isUdesc, udescAsked, uniFor, OTHER_UNI } from "./udesc";

test("modo UDESC pelo campo Universidade", () => {
  assert.equal(udescAsked({ university: "" }), false);
  assert.equal(udescAsked({ university: "  " }), false);
  assert.equal(udescAsked(null), false);
  assert.equal(isUdesc({ university: "UDESC" }), true);
  assert.equal(isUdesc({ university: "udesc - Joinville" }), true);
  assert.equal(isUdesc({ university: "UFSC" }), false);
  assert.equal(isUdesc({ university: "" }), false);
});

test("ligar e desligar o modo", () => {
  assert.equal(uniFor(true, "UFSC"), "UDESC");
  assert.equal(uniFor(false, "UDESC"), OTHER_UNI);
  assert.equal(uniFor(false, "UDESC", "UFPR"), "UFPR");
  assert.equal(uniFor(false, "UFSC"), "UFSC");
  assert.equal(uniFor(false, ""), OTHER_UNI);
});
