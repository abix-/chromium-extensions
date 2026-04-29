# Reddit undisclosed shilling - implementation plan

Status: DRAFT for review. Nothing in this plan has been executed yet. Companion to `reddit-undisclosed-shilling.md`, which is the research artifact this plan operationalizes.

## Goal

Detect undisclosed shill posts on Reddit, specifically the two subtypes documented in the research doc:

- **Subtype A (outrage-shape)**: shill content packaged as controversial / shocking / political-bait video; triggers Reddit's `is-not-brand-safe` classifier; lives in generic-interest subs. Sample 1 profile.
- **Subtype B (wholesome-shape)**: shill content packaged as feel-good reaction-to-a-product video; does NOT trigger the brand-safety classifier; lives in feel-good subs. Sample 3 profile.

Both subtypes are distinct from the disclosed-commercial content already covered by the existing rules in `reddit.md`.

## Phases at a glance

| Phase | Engine work | Time estimate | Reversibility | Value | Risk |
|---|---|---|---|---|---|
| 0. Validate | None | parallel/ongoing | trivial | calibration | none |
| 1. Ship Subtype A | None (config only) | ~15 min | trivial (delete entry) | high | low |
| 2. Ship Subtype B | None (config only) | ~30 min | trivial | high | medium FP risk |
| 3. Author-regex prepass | Small | 2-4 hrs | medium | medium | low |
| 4. Adopt uBO procedural syntax | Medium | 1-2 days | hard | high (long-term) | medium |
| 5. Tier-B account enrichment | Medium-large | 2-3 days | medium | medium-high | high (privacy) |
| 6. Behavioral suggestion engine | Large | 1+ weeks | medium | speculative | medium |

Recommended order: ship 1+2 today, gate 3+ on observed precision/recall.

---

## Phase 0: Validate (parallel, ongoing)

Continue capturing samples whenever the user spots a probable shill. For each capture record:

- The four anchor DOM attributes: `is-not-brand-safe` (presence), `post-type`, `icon` (full URL), `domain`
- Title verbatim (feeds the substring list directly)
- Subreddit
- Subjective shill / not-shill verdict

Format: append to `reddit-undisclosed-shilling.md` as Sample N entries (numbered) following the existing template.

This is parallel work, not a blocker on Phase 1+2 shipping. If anything, Phase 1+2 ship + observation IS Phase 0 in practice.

---

## Phase 1: Ship Subtype A (config only)

### Deliverable

Two new entries in `sites.json` under the existing `reddit.com` -> `remove` array, alongside the existing `is-post-commercial-communication` rule:

```json
"reddit.com": {
  "remove": [
    "...existing entries...",
    { "value": "shreddit-post[is-not-brand-safe][post-type=\"video\"][icon*=\"/snoovatar/avatars/\"]" },
    { "value": "article[data-post-id]:has(shreddit-post[is-not-brand-safe][post-type=\"video\"][icon*=\"/snoovatar/avatars/\"])" }
  ]
}
```

### Rationale

- `[is-not-brand-safe]` - subtype gate, narrows to advertiser-unsafe content (gambling, NSFW, news politics, controversy, viral edgy)
- `[post-type="video"]` - shill format observed in our captures
- `[icon*="/snoovatar/avatars/"]` - default snoovatar (low-effort account)

The two entries cover both the new-Reddit `<shreddit-post>` selector and the `article` wrapper variant, matching the convention already used by the existing rule at `sites.json:24`.

### Acceptance check

Load reddit, scroll the home feed for 10-20 minutes. Expected behavior:

- Posts disappear when all four clauses fire
- No real wholesome content disappears (it lacks `[is-not-brand-safe]`)
- Some real outrage content (war, politics, controversy posted by default-snoovatar accounts) MAY disappear - estimate the rate

### Rollback

Delete the two entries from `sites.json`.

### Tightening options if FP rate too high

In order of escalation:

