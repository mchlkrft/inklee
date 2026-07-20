# Inklee 2.0 — Country rollout order and onboarding procedure

Founder decision 2026-07-20: DACH first (Austria + Switzerland; Germany
done), then the priority list below, one country at a time. Nothing expands
automatically — every country is onboarded through the procedure and its
quality gate.

## The per-country quality gate (mandatory)

Every country registered in `packages/shared/src/seed-countries.ts` MUST
carry `qualityFixtures` in its own language(s): at least 3 real-studio
accepts and 3 beauty/PMU rejections. The shared test
`seed-country-quality-gate.test.ts` iterates the WHOLE registry, so a
country without a passing language battery fails CI — onboarding without
the quality check is structurally impossible. The operational gate on top:
always run the pilot/discovery DRY RUN and read the decision sheet before
the import run.

## Onboarding procedure (per country)

1. **Vocabulary + fixtures** — add the country to `seed-countries.ts`:
   languages, positive terms, the beauty/PMU exclusion vocabulary in the
   local language(s), postal pattern, and the quality fixtures. This is the
   step never to rush.
2. **Coverage policy** — add to `COVERAGE_POLICIES` in `seed-coverage.ts`
   (population thresholds for metro/city/town, query bundles in the local
   language(s), run budget).
3. **Geography adapter** — add to `scripts/country-geo-import.cjs`
   (official municipality identifiers + hierarchy + centroids + population;
   OpenDataSoft `georef-*` datasets and Wikidata cover most countries).
4. **Import geography** — `node scripts/country-geo-import.cjs --country=XX --post --base=https://inklee.app`
5. **Extractions** — Overture bbox for the country + `osm-tattoo-extract.cjs --country=XX`.
6. **Dry run** — coverage run (pilot or nationwide, `--mode=dry-run`),
   ingest both files, tick, review the decision sheet (accepts sane?
   beauty rejected in the local language?).
7. **Import** — same scope with `--mode=import`, re-ingest, let the
   heartbeat work. Gap searches queue behind earlier countries on the
   shared Brave budget; structured imports land immediately.

## Status

| # | Country | Code | Status |
|---|---|---|---|
| — | Germany | DE | ✅ imported 2026-07-19 (6,679 studios), gap verification running |
| — | Austria | AT | onboarding (DACH wave) |
| — | Switzerland | CH | onboarding (DACH wave) |
| — | Thailand | TH | filter config + Chiang Mai manual seed exist; full coverage waits for its list position (#10) |

## Priority order (founder, 2026-07-20; DACH excluded)

1. Germany ✅ 2. United Kingdom 3. United States 4. Spain 5. France
6. Japan 7. Netherlands 8. South Korea 9. Italy 10. Thailand
11. Australia 12. Canada 13. China 14. Sweden 15. Vietnam
16. Poland 17. Portugal 18. ~~Austria~~ (DACH) 19. ~~Switzerland~~ (DACH) 20. Denmark
21. Belgium 22. Norway 23. Czechia 24. Finland 25. New Zealand
26. Brazil 27. Mexico 28. Ireland 29. Greece 30. Indonesia
31. Croatia 32. South Africa 33. Türkiye 34. Argentina 35. Hungary
36. Romania 37. Singapore 38. Taiwan 39. Philippines 40. Malaysia
41. Estonia 42. Slovenia 43. Slovakia 44. Lithuania 45. Latvia
46. Iceland 47. Chile 48. Colombia 49. Costa Rica 50. Uruguay
51. Cyprus 52. Malta 53. Serbia 54. Bulgaria 55. Georgia
56. India 57. United Arab Emirates 58. Peru 59. Ecuador 60. Panama
61. Dominican Republic 62. Montenegro 63. Albania 64. North Macedonia 65. Bosnia and Herzegovina
66. Israel 67. Morocco 68. Ukraine 69. Russia 70. Fiji
71. Samoa 72. Mauritius 73. Jamaica 74. Lebanon 75. Jordan
76. Kazakhstan 77. Armenia 78. Azerbaijan 79. Uzbekistan 80. Sri Lanka
81. Nepal 82. Cambodia 83. Laos 84. Kenya 85. Tanzania
86. Ghana 87. Nigeria 88. Egypt 89. Tunisia 90. Saudi Arabia
91. Qatar 92. Kuwait 93. Bahrain 94. Oman 95. Guatemala
96. El Salvador 97. Paraguay 98. Bolivia 99. Namibia 100. Botswana

Notes: sanctions/legal review belongs to the onboarding step where
relevant (e.g. Russia); countries without municipal open data get a
grid-based coverage adapter instead (the schema already supports
`level='subarea'`).
