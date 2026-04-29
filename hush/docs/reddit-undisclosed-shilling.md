# Reddit undisclosed shilling - research in progress

Status: open investigation. Hypotheses below have not been validated across enough samples to ship a rule. Do NOT paste any of these selectors into config until the verification steps at the bottom are completed.

## Problem statement

The existing rules in `reddit.md` cover Reddit's officially-tagged commercial content:

- Promoted posts (Reddit's paid ad surface) - hits `is-post-commercial-communication`
- Brand Affiliate posts (creators with declared paid relationships) - hits `<shreddit-brand-affiliate-tag>`

Both of those are disclosed. Reddit tells you "this is an ad" by setting an attribute or rendering a tag. Hush's existing rules just match on those.

Undisclosed shilling is a different category. It is content posted by accounts that are paid to promote a product, service, or narrative without any disclosure that triggers Reddit's commercial classification. Common forms:

- "Reaction" videos to a product, posted with vague clickbait titles
- Engagement-bait posts that mention a brand offhand in the comments
- Cross-posted content under rotating throwaway accounts, all driving toward the same destination

Reddit's own systems don't tag these (or tag them inconsistently). Curated filter lists can't catch them (no third-party tracker domain, no ad framework). Human pattern recognition catches them; the engineering question is which of those human cues are actually encoded in the DOM.

## Sample 1 (captured 2026-04-29)

Post permalink: `/r/interestingasfuck/comments/1sz157v/it_was_worth_every_penny/`

User-flagged signals (subjective):

- Vague clickbait title with no content description ("It was worth every penny")
- Reaction-style video, product implied as the subject
- Posted to a high-traffic generic-interest sub
- Account name follows Reddit's auto-suggested format

Attributes on the `<shreddit-post>` element, deduped to ones potentially useful as filter inputs:

| Attribute | Value | Notes |
|---|---|---|
| `is-not-brand-safe` | "" (presence-only) | Reddit's internal advertiser-unsafe classifier |
| `domain` | `v.redd.it` | Reddit-hosted video, no third-party host to block |
| `post-type` | `video` | |
| `view-context` | `AggregateFeed` | Showing in home/popular feed, not subscribed sub |
| `subreddit-prefixed-name` | `r/interestingasfuck` | |
| `author` | `Awkward_Lunch8016` | Matches Reddit's auto-suggested `Adjective_Noun4digits` format |
| `score` | 668 | |
| `comment-count` | 147 | |
| `created-timestamp` | 2026-04-29T14:54:05 | Post was 3 hours old at capture |

The full outerHTML is not preserved here (large, contains user-specific viewer IDs). Re-capture by inspecting any flagged post if needed.

## Sample 2 (captured 2026-04-29) - control case, NOT a shill

Post permalink: `/r/lazerpig/comments/1syyihe/who_is_ready_for_another_hilarious_may_day_parade/`

Why this sample matters: it carries `is-not-brand-safe` (the same flag as Sample 1) but is genuinely legitimate political/military commentary content, not undisclosed shilling. It validates the false-positive risk predicted in S1 and serves as the control for identifying which OTHER attributes discriminate shill from real.

Subjective read: real user, not a shill. Sub-native sarcastic political content for a known niche YouTuber community (`r/lazerpig`), links to mainstream journalism (Associated Press), small organic-feeling engagement.

Attributes on the `<shreddit-post>` element:

| Attribute | Value | Notes |
|---|---|---|
| `is-not-brand-safe` | "" (presence-only) | Same as Sample 1. Triggered by political/war content, not by shilling. |
| `domain` | `self.lazerpig` | Self-post, not external media |
| `post-type` | `multi_media` | NOT `video` like Sample 1 |
| `view-context` | `AggregateFeed` | Same as Sample 1 |
| `subreddit-prefixed-name` | `r/lazerpig` | Niche topical sub (NOT generic-interest like Sample 1) |
| `author` | `Bionic_Redhead` | Personalized name (does NOT match `Adjective_Noun####`) |
| `author-id` | `t2_d761nbli` | |
| `score` | 57 | |
| `comment-count` | 8 | |
| `icon` | `https://styles.redditmedia.com/t5_6y9lox/styles/profileIcon_...` | CUSTOM-uploaded profile icon (see S7) |
| Body content | Self-post linking to `apnews.com` | Real commentary with outbound link to mainstream news |

## Sample 3 (captured 2026-04-29) - probable wholesome-shape shill

Post permalink: `/r/MadeMeSmile/comments/1syyen2/a_man_excited_about_his_iron_man_helmet_and_hand/`

Why this sample matters: it carries NONE of the `is-not-brand-safe` flag (unlike Samples 1 and 2) but the user has classified it as a shill, and the structural signals (default snoovatar, auto-suggested username, bare video on platform CDN, generic feel-good sub) match Sample 1 cleanly. This is a SECOND shill subtype - "wholesome reaction to a product" - that does not trigger Reddit's brand-safety classifier because such content is advertiser-friendly, not advertiser-hostile. The proposed stacked-AND rule with `[is-not-brand-safe]` as a required clause would have FAILED to catch this post.

Subjective read: probable shill, classic reaction-bait shape. The title "A man excited about his Iron man helmet and hand" matches the user's first-message description of the problem ("reaction bullshit about some dumb product") - a man, an emotion, a brand-name licensed product. Iron Man helmet/hand replicas are a known Hasbro/Marvel cosplay product line and a common dropshipping vehicle. The user downvoted the post (visible in the DOM as `vote-type="downvote"`).

Capture context: the user encountered this post via their own profile activity feed (`view-context="ProfileFeed2"`, referrer `/user/abix-/`) - they were reviewing posts they had previously voted on. The original encounter would have been in some feed surface, likely the home feed.

Attributes on the `<shreddit-post>` element:

| Attribute | Value | Notes |
|---|---|---|
| `is-not-brand-safe` | NOT PRESENT | Wholesome reaction is brand-safe in advertiser terms - flag does not fire |
| `domain` | `v.redd.it` | Platform-CDN video, same as Sample 1 |
| `post-type` | `video` | Same as Sample 1 |
| `view-context` | `ProfileFeed2` | Capture surface, not original feed surface |
| `subreddit-prefixed-name` | `r/MadeMeSmile` | Generic feel-good sub, ~12M subs |
| `author` | `FewCollar227` | Auto-suggested `Adjective_Noun####` pattern |
| `author-id` | `t2_fapl1ql9` | |
| `score` | 2650 | |
| `comment-count` | 259 | |
| Upvote ratio | 0.876 | Higher than Sample 1's 0.737; engagement looks healthy on its face |
| `icon` | `https://preview.redd.it/snoovatar/avatars/bf3b2450-...` | DEFAULT snoovatar - same path family as Sample 1 |
| `vote-type` | `downvote` | Viewer's own prior vote on this post |
| `award-count` | 4 | Awards given (`award-id="award_hooray_3"`) |
| Body | bare video | No text body, no outbound links |

## Sample comparison (3-way)

| Aspect | Sample 1 (outrage-shape shill) | Sample 2 (real, control) | Sample 3 (wholesome-shape shill) |
|---|---|---|---|
| `is-not-brand-safe` | present | present | **NOT PRESENT** |
| `view-context` | AggregateFeed | AggregateFeed | ProfileFeed2 |
| `post-type` | video | multi_media | video |
| `domain` | v.redd.it | self.lazerpig | v.redd.it |
| Subreddit | r/interestingasfuck | r/lazerpig | r/MadeMeSmile |
| Author username | Awkward_Lunch8016 (auto) | Bionic_Redhead (custom) | FewCollar227 (auto) |
| Profile icon path | `/snoovatar/avatars/` | `/styles/profileIcon_` | `/snoovatar/avatars/` |
| Body | bare video | self-post + apnews link | bare video |
| Score / upvote ratio | 668 / 0.737 | 57 / unknown | 2650 / 0.876 |
| Title shape | clickbait ("worth every penny") | topical sarcasm | reaction template ("man excited about [product]") |

### Signals that fire on BOTH shill samples but NOT on the real one

- `post-type="video"`
- `domain="v.redd.it"` (platform-CDN re-host)
- `[icon*="/snoovatar/avatars/"]` (default snoovatar)
- Author username matches `Adjective_Noun####` (not directly CSS-queryable)
- Bare video, no text body, no outbound links

These are the **shill-shape core**. They survive across the outrage and wholesome subtypes.

### Signals that DIFFER between the two shill samples

- `is-not-brand-safe`: present on Sample 1 (outrage), absent on Sample 3 (wholesome)
- Subreddit category: generic-interest vs feel-good
- Title shape: clickbait vs reaction-template

These are the **subtype modifiers**. They should NOT be required clauses in any single combined rule. The right approach is a UNION of two narrower per-subtype rules.

### Two shill subtypes - working hypothesis

After three captures, the data suggests at least two distinct astroturf populations operating on Reddit, with different platform-classifier behavior:

- **Subtype A (outrage-shape)**: controversial / shocking / political content packaged as a viral video. Triggers Reddit's `is-not-brand-safe` flag because advertisers do not want adjacency. Lives in generic-interest subs.
- **Subtype B (wholesome-shape)**: reaction videos to brand-name licensed products, packaged as feel-good content. Does NOT trigger the brand-safety flag because the platform considers wholesome content advertiser-friendly. Lives in feel-good subs.

Same operators may run both, or different operations may target each surface; the DOM evidence cannot distinguish that. What matters for filter design: each subtype needs its own rule.

## Candidate signals - ranked by durability and false-positive risk

### S1. `is-not-brand-safe` attribute presence (HIGH leverage, MEDIUM risk)

Reddit's frontend ships an internal classification flag indicating that a post is unsuitable for advertiser placement. The attribute is presence-only (boolean HTML attribute style) and queryable in CSS as `[is-not-brand-safe]`.

Pros:
- Stable: it is part of Reddit's own ad-system architecture, not a frontend utility class
- Discriminating: most regular content does not have this flag set
- Composable: combines cleanly with `[post-type]` and `[view-context]` to narrow scope

Cons:
- Not actually a "shill detector." It is a "won't sell ads against this" tag. Confirmed behavior across our captures AND across a broader corpus of real-world Reddit DOM samples surfaced via GitHub code search:
  - Fires on Sample 1 (probable outrage-shape shill, video about controversial reaction content)
  - Fires on Sample 2 (real political commentary about a Russian military parade)
  - Does NOT fire on Sample 3 (probable wholesome-shape shill, reaction to Iron Man product) - wholesome content is advertiser-friendly
  - Public corpus also shows the flag firing on: r/wallstreetbets gambling/finance gallery posts, r/BlowJob NSFW link posts, r/worldnews CNBC political news links, r/Funnymemes image memes, r/interestingasfuck viral videos. Broader surface than initially predicted - covers gambling, NSFW, news politics, and edgy viral content as well as the controversy/shock category.
- Single-attribute rule is dead on arrival in TWO directions: false-positive on Sample 2 (real content tagged), false-negative on Sample 3 (shill content untagged).
- The flag IS still useful as a SUBTYPE selector: presence implies outrage/edgy/risky-for-ads, absence does not exclude shilling.

Status: dead as a single-attribute rule, also dead as a required keystone clause in any combined rule. Useful only inside per-subtype rules (see "Realistic rule shape" section below) - presence narrows to Subtype A, absence narrows to Subtype B.

### S2. Author-name pattern (LOW leverage as CSS, HIGH human-tell value)

`Awkward_Lunch8016` matches Reddit's auto-suggested username format `Adjective_Noun####`. Bot-account farms accept the default suggestion because customizing 50 names per day is friction.

Pros:
- Strong human signal that an account is low-effort or throwaway
- Easy to recognize visually

Cons:
- CSS attribute selectors do not support regex. Possible substring matches like `[author^="Awkward_"]` only catch one specific name, not the pattern.
- A regex-capable rule would need an extension to Hush's selector engine.
- Many real long-term users also kept their default name. False-positive risk on real humans is non-trivial.

Decision: skip as a CSS rule. Possible future feature: `author-pattern` rule type with regex support.

### S3. Title text patterns - SUBSTRING WORKS TODAY, REGEX NEEDS EXTENSION

Reaction-bait titles span two recognizable templates:

- **Outrage clickbait** ("It was worth every penny", "I can't believe this", "30 days later", "...changed my life")
- **Wholesome reaction** ("[Person] excited about their [product]", "[Person]'s reaction to [brand-name item]")

**Correction from prior version of this doc**: an earlier revision claimed title text was "NOT QUERYABLE in current Hush." That was wrong. Reddit exposes the title as the queryable `post-title` attribute on `<shreddit-post>`. CSS attribute substring match works today:

```
shreddit-post[post-title*="excited about"]
shreddit-post[post-title*="worth every"]
shreddit-post[post-title*="changed my life"]
```

This is plain CSS3, supported by `document.querySelector` and therefore by Hush's existing engine. Confirmed by existing uBlock Origin filter lists in the wild that already use this pattern (e.g. `StefanoChiodino/ublock-filter` uses `shreddit-post[post-title*="harris"]` for political content filtering).

So the practical story is:

- **Substring matching: WORKS TODAY in Hush.** Use as a clause in a stacked-AND rule (see Subtype B below).
- **Regex matching: needs an engine extension.** Patterns like `^[A-Z][a-z]+ excited about (his|her|their)` cannot be expressed in vanilla CSS. Would require either a Hush-side regex layer OR adopting uBlock Origin's `:has-text(/regex/i)` procedural cosmetic filter syntax. See the Prior Art section for the canonical reference.

For the wholesome-shape Subtype B rule below, substring matching alone catches most observed templates. The regex extension is "nice to have," not "load-bearing" as the prior revision claimed.

### S4. Outbound link domain (NOT APPLICABLE to Sample 1)

The standard astroturf playbook is to drive traffic to an affiliate or product page. A `block` rule against the destination domain plus a `remove` rule on `shreddit-post:has(a[href*="domain"])` is the durable kill.

In Sample 1 there is NO outbound domain. The post is a self-hosted video on `v.redd.it` with no link in the body. This is consistent with modern shill technique: re-upload media to the platform CDN to dodge consumer-side network filters, then drive engagement via comment threads or follow-up content rather than direct links.

If Sample 2 has an outbound domain that Sample 1 lacks, that is a divergence pattern - record it and adapt strategy per shape.

### S5. Subreddit + post-type combination (LOW SPECIFICITY)

Video posts on `r/interestingasfuck` are a known dumping ground for low-effort viral content. Same for `r/Damnthatsinteresting`, `r/oddlysatisfying`, `r/BeAmazed`, `r/nextfuckinglevel`. But these subs also have legitimate content - a blanket subreddit rule is too broad.

Could narrow with combinatorial selectors:

```
shreddit-post[subreddit-name="interestingasfuck"][post-type="video"][is-not-brand-safe]
```

This is more like S1 with extra clauses, not a separate signal.

### S6. Multi-signal scoring pass (FEATURE PROPOSAL)

The reason "I know an ad when I see one" resists single-selector translation: human pattern recognition fuses many weak signals. The CSS-rule paradigm fires on one strong signal at a time.

A scoring pass would tag each post with a `data-hush-score` attribute based on weighted heuristics:

- `is-not-brand-safe` present: +2
- `view-context="AggregateFeed"`: +1
- `post-type="video"`: +1
- Author matches `^[A-Z][a-z]+_[A-Z][a-z]+\d+$`: +1
- Title matches a maintained regex blocklist of bait phrases: +2
- Account age below a threshold (would require a profile-card fetch or hover-card scrape): +2
- Cross-posting detected (same media URL appears in N other posts within session): +3

Then a CSS rule like `shreddit-post[data-hush-score>="4"]` removes high-confidence shills.

This is a non-trivial extension. Belongs in `roadmap.md` if we decide to pursue.

### S7. Profile icon CDN path (HIGH leverage, LOW risk)

Reddit serves user profile icons from two structurally different paths depending on whether the user has uploaded a custom avatar:

- Default snoovatar (auto-assigned, never customized): `https://preview.redd.it/snoovatar/avatars/<uuid>-headshot.png`
- Custom-uploaded profile icon: `https://styles.redditmedia.com/t5_<userSubId>/styles/profileIcon_<id>-headshot.png`

The `t5_` prefix on the custom path is the user's own profile-page subreddit ID, where Reddit stores per-user style assets. The path difference reflects internal storage and CDN architecture choices, not user-facing intent - which makes it useful as a signal precisely because it leaks classification info as a side effect.

Sample 1 has the default snoovatar path. Sample 2 has the custom-upload path. CSS-queryable via the `icon` attribute substring match: `[icon*="/snoovatar/avatars/"]` matches default-snoovatar accounts.

Pros:
- Stable: rooted in Reddit's CDN/storage architecture; not a frontend utility class.
- Strong correlation with account effort: customizing the profile icon is a small effort tax that bots and farmed accounts almost never pay.
- Composable: pairs cleanly with S1 to filter custom-avatar accounts (likely real) before applying the not-brand-safe rule.

Cons:
- Some real users keep the default snoovatar (newer accounts, mobile-only users, those who do not customize their profile). Using this signal alone would over-remove.
- A sophisticated shill operation could automate snoovatar customization. Whether the cost is worth it to them is an open question.

Hypothetical selector clause: `[icon*="/snoovatar/avatars/"]`. Combine with other clauses, never use alone.

### S8. Account metadata enrichment (requires JSON fetch, NOT in DOM)

Properties of the post author that are NOT exposed in the post DOM but ARE available via Reddit's anonymous JSON endpoints (`https://www.reddit.com/user/<name>/about.json` - works without OAuth, uses the user's session cookie if logged in for a higher rate limit):

