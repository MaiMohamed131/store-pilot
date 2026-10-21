# Verification record

## Standalone demo catalog/order import

The insert-only importer added **40 products in five categories and 240 orders over approximately 90 days** to the existing standalone MongoDB server. It verified every pre-existing document by BSON fingerprint: the admin and two sessions remained unchanged. No user, shop, guard, or existing inventory record was overwritten. No MongoDB instance was started, installed, downloaded, or reconfigured.

New prices and totals use integer minor units; item snapshots and shipping reconcile to order totals. Paid, non-cancelled demo revenue totals **2,656,775 minor units**. Products hold closing inventory reflecting the historical import, including out-of-stock and low-stock examples. The importer does not decrement inventory when inserting historical orders. Reserved IDs and `DEMO-SP-*` keys allow missing inserts to resume without resetting existing edits. Local fingerprint receipts remain under `.cache/demo-seed` on I:.

A second live import inserted **zero products and zero orders**, verified all **283 existing documents unchanged**, and retained exactly 40 demo products, 240 demo orders, and one user. Read-only verification of the real analytics service reconciled revenue and daily chart totals to stored orders, reconciled status counts to 240 orders, and found five categories, five top products, and five low-stock alerts. Revenue-eligible order count is 208; rounded average order value is 12,773 minor units for the full imported period.

**19 backend tests and 8 frontend tests passed (27 total)**, including four demo plan tests for deterministic reruns, date/status diversity, snapshot preservation, exact money/revenue/inventory reconciliation, and rejecting invalid totals. Server compilation and ESLint passed. Standalone import/resume is not a multi-document transaction; partial inserted batches are completed by rerunning, without rollback deletes or changes to pre-existing data.

## Login CSRF fix

The development frontend now uses fixed `http://localhost:5173`; the API explicitly allows localhost/IPv4/IPv6 loopback aliases only on the configured development scheme/port. Production origin matching remains exact. CSRF failures distinguish rejected origins from stale/missing tokens, and the client refreshes a stale token and retries only once. Cookie/header verification remains required.

Verified: **15 backend tests and 8 frontend tests passed (23 total)**, both production builds passed, and ESLint passed. Tests cover valid loopback cookie/header requests, foreign/wrong-port origins, strict production origin matching, stale-token recovery, and retry limits. No separate MongoDB server or binary download was used.

A read-only check found zero users in `storepilot` and no matching configured admin. `.env` seed variables do not create accounts. The insert-only `create-local-admin.ts` helper is prepared but has not been executed; account creation requires the user's approval under the existing no-database-changes constraint.

## Existing standalone server startup fix

The connect-only runner was verified against the user's existing manually started MongoDB 8.2.2 standalone server at 127.0.0.1:27017. API `/api/v1/health`, Vite `/`, and the frontend's `/api/v1/health` proxy returned HTTP 200. Read-only collection/index metadata snapshots before and after startup matched (zero `storepilot` collections); startup did not provision accounts or seed data. No MongoDB binary was downloaded, installed, or launched, and no server configuration or existing data was modified. Both production builds and ESLint passed. The 10 standalone regression tests pass using mocked database calls: topology detection, transaction rejection before writes, single-document token rotation/replay revocation, and atomic fulfillment/history updates. The full isolated-replica-set API suite below is historical and was not rerun for this fix because no separate MongoDB instance was authorized. Default `npm test` now runs standalone regression tests and frontend tests only; the isolated database suite is an explicit `test:integration` opt-in.

## Original replica-set application verification (historical)

Verified locally on 2026-10-20 with Node 22.18.0 on Windows.

| Check                                     | Actual result                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Backend Vitest/Supertest                  | **19 passed**, running a real isolated MongoDB 8.2.2 replica set                                                            |
| Frontend Vitest/Testing Library           | **5 passed**, using jsdom                                                                                                   |
| Server TypeScript build                   | Passed                                                                                                                      |
| Client TypeScript + Vite production build | Passed                                                                                                                      |
| ESLint                                    | Passed                                                                                                                      |
| npm dependency audit after Vitest upgrade | **0 vulnerabilities** reported                                                                                              |
| Repeatable seed                           | Passed: 3 seeded accounts, 40 products, 240 orders; repeat run preserves counts, stock, and totals                          |
| Local browser                             | Admin login, live dashboard, SKU search, order detail snapshots and permitted status actions verified                       |
| Responsive UI                             | Desktop and mobile breakpoints inspected; mobile drawer navigation verified; no document-level horizontal overflow observed |

Backend tests cover successful/generic-invalid login, HttpOnly cookies, protected endpoints, CSRF/foreign-origin rejection, stable CSRF tokens across tabs, staff permissions, refresh rotation and replay revocation (including concurrent replay), last-admin protection, integer money/input validation, stored product changes and server filters, order-transition rules, actor history, no repeated stock deduction, transactional cancellation and one-time stock restoration, MongoDB revenue aggregation and missing date buckets, archiving/history preservation, exact totals, revenue eligibility, and seed consistency/repeatability.

Frontend tests cover login validation, unauthenticated route redirection, product validation and minor-unit conversion, confirmed staff fulfillment actions, and terminal-status behavior. These are focused automated tests, not exhaustive browser end-to-end coverage of every form.

The initial runs exposed an accessible-label issue and the default MongoDB cache location; both were corrected before successful verification. The MongoDB binary was discovered in the existing installation on I:. No additional MongoDB binary was downloaded. Tests launch a separate loopback replica set and retain its files under `.cache/test-tmp`. The local demo uses `.cache/local-mongo` and `.cache/local-tmp`. No existing MongoDB database or installed server configuration was modified.

The production build emits non-failing Rollup annotation warnings from Zod. The frontend is split into separate framework, forms, and chart bundles. Deployment, production proxy configuration, backup restoration, and external payment behavior have not been tested or performed.

Screenshots under `docs/screenshots` show the actual seeded application, not placeholder metrics.