1. Add `[domain="v.redd.it"]` as a fifth clause (excludes self-posts, link posts to news)
2. Add `[view-context="AggregateFeed"]` clause (only fires on home-feed insertions, not subreddit pages where you opted in)
3. Add a subreddit allowlist: `:not([subreddit-name="worldnews"]):not([subreddit-name="politics"])` etc.
4. Add news-domain whitelist: `:not(:has(a[href*="apnews.com"]))` etc.

### Files touched

- `sites.json`

### Files NOT touched

- No JS, no Rust, no rebuild needed
- No manifest changes

---

## Phase 2: Ship Subtype B (config only)

### Deliverable

One additional entry in the same `sites.json` `remove` array:

```json
{ "value": "shreddit-post:not([is-not-brand-safe])[post-type=\"video\"][domain=\"v.redd.it\"][icon*=\"/snoovatar/avatars/\"]:is([post-title*=\"excited about\"], [post-title*=\"reaction to\"], [post-title*=\"worth every\"], [post-title*=\"changed my life\"], [post-title*=\"i tried\"], [post-title*=\"i can't believe\"])" }
```

### Rationale

- `:not([is-not-brand-safe])` - subtype gate (excludes outrage content, leaves wholesome content)
- `[post-type="video"]`, `[domain="v.redd.it"]`, `[icon*="/snoovatar/avatars/"]` - same shill-shape core as Subtype A
- `:is([post-title*="..."], ...)` - title contains a recognized reaction-template substring; this is the discriminator vs real wholesome posts

### Acceptance check

Load reddit, scroll feel-good subs (r/MadeMeSmile, r/aww, r/wholesomememes, r/oddlysatisfying). Expected behavior:

- Reaction-bait posts disappear when title matches one of the substrings AND structural clauses fire
- Real wholesome posts NOT matching the title substrings remain visible

False-positive risk to watch for:

- "Reaction to my daughter's first steps" matches `[post-title*="reaction to"]` - would fire incorrectly
- "I tried this recipe and it was amazing" matches `[post-title*="i tried"]` - would fire on legitimate cooking posts
- Tune the substring list narrower if FPs cluster on a specific phrase

### Rollback

Delete the entry. Or shorten the title-substring list if specific phrases over-fire.

### Tightening options

1. Narrow phrases ("excited about his" rather than "excited about")
2. Remove the most generic substrings ("i tried", "i can't believe") - keep only the strongly product-shaped ones
3. Wait for Phase 4 (uBO syntax) to use regex with anchored patterns

### Files touched

- `sites.json` only

---

## Phase 3: Author-regex prepass (small engine work)

### Problem

CSS attribute selectors do prefix / suffix / substring on `author=` but not regex. The auto-suggested-username patterns from AstroGuard (validated against our captured shills) are regex shapes:

- `^[A-Z][a-z]+-[A-Z][a-z]+-\d{3,}$` (hyphenated default form)
- `^[a-z]{2,8}\d{3,}$` (random-ish lowercase + digits)
- `^[A-Za-z]+_[A-Za-z]+\d{2,}$` (underscore form, matches `Awkward_Lunch8016` and `FewCollar227`)

### Implementation

Synthetic-attribute prepass technique:

1. In `content.js` (or `mainworld.js`), on each `<shreddit-post>` insertion via existing MutationObserver:
2. Read `author` attribute
3. Match against the three regexes
4. If any matches, set `data-hush-author-pattern="auto"` on the same element

After the prepass, vanilla CSS rules can key off the synthetic attribute:

```json
{ "value": "shreddit-post[data-hush-author-pattern=\"auto\"][post-type=\"video\"][icon*=\"/snoovatar/avatars/\"]" }
```

### Why this shape

Avoids inventing a new rule format. The synthetic attribute is queryable by vanilla CSS, so users compose it into stacked rules just like any other clause. Reuses the existing engine path. Same trick adblockers use for `:upward(N)` synthesis on awkward DOMs.