- `created_utc` - account creation timestamp; combined with `Date.now()` gives **account age in days**
- `link_karma + comment_karma` - **total karma**, which combined with age gives **karma per day rate** (the strongest single-signal account-quality indicator across the detection literature - see Prior Art)
- `has_verified_email` - email verified flag
- `subreddit.public_description` - bio text (empty bio is a weak signal)
- `icon_img` / `snoovatar_img` - alternate path to the same default-vs-custom avatar signal as S7

These cannot be determined from DOM-only inspection. To use them, Hush would need to fetch one JSON endpoint per candidate post author. See the new "DOM-only vs account-enriched" section below for tradeoffs.

Why these matter specifically:

- **Karma per day rate** is the killer signal that separates "shill account that warmed up via engagement farming" from "real new user with the same DOM profile." Without it, Subtype B (wholesome-shape) cannot be reliably distinguished from real new wholesome posters.
- **Account age** alone catches very-new burner accounts (which the DOM does not surface)
- **Bio + verified email** are weak corroborating signals - prior art (AstroGuard) scores them at +3 each

Pros:
- Strong precision improvement on Subtype B
- One anonymous fetch per candidate author, uses user's session cookie if logged in (rate-limit-friendly)
- No OAuth or API key required - the `.json` suffix on any Reddit URL has been a free public endpoint since pre-2010

