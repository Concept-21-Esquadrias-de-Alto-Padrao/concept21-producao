# Pointing queue timeout — 22 October 2026

The lifecycle release `fc91793` introduced a regression in `/pointing`: the
queue could show its load-failure message even though operational records were
present. Vercel reported SQLSTATE `57014` (`canceling statement due to statement
timeout`). Native PostgreSQL logs located repeated calls through
`production_lifecycle_private.prod_visible`, `contract_visible`, `is_admin`
and the current-session helpers.

The new restrictive archive policies evaluated these predicates for each row.
The queue reads several larger relations concurrently, amplifying the repeated
session and parent lookups beyond the authenticated role's existing 8-second
statement timeout. The original release checks did not cover the complete live
bulk pointing route, so they missed this regression.

## Production correction

Applied to the official Concept A database `loqmvdiegizwmpzjthhm` as
`20261022131555 optimize_lifecycle_archive_reads`, at 10:15:55 Brasília time.
The source migration is
`supabase/migrations/20261022131052_optimize_lifecycle_archive_reads.sql`.

Two private, stable SQL helpers compute the visible contract and PROD IDs.
They materialize the session context once and preserve the existing company,
parent-link and archive predicates, including administrator archive consultation.
The 17 restrictive archive policies use uncorrelated membership subqueries so
the scope is calculated once per statement. Session-only checks in the five
lifecycle allow policies also use initPlans.

The helpers have an empty search path and are security definers in the existing
private, non-exposed schema. Anonymous execution is revoked. The existing
permissive policies, mutation checks, RLS, operational statuses and role
assignments remain in effect. The authenticated statement timeout was not raised.

## Evidence

Native PostgreSQL measurements used the authenticated role, the relevant JWT
identity context, an 8-second statement timeout and read-only transactions.
These are individual server execution measurements, not end-to-end page latency
or a load-test percentile.

| Read | Before | After |
| --- | ---: | ---: |
| Administrator: 500 stage time-entry IDs, ordered | 2,726.426 ms | 74.878 ms |
| Shared buffer hits for that query | 49,585 | 1,657 |
| Administrator: 500 piece-stage rows with archive embed | Not measured | 38.009 ms |
| Coordinator: 500 piece-stage rows | Not measured | 24.660 ms |
| Operator: 500 piece-stage rows | Not measured | 29.528 ms |

The live production browser session as Administrator loaded `/pointing` after
the correction, including filters, all stage counts and the actual Usinagem
queue groups. No real piece was started, paused or completed during verification.
Coordinator and Operator checks were SQL identity simulations, not browser sign-ins.

All 56 isolated SQL/PGlite scenarios passed, including equivalence with the old
visibility predicates, company isolation, anonymous denial, archive hiding and
an analyzed query-plan assertion that the visible scope runs once per statement.
All 51 JavaScript tests and lint passed. No frontend code changed.

Production checks retained 76 PRODs, 297 piece rows, 1,485 piece-stage rows,
2,903 time entries, 8 user-role links and 156 role-permission links. The migration
contains no operational data updates. All 17 restrictive archive policies remain.

## Reversal and limits

`docs/lifecycle-archive-read-rollback.sql` restores the 22 prior policy predicates
and revokes execution of the new helpers. It preserves operational data but also
restores the expensive read behavior, so it is an emergency technical reversal.
Do not remove or replay the original lifecycle migration to reverse this fix.

Full production write flows through Auth/PostgREST, native concurrent writes and
imports remain outside this read-regression verification. Historical security
findings remain separate; this correction does not certify their resolution.
