# Sport & Fit enrichment — Skechers training taxonomy conflict reconciliation

Date: 2026-10-05  
Schema: 413

## Why this batch

Four currently sellable Skechers footwear families had a correct canonical \`sport_activity=general_training\` fact backed by exact manufacturer evidence, but the evidence layer still kept an older \`running\` classification from KONTA MOY's \`womens-running-shoes\` catalogue category active. Because conflict detection intentionally considers contradictory active evidence, those families remained in \`knowledge_status=conflict\`.

That state was conservative, but it also meant exact manufacturer training knowledge could not be used by the recommendation engine. The fix is evidence-governance reconciliation, not a new marketing-derived technical profile.

## Families covered

- Skechers Bountiful 12606-TPE
- Skechers Bountiful 12606-BBK
- Skechers Bountiful 12606-BKRG
- Skechers Skech-Air Dynamight 2.0 - New Heights 150370-BKRG

All four families had approved, merchant-visible offers at the start of this pass.

## Evidence decision

Exact Skechers pages classify/describe these models as training footwear. The Bountiful pages explicitly describe workout use and an athletic sporty training sneaker. The Dynamight source is the official Skechers training-shoes product classification.

The older KONTA MOY category observation is not deleted. Its four \`running\` evidence rows are retained as inactive history and linked through \`superseded_by\` to the exact manufacturer \`general_training\` evidence.

Source hierarchy therefore becomes deterministic:

\`exact manufacturer product classification > internal catalogue taxonomy\`

No normalized cushioning, support, width, toe-box, fit, surface or weather values are created from product copy.

## Recommendation effect

Once the stale taxonomy evidence is inactive, the four families leave evidence conflict while retaining \`general_training\` as their governed activity. The existing candidate gate treats governed activity as authoritative, so a raw title/category containing “running” cannot re-admit these shoes into a running request. They remain eligible for gym/general-training activity.

## Regression protection

Schema 413 asserts:

- all four exact identities resolve to one active canonical family;
- all four retain approved visible offers;
- each has one strong exact manufacturer \`general_training\` evidence row;
- exactly four stale internal \`running\` evidence rows are superseded;
- no governed \`running\` fact exists on the target families;
- no target remains in evidence conflict;
- resolved \`sport_activity\` work is removed from enrichment queues;
- no unsupported technical facts are introduced.

A TypeScript regression test also covers the runtime rule that authoritative \`general_training\` knowledge blocks a miscategorised “running shoe” from running candidates while keeping it eligible for gym.
