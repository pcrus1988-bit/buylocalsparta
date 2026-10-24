import test from "node:test";
import assert from "node:assert/strict";
import {
  categorizeResearchFreeText,
  normalizeResearchFreeText,
  RESEARCH_FREE_TEXT_CATEGORIES
} from "./research-free-text-categories.ts";

test("Greek accents/case do not hide operating-cost themes", () => {
  assert.equal(normalizeResearchFreeText("ΦΟΡΟΛΟΓΊΑ"), "φορολογια");
  assert.ok(categorizeResearchFreeText("Υψηλή ΦΟΡΟΛΟΓΊΑ και ενοίκια").includes("costs"));
});

test("multiple themes are recorded without dropping the original answer", () => {
  const categories = categorizeResearchFreeText("Μεγάλα κόστη και έλλειψη προσωπικού, αδύναμες πωλήσεις");
  assert.ok(categories.includes("costs"));
  assert.ok(categories.includes("staff"));
  assert.ok(categories.includes("demand"));
});

test("every string including unmatched or very short text has a visible category", () => {
  for (const answer of ["Δεν ξέρω", "—", "κ", "", "μία περίεργη διατύπωση"]) {
    assert.deepEqual(categorizeResearchFreeText(answer), ["other"]);
  }
});

test("SQL regexes have safe fixed source and valid Javascript equivalents", () => {
  const keys = new Set();
  for (const c of RESEARCH_FREE_TEXT_CATEGORIES) {
    assert.match(c.key, /^[a-z_]+$/);
    assert.doesNotMatch(c.pattern, /['\\]/);
    assert.doesNotThrow(() => new RegExp(c.pattern, "u"));
    assert.equal(keys.has(c.key), false);
    keys.add(c.key);
  }
});

test("tax, energy, rent and survival are separately discoverable", () => {
  const tags = categorizeResearchFreeText("Θέλω να μπορώ να πάρω κι εγώ έναν μισθό. Το ρεύμα, το ενοίκιο και ο ΦΠΑ με πιέζουν.");
  for (const tag of ["survival", "energy", "rent", "taxes"]) assert.ok(tags.includes(tag), tag);
});

test("tourism, local cooperation and safety are included", () => {
  assert.ok(categorizeResearchFreeText("Στη σεζόν έχουμε τουρίστες").includes("tourism"));
  assert.ok(categorizeResearchFreeText("Χρειάζονται συνεργασίες μεταξύ μικρών επιχειρήσεων").includes("cooperation"));
  assert.ok(categorizeResearchFreeText("Οι κλοπές στα καταστήματα είναι πρόβλημα").includes("safety"));
});

test("the taxonomy does not infer a theme for an unrecognized sentence", () => {
  assert.deepEqual(categorizeResearchFreeText("Μια σκέψη που δεν έχει συγκεκριμένη θεματολογία"), ["other"]);
});