Cons:
- Network footprint - each fetch tells reddit "I'm interested in this user"
- Latency - post stays visible for ~100ms while the fetch resolves
- Hush's current rule shape (`hide` / `remove` / `block` arrays of CSS selectors) has no notion of async-evaluated rules. This is a real (if small) engine extension.

## Realistic rule shape: per-subtype stacked rules

Three captures in, the data shows there are at least two distinct shill subtypes hitting Reddit, with different platform-classifier behavior. A single combined rule that requires `[is-not-brand-safe]` would miss the wholesome-shape entirely (Sample 3). A single rule that omits `[is-not-brand-safe]` could in principle catch both subtypes but with severely degraded precision on the wholesome shape (overlap with real wholesome content is huge).

The cleanest shape is a UNION of two narrower stacked rules, one tuned per subtype.

### Subtype A: outrage-shape rule (Sample 1 profile)

```
shreddit-post[is-not-brand-safe][post-type="video"][icon*="/snoovatar/avatars/"]
```

What each clause buys:

- `[is-not-brand-safe]` - Reddit's classifier flagged it advertiser-unsafe (only fires on outrage-shape; acts as the subtype gate)
- `[post-type="video"]` - shill format
- `[icon*="/snoovatar/avatars/"]` - default-snoovatar account (low-effort signal)

