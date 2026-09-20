import assert from "node:assert/strict";
import test from "node:test";
import { publicDescriptionText } from "./public-description-text.ts";

test("strips tags whose quoted attributes contain greater-than characters", () => {
  const source = '<section class="[&:has([data-writing-block])>*]:pointer-events-auto" data-turn="assistant"><div data-message-author-role="assistant"><p>Clean copy<br />Second line</p></div></section>';
  assert.equal(publicDescriptionText(source), "Clean copy\nSecond line");
});

test("keeps only the final assistant turn from copied conversation markup", () => {
  const source = '<section data-turn="user"><div>Ignore user prompt</div></section><section data-turn="assistant"><div data-message-author-role="assistant"><p>First answer</p></div></section><section data-turn="user"><div>Ignore follow-up</div></section><section data-turn="assistant"><div data-message-author-role="assistant"><p>Wanted description<br />Model: Chelsea</p></div></section>';
  assert.equal(publicDescriptionText(source), "Wanted description\nModel: Chelsea");
});

test("preserves ordinary supplier HTML as readable plain text", () => {
  const source = '<p>Leather boots<br>Made in Italy</p><ul><li>Black</li><li>Calf leather</li></ul>';
  assert.equal(publicDescriptionText(source), "Leather boots\nMade in Italy\n\n• Black\n\n• Calf leather");
});