### Files touched

- `content.js` - add prepass
- Possibly `popup.js` - configuration UI to toggle/customize patterns
- `sites.json` - default rules using the synthetic attribute (optional)

### Files NOT touched

- No Rust changes (the regex eval happens in JS)
- No new permissions

### Risk

Low. The prepass writes one attribute per matching post. If misfires, just stop using the attribute in rules. Performance bounded by post count visible at any time.

---

## Phase 4: Adopt uBO procedural cosmetic filter syntax (medium engine work)

### Problem

Cleanly express the things vanilla CSS cannot:

- Title regex matching (sharper than substrings)
- Author regex matching (replaces Phase 3's synthetic-attribute hack)
- Subreddit regex matching
- Text-content matching on body / comment / nested elements
- Conditional removal based on descendant text

### Implementation

Adopt uBlock Origin's procedural cosmetic filter syntax. Reference: https://github.com/gorhill/uBlock/wiki/Procedural-cosmetic-filters

Operators to support, in priority order:

1. `:has-text(...)` - regex or substring on text content
2. `:matches-attr(...)` - regex on attribute name or value
3. `:upward(N)` - traverse to ancestor

The full uBO list is bigger but these three cover ~90% of observed real-world filter-list patterns.

### Architecture

Selector parser splits a rule string into:

- Vanilla CSS prefix (passed to `document.querySelectorAll` as today)
- Procedural operator suffix (evaluated in JS against each candidate)

Bonus side-effect: existing uBO filter-list rules become directly portable into Hush.

### Files touched

- Hush's selector evaluation engine (Rust if compiled to WASM, JS if at the dist/pkg layer)
- Rule schema documentation in `architecture.md`

### Risk

Medium. The parser has to handle quoting, escapes, and nested selectors correctly. uBO's regex evaluation has well-known performance pitfalls on large pages - need to cap regex evaluation count per frame.

### Migration

Phase 3's synthetic-attribute hack can be deprecated once Phase 4 lands - regex on `author` becomes `:matches-attr(author=/regex/)`.

---

## Phase 5: Tier-B account enrichment (medium-large engine work)

### Problem

Distinguishes shill from real-new-user wholesome content via account-age + karma-rate signals that are NOT in the post DOM. The killer signal: karma-per-day. See research doc S8 and the "DOM-only vs account-enriched" section.

### Implementation

New rule type in config: `enrich`. Shape:

```json
"enrich": [
  {
    "candidate": "shreddit-post[post-type=\"video\"][icon*=\"/snoovatar/avatars/\"]:not([is-not-brand-safe])",
    "fetch": "/user/{author}/about.json",
    "predicate": "karmaPerDay > 100 || ageDays < 14",
    "action": "remove"
  }
]
```

Runtime behavior:

1. Match candidates against the CSS selector (cheap, vanilla path)
2. For each candidate, extract `author` attribute, fetch the JSON endpoint
3. Cache by author with 1-hour TTL
4. Evaluate the predicate against parsed JSON
5. If true, apply the action (remove/hide)

### Predicate vocabulary

Helpers exposed to the predicate language:

- `ageDays` - Math.floor((Date.now() - data.created_utc * 1000) / 86400000)
- `karmaTotal` - data.link_karma + data.comment_karma
- `karmaPerDay` - karmaTotal / max(ageDays, 1)
- `verifiedEmail` - !!data.has_verified_email
- `bioEmpty` - !data.subreddit?.public_description?.trim()
- `karmaImbalance` - max(link_karma, comment_karma) / karmaTotal

### Privacy and UX

- Each fetch is observable to reddit (the fetch hits reddit.com endpoints, reddit knows the user is interested in that profile)
- Add an explicit per-site toggle in the popup: "Account enrichment: off / candidates only / always"
- Default: OFF. Phase 5 must be explicitly enabled by the user.
- Never fetch on the user's own profile page (obvious privacy regression)
- Never fetch authors that aren't on the current page
- Display a privacy notice when enabled

### Rate limiting

- Cap fetches per page at N (default 10) to avoid runaway behavior on 1000+ comment threads
- Exponential backoff on 429 with cap at 60s
- Use the user's session cookie for the higher rate limit (anonymous fetch from a content script does this automatically)

### Files touched

- Rule loader (parse `enrich` rule type)
- Content script (orchestrate fetch + predicate eval)
- Background service worker (if cross-origin fetches need it)
- `popup.html`/`popup.js` (privacy toggle)
- `architecture.md` (document the new rule type)

### Risk

High in the privacy dimension. Every previous Hush rule was zero-network; Phase 5 introduces network-observable user behavior. Must be opt-in, must be documented, must default OFF.

Medium in the engineering dimension. Async evaluation breaks Hush's current synchronous-rule assumption. Race conditions to handle:

- Post hidden synchronously by another rule before fetch returns
- Post leaves DOM before fetch returns (user scrolled away)
- Author no longer exists (404) - cache the negative result

---

## Phase 6: Behavioral suggestion engine (speculative)

### Problem

Auto-propose new shill rules based on observed feed patterns, similar to Hush's existing `sendBeacon` target detector.

### Implementation sketch

- Classifier in content script tags each post with weighted scores from the candidate signals (S1-S8)
- When a cluster of high-scoring posts shares a stable selector pattern, surface as a suggestion in the popup
- User accepts -> rule added to user's local rule list

### Status

Out of scope for the current push. Park as roadmap item if S6 (multi-signal scoring pass) ever ships.

---

## Recommended execution order

Day 1:

1. Phase 1 - Subtype A config edit (15 min)
2. Phase 2 - Subtype B config edit (30 min)
3. Reload extension, watch the feed for an hour, note any obvious FPs

Days 2-7:

4. Phase 0 - capture more samples organically while using reddit normally
5. Tune title-substring list in Subtype B based on observed FPs/FNs
6. Decide whether Phase 3 is needed (only if Subtype B FP rate is intolerable)

Week 2+:

7. If Phase 3 lands well -> Phase 4 (uBO syntax adoption) becomes the right "real filter engine" investment
8. Phase 5 (Tier-B enrichment) ONLY if Phase 4 is shipping AND Subtype B precision is still inadequate
9. Phase 6 stays parked

### Stop conditions

- After Phase 1+2: if FP rate is under ~5 percent and shills are getting caught, stop. Done. Iterate the rules over time.
- After Phase 3: same. Most users do not need engine extensions.
- After Phase 4: only proceed to Phase 5 if there is a clear unmet user need that account enrichment uniquely solves.

## Open questions

- What is acceptable FP rate for the user's tolerance? 1 percent? 5 percent? Higher?
- Does the user want Subtype A and Subtype B as separate toggleable rules, or one merged rule?
- Should there be a per-subreddit override mechanism so the user can disable shill rules in subs they trust?
- For Phase 5: is the privacy regression worth the precision gain, given that Subtype B with title substrings might already be precise enough?
- Does the existing Hush behavioral-suggestion infrastructure (referenced in `reddit.md`) provide a path toward Phase 6 with less work than starting from scratch?

## Decision points

Before starting any phase, the user should explicitly say "go on Phase N." Phases 1+2 are low-cost enough that they can be batched as one decision. Phases 3+ are larger commitments and warrant individual review.

## References

- `docs/reddit-undisclosed-shilling.md` - research artifact this plan operationalizes
- `docs/reddit.md` - existing shipped rules (the integration neighbors)
- `docs/architecture.md` - current rule shape and engine constraints
- `sites.json` - the integration point for Phases 1, 2
- gorhill/uBlock Procedural cosmetic filters wiki - Phase 4 spec reference