We previously included `[view-context="AggregateFeed"]`. Dropped because Sample 3 was captured via ProfileFeed2; in general the original encounter feed is not knowable from the post itself, and a real shill could surface in any feed context. The clause restricts where the rule fires, not whether the post is a shill.

False-positive risk: real outrage content (war, politics, controversy) on default-snoovatar accounts. Realistic but bounded - the brand-safety flag is restrictive enough that volume should be tolerable.

### Subtype B: wholesome-shape rule (Sample 3 profile)

```
shreddit-post:not([is-not-brand-safe])[post-type="video"][domain="v.redd.it"][icon*="/snoovatar/avatars/"]:is([post-title*="excited about"], [post-title*="reaction to"], [post-title*="worth every"], [post-title*="changed my life"], [post-title*="i tried"], [post-title*="i can't believe"])
```

What each clause buys:

- `:not([is-not-brand-safe])` - explicitly NOT brand-unsafe (subtype gate; excludes outrage content)
- `[post-type="video"]` - shill format
- `[domain="v.redd.it"]` - re-hosted on platform CDN
- `[icon*="/snoovatar/avatars/"]` - default-snoovatar account
- `:is([post-title*="..."], ...)` - title contains one of the recognized reaction-bait substrings (this is the discriminator that separates wholesome shill from real wholesome content)

