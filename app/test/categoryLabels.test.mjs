import test from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_CATEGORIES,
  APPLICATION_CATEGORY_LABELS,
  getApplicationCategoryLabel,
  ROLE_LABELS,
  getRoleLabel,
} from "../lib/types.js";

test("APPLICATION_CATEGORY_LABELS contains all standard schema categories", () => {
  for (const cat of APPLICATION_CATEGORIES) {
    assert.ok(
      APPLICATION_CATEGORY_LABELS[cat],
      `Expected APPLICATION_CATEGORY_LABELS to contain standard category: ${cat}`
    );
    assert.equal(typeof APPLICATION_CATEGORY_LABELS[cat], "string");
  }
});

test("APPLICATION_CATEGORY_LABELS maps known standard enum categories correctly", () => {
  assert.equal(APPLICATION_CATEGORY_LABELS["new_institution"], "New Institution");
  assert.equal(APPLICATION_CATEGORY_LABELS["new_program"], "New Program");
  assert.equal(APPLICATION_CATEGORY_LABELS["extension_of_approval"], "Extension of Approval");
  assert.equal(APPLICATION_CATEGORY_LABELS["increase_intake"], "Increase in Intake");
  assert.equal(APPLICATION_CATEGORY_LABELS["closure"], "Closure of Institution/Program");
  assert.equal(APPLICATION_CATEGORY_LABELS["name_change"], "Change of Name/Site");
});

test("APPLICATION_CATEGORY_LABELS handles database-persisted variants and acronyms", () => {
  assert.equal(APPLICATION_CATEGORY_LABELS["EOA"], "Extension of Approval");
  assert.equal(APPLICATION_CATEGORY_LABELS["EoA"], "Extension of Approval");
  assert.equal(APPLICATION_CATEGORY_LABELS["Extension of Approval — EoA"], "Extension of Approval");
  assert.equal(APPLICATION_CATEGORY_LABELS["Extension of Approval"], "Extension of Approval");
  assert.equal(APPLICATION_CATEGORY_LABELS["Increase in Intake"], "Increase in Intake");
  assert.equal(APPLICATION_CATEGORY_LABELS["New Institution"], "New Institution");
});

test("getApplicationCategoryLabel safely resolves known categories", () => {
  assert.equal(getApplicationCategoryLabel("extension_of_approval"), "Extension of Approval");
  assert.equal(getApplicationCategoryLabel("increase_intake"), "Increase in Intake");
  assert.equal(getApplicationCategoryLabel("EOA"), "Extension of Approval");
  assert.equal(getApplicationCategoryLabel("Extension of Approval — EoA"), "Extension of Approval");
});

test("getApplicationCategoryLabel safely handles unknown category values without throwing", () => {
  const unknown1 = "special_pilot_approval";
  assert.equal(getApplicationCategoryLabel(unknown1), "special_pilot_approval");

  const unknown2 = "Custom Category 2026";
  assert.equal(getApplicationCategoryLabel(unknown2), "Custom Category 2026");
});

test("getApplicationCategoryLabel safely handles missing, null, and undefined values", () => {
  assert.equal(getApplicationCategoryLabel(null), "Application");
  assert.equal(getApplicationCategoryLabel(undefined), "Application");
  assert.equal(getApplicationCategoryLabel(""), "Application");
});

// ─── ROLE_LABELS & getRoleLabel tests ───

test("ROLE_LABELS contains all standard AICTE role keys", () => {
  const AICTE_ROLES = [
    "regional_officer",
    "bureau_officer",
    "scrutiny_committee",
    "evc_coordinator",
    "competent_authority",
    "admin",
  ];
  for (const role of AICTE_ROLES) {
    assert.ok(ROLE_LABELS[role], `Expected ROLE_LABELS to contain role: ${role}`);
    assert.equal(typeof ROLE_LABELS[role], "string");
  }
});

test("ROLE_LABELS maps known roles correctly", () => {
  assert.equal(ROLE_LABELS["regional_officer"], "Regional Officer");
  assert.equal(ROLE_LABELS["bureau_officer"], "Bureau Officer");
  assert.equal(ROLE_LABELS["scrutiny_committee"], "Scrutiny Committee");
  assert.equal(ROLE_LABELS["evc_coordinator"], "EVC Coordinator");
  assert.equal(ROLE_LABELS["competent_authority"], "Competent Authority");
  assert.equal(ROLE_LABELS["admin"], "Administrator");
  assert.equal(ROLE_LABELS["institution"], "Institution User");
});

test("getRoleLabel safely resolves known role keys", () => {
  assert.equal(getRoleLabel("regional_officer"), "Regional Officer");
  assert.equal(getRoleLabel("bureau_officer"), "Bureau Officer");
  assert.equal(getRoleLabel("scrutiny_committee"), "Scrutiny Committee");
  assert.equal(getRoleLabel("evc_coordinator"), "EVC Coordinator");
  assert.equal(getRoleLabel("competent_authority"), "Competent Authority");
  assert.equal(getRoleLabel("admin"), "Administrator");
});

test("getRoleLabel handles unknown role values without throwing", () => {
  // Should format the role string instead of returning undefined
  const result = getRoleLabel("some_custom_role");
  assert.equal(typeof result, "string");
  assert.ok(result.length > 0, "Should return non-empty string for unknown role");
  // Should be title-cased
  assert.equal(result, "Some Custom Role");
});

test("getRoleLabel safely handles missing, null, and undefined values", () => {
  assert.equal(getRoleLabel(null), "AICTE Officer");
  assert.equal(getRoleLabel(undefined), "AICTE Officer");
  assert.equal(getRoleLabel(""), "AICTE Officer");
});
