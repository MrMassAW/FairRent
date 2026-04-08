# Canadian rental data references

**FairRent** keeps the canonical URL list in the application so it stays in sync with the admin seed and link checks.

- **In-app Sources page** (authoritative list, grouped): open the app at `/sources` or see [`src/lib/sourcesRegistry.ts`](../src/lib/sourcesRegistry.ts).
- **Verify links locally:** `npm run verify:sources` (HEAD/GET reachability for every registered URL).

## Weekly automation (concept)

The pipeline is implemented in:

- [`scripts/weekly-update.ts`](../scripts/weekly-update.ts) — generates `public/data/historical-rents-db.json` and HEAD/GET-checks every URL from `getAllVerificationUrls()` (same registry as `verify:sources`).
- Admin **Refresh** — writes monthly history to IndexedDB (`rents_by_cma`, `guidelines`, etc.).

Do not duplicate long URL lists here; update `sourcesRegistry.ts` once and regenerate or redeploy.