The title-substring clause is the key change from earlier revisions of this doc. Substring matching against `post-title` works in vanilla CSS today (see S3) - no engine extension needed for this rule to ship.

False-positive risk on the title-list clauses: bounded. Real titles like "Reaction to my daughter's first steps" will still match `[post-title*="reaction to"]` - a real cost. Mitigations:
- Keep the title list short and recognizably commercial-template-shaped
- Tune by adding more clauses or scoping (e.g. `[post-title*="excited about his"]` is narrower than `[post-title*="excited about"]`)
- Move toward regex once the engine extension lands - patterns like `excited about (his|her|their) [a-z ]+ (helmet|set|gadget|kit|toy)` are sharper

For maximum precision, a Tier-B (account-enriched) version would add karma-per-day filtering on top of the structural+title clauses to exclude real new wholesome posters from established accounts. That depends on the engine extension described in the "DOM-only vs account-enriched" section.

### Recommended deployment order

1. Ship Subtype A first. Lowest false-positive risk because the brand-safety flag is restrictive. Watch for a day, measure FP rate.
2. Ship Subtype B with the title-substring clauses as a second wave. Now SHIPPABLE TODAY thanks to the S3 correction. Watch for FPs on real wholesome posters whose titles happen to match the substrings.
3. If Subtype B FP rate is too high, two paths:
   - Tighten the title-substring list (narrower phrases, more specific anchoring)
   - Add Tier-B account-enrichment to filter out real established accounts (requires Hush engine extension for async rules)
4. If Subtype A under-performs precision, add S7's icon-path clause as a stricter requirement (already included), or scope by subreddit.

### Inverted approach: whitelist trust signals

A complementary direction: instead of detecting shill shape, protect posts that contain trust signals. Conceptually:

```
shreddit-post[is-not-brand-safe]:not(:has(a[href*="apnews.com"])):not(:has(a[href*="reuters.com"])):not(:has(a[href*="bbc.com"]))
```

Pros: clean semantics ("kill not-brand-safe posts UNLESS they link to a known news outlet"), a stable whitelist of major outlets ages well.

Cons: maintaining the news-domain whitelist is ongoing work, the selector grows linearly with whitelist length, and Hush has no first-class "exception" or "do-not-remove" rule type today. The per-subtype positive forms above are more practical to ship without engine changes.

Worth revisiting if Hush grows an exception layer.

## DOM-only vs account-enriched: where the data lives

Architectural decision that affects what we can actually ship. Hush is currently pure-DOM (zero-network, synchronous CSS evaluation). Some signals are only available by fetching the post author's profile JSON. The cleanest model is **filter-first, enrich-only-on-candidates** - never the AstroGuard-style "fetch every author of every visible post" pattern.

### What's queryable in the DOM today

| Signal | DOM source |
|---|---|
| Author username pattern | `author` attribute (substring/prefix only - regex needs extension) |
| Default snoovatar | `icon` attribute substring |
| Post type, domain, subreddit | direct attributes |
| `is-not-brand-safe` flag | direct attribute |
| Title substring | `post-title` attribute (vanilla CSS substring match) |
| Score, comment count, upvote ratio | attributes |
| Crosspostable, embeddable, awardable flags | direct attributes |

### What requires a JSON fetch per candidate

| Signal | Why DOM-unavailable |
|---|---|
| Account age (`created_utc`) | not exposed on post elements |
| Total karma | not exposed |
| Karma per day rate | derived from age + karma, not exposed |
| Verified email | not exposed |
| Bio text | only renders on profile pages, not in feed |
| Comment burst patterns, AI tells, sub diversity | requires comment-history scan (Tier C, out of scope) |

### Architectural tradeoffs

**Tier A - DOM-only** (current Hush):
- Cost: zero network, synchronous evaluation
- Privacy: zero leakage - reddit cannot observe what you are filtering
- Strength: enough for Subtype A (outrage-shape) where `is-not-brand-safe` already restricts the candidate set
- Weakness: insufficient for Subtype B (wholesome-shape) - structural signals overlap heavily with real new wholesome users

**Tier B - DOM-filter then per-candidate enrichment** (recommended for Subtype B):
- Cost: 1 anonymous JSON fetch per Subtype-B candidate. After DOM filter narrows ~50 visible posts to 1-3 candidates, this is negligible.
- Privacy: each fetch tells reddit "I'm interested in this user" - small but real leakage
- Strength: unlocks karma-per-day, the single best discriminator between shill and real-new-user
- Engine cost: needs an async rule type that Hush does not have today
- Auth: anonymous works; user's session cookie automatically bumps rate limit when they're signed in to reddit (which they always will be on reddit.com)

**Tier C - Full per-author scan** (the AstroGuard architecture):
- Cost: 50+ fetches per page, OAuth flow for rate-limit headroom, optional LLM key
- Out of scope for Hush. Different product positioning entirely. See Prior Art.

### Recommended deployment

1. Ship Subtype A as DOM-only (Tier A). Cheap, precise enough.
2. Defer Subtype B until Hush adds candidate-enrichment rule type (Tier B). Without it, ship would over-remove real wholesome content.
3. Never go Tier C. Scope creep, privacy regression, doesn't fit Hush's positioning as a zero-network filter.

The "scanning every post seems absurd" instinct is correct for Tier C and wrong for Tier B. Tier B's enrichment cost is bounded by how aggressive the DOM filter is at narrowing candidates, and on typical feed pages it is single-digit fetches.

## Why network blocking does not help (specific to this case)

Sample 1's video is on `v.redd.it`, Reddit's first-party CDN. A `block` rule against `v.redd.it` would break ALL Reddit videos, including legitimate ones. The shill content shares its delivery infrastructure with everything else on the platform. Same logic as why we cannot block `i.redd.it` to stop image spam.

For shill content that DOES embed third-party media or affiliate links, network blocking remains the strongest layer. But the trend is toward platform-CDN re-hosting precisely to deny that defense.

## Verification steps before shipping any rule

1. ~~Capture Sample 2 and diff against Sample 1.~~ Done.
2. ~~Capture more samples to test stacked-AND.~~ Done at sample size 3. Confirmed two distinct shill subtypes (outrage-shape with `[is-not-brand-safe]`, wholesome-shape without). Single combined rule is no longer the goal; per-subtype rules are.
3. ~~Survey prior art before designing engine extensions.~~ Done. Found AstroGuard (validates S2 + S7), uBlock Origin filter-list patterns (substring on `post-title` works in vanilla CSS today - changes the S3 design entirely), uBO procedural cosmetic filter syntax as canonical regex extension prior art.
4. Capture 5 to 10 MORE samples per subtype to test each rule independently. For each, record:
   - `is-not-brand-safe` presence (sorts into Subtype A vs Subtype B bucket)
   - `post-type`, `domain`, subreddit
   - `icon` URL path (default snoovatar vs custom upload)
   - **Title text verbatim** (now actionable - feeds the substring list directly)
   - Subjective shill / not-shill judgment
   Subtype A is viable if precision is high on the outrage-shape subset. Subtype B is viable if the title-substring list captures most observed shill titles without firing on enough real wholesome titles to be intrusive.
5. On a live feed with Subtype A rule active, watch for false positives over a full day. Wholesome real content is NOT at risk from Subtype A (it lacks the brand-safety flag). Outrage real content (war, politics, controversy) IS at risk - estimate the rate.
6. On a live feed with Subtype B rule active, watch FP rate especially on titles that contain matching substrings but are legitimate ("Reaction to my daughter's first steps" matches `[post-title*="reaction to"]`). Tune the substring list narrower if needed.
7. Check whether `is-not-brand-safe` appears on Reddit's own Promoted (paid) posts. If yes, the existing `is-post-commercial-communication` rule already handles them.
8. Validate prior-art findings as new samples come in:
   - Does `is-promoted-user-post="true"` appear on any of our captured shills? (Per `neramc`'s filter, this is a real attribute we have not yet observed.)
   - Do our captured authors' usernames match AstroGuard's regex set?
9. Escalation paths if rules underperform:
   - Tighten Subtype A's `domain` clause (e.g. `[domain^="v.redd.it"]` to be strict about platform-CDN re-hosts)
   - Add inverted news-domain whitelist as `:not(:has(...))` exclusions on Subtype A
   - Add Tier-B account enrichment for Subtype B (requires Hush async-rule engine extension - see "DOM-only vs account-enriched")
   - Adopt uBO's `:has-text(/regex/i)` for sharper title patterns (engine extension)
   - Pursue S6 scoring-pass for multi-signal weighted-sum approach

## Out of scope for this doc

- Account-history scraping (would require fetching user profile pages, expensive and rate-limited)
- Comment-thread analysis (different DOM, different problem shape)
- Cross-session pattern learning (would need persistent storage of post fingerprints)
- Old Reddit (`old.reddit.com`) - separate DOM, not investigated here

## Prior art

Survey of related work, found via GitHub repo + code search and academic literature search. Saves future-us from re-running this research.

### Active browser-extension projects

- **[zoh-f/HooHacks2026](https://github.com/zoh-f/HooHacks2026)** ("AstroGuard") - single-day hackathon project (March 21-22 2026), Chrome MV3 extension. Different threat model from Hush: scores USERS not POSTS via Reddit JSON endpoints + Gemini LLM. Operates per-comment-author across the full feed (Tier C in our architecture taxonomy).
  - Validates our S2 finding: their `^[A-Za-z]+_[A-Za-z]+\d{2,}$` regex matches both `Awkward_Lunch8016` and `FewCollar227` and scores +6 in their system.
  - Validates our S7 finding: detects default avatars via substring match on `icon_img` (`default` / `snoo_default`) - same logic against the API field instead of the DOM attribute.
  - Useful borrowable assets: 25-entry "skip known bots" allowlist (`automoderator`, `autotldr`, `remindmebot`, etc.), 26-entry generic-phrase list ("this is the way", "based", etc.), 40+ AI-tell phrase list ("delve", "tapestry", "it's worth noting", etc.).
  - Architectural mismatch with Hush: requires Reddit OAuth + Gemini API key (both free tiers, but registration friction), hits 100+ requests per page on busy threads, scope way beyond per-post structural filtering.
- **[rxliuli/clean-reddit](https://github.com/rxliuli/clean-reddit)** - actively maintained Reddit cleanup tool, plugin-based architecture (avatar-menu / content / left / right / top). 2 stars at time of writing. Closest direct competitor to Hush's reddit case study.
- **[mrityunjai01/reddit-astroturf](https://github.com/mrityunjai01/reddit-astroturf)** (2025) - Python + Jupyter notebook, server-side ML classifier. Different layer entirely (offline analysis, not browser filter). Possible feature-engineering reference.
- **[your-majisty174/reddit-astroturf-detector](https://github.com/your-majisty174/reddit-astroturf-detector)** (2025) - detection project, limited public info beyond the repo description.

### Curated blocklists

- **[sockpuppetaccounts/reddit](https://github.com/sockpuppetaccounts/reddit)** - 200+ known shill/sock-puppet usernames in `spammers.txt`. **None of our three captured authors appear in this list**, validating that public username blocklists alone are insufficient (account farms churn faster than community curation can keep up).

### uBlock Origin filter-list patterns (highest signal-to-noise prior art)

The community has been writing reddit filter rules for years. Key patterns observed:

- **`shreddit-post[post-title*="..."]`** for substring title matching - vanilla CSS, works in any selector engine. Used by `StefanoChiodino/ublock-filter` for political-name filtering. **This is the pattern that makes our Subtype B rule shippable today without an engine extension.**
- **`shreddit-post:has-text(/regex/i)`** for regex title matching - uBO procedural cosmetic filter, NOT vanilla CSS. Used in `maus-me/ublock-list` and `SkunkShow/ublock-personal-blocklist`.
- **`:matches-attr(...)`** for regex attribute matching - uBO procedural. Used in `Stevoisiak/Stevos-GenAI-Blocklist` for regex sub-name matching.
- **`shreddit-post:is([score="0"], [score="1"], ..., [score="9"])`** score-range filtering - vanilla CSS. Used in `DandelionSprout/adfilt` to remove low-quality posts.
- **`[permalink*="..."]`** slug matching as topic proxy. Used in `dashingdon/blocklists`.
- **`shreddit-post[is-promoted-user-post="true"]`** - another reddit attribute we had not captured ourselves; used in `neramc`'s filter. Worth checking on future captures.

### uBlock Origin procedural filter syntax (canonical engine extension prior art)

If Hush adds a regex/text matching layer beyond plain CSS, [gorhill/uBlock - Procedural cosmetic filters wiki](https://github.com/gorhill/uBlock/wiki/Procedural-cosmetic-filters) is the proven prior art. Operators include `:has-text(...)`, `:matches-attr(...)`, `:matches-css(...)`, `:upward(N)`, `:nth-of-class()`, plus chaining. **Adopting this dialect (rather than inventing a parallel one) lets the existing filter-list corpus become directly portable into Hush.** Belongs in `roadmap.md` if/when the regex extension is greenlit.

### Academic literature

- **[Chen et al 2021 survey, Hindawi](https://www.hindawi.com/journals/scn/2021/3294610/)** - astroturf detection broadly. Chen 2013's earlier work hit 88.79 percent accuracy on astroturfers using semantic + non-semantic features in a random-forest classifier.
- **[Nature 2022 - Coordination patterns reveal political astroturfing across the world](https://www.nature.com/articles/s41598-022-08404-9)** - argues coordinated-group detection outperforms individual-account ML classifiers. Implication: post-level filtering has a recall ceiling; campaign-level analysis would be a complementary higher tier (out of scope for Hush).

### Commercial

- **[Subsignal.ai - Reddit Shill Detection](https://www.subsignal.ai/features/reddit-shill-detection)** - server-side commercial product. Existence proof for the demand, possibly a benchmark.

## References

- `docs/reddit.md` - shipped rules for disclosed commercial content
- `sites.json` - current rule config; the `reddit.com` entry is the integration point
- `docs/architecture.md` - rule shape and selector engine constraints (vanilla CSS today, regex extension would adopt uBO procedural syntax per Prior Art)
