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
- Not actually a "shill detector." It is a "won't sell ads against this" tag. Confirmed behavior across captures:
  - Fires on Sample 1 (probable outrage-shape shill, video about controversial reaction content)
  - Fires on Sample 2 (real political commentary about a Russian military parade)
  - Does NOT fire on Sample 3 (probable wholesome-shape shill, reaction to Iron Man product) - because wholesome content is advertiser-friendly
- Single-attribute rule is dead on arrival in TWO directions: false-positive on Sample 2 (real content tagged), false-negative on Sample 3 (shill content untagged).
- The flag IS still useful as a SUBTYPE selector: presence implies outrage-shape, absence does not exclude shilling.

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

### S3. Title text patterns (NOT QUERYABLE in current Hush) - ELEVATED PRIORITY

Reaction-bait titles span two recognizable templates:

- **Outrage clickbait** ("It was worth every penny", "I can't believe this", "30 days later", "...changed my life")
- **Wholesome reaction** ("[Person] excited about their [product]", "[Person]'s reaction to [brand-name item]")

Hush rules are pure CSS selectors. CSS does not have `:contains()` or text-content matching. There is no way to write a title-text rule with the current engine.

Why this is now ELEVATED from "nice to have" to "near-essential":

After Sample 3 it is clear that the wholesome-shape shill subtype (Subtype B) cannot be reliably distinguished from real wholesome content using DOM-structural signals alone. Both shapes use:

- Bare video on `v.redd.it`
- Default snoovatars (mass user behavior, not just bots)
- Auto-suggested usernames (also common to real new accounts)
- Generic feel-good subs (intended audience overlap)

The only stable signal that differs is the title shape. "A man excited about his Iron Man helmet and hand" follows a product-reaction template. "A man excited about his daughter's first steps" does not. CSS cannot tell them apart.

Required engine extension to make S3 viable:

- A text-content matching rule layer (regex or substring), evaluated in JS, that runs in addition to the CSS selector engine
- Possible rule format: `{ "value": "shreddit-post", "title-regex": "excited about (his|her|their) [a-z ]+ (helmet|gadget|set|kit)" }`
- Or a separate `title-block` rule type with its own array

Belongs in `roadmap.md` as a feature proposal. The Subtype B rule below is essentially un-shippable without it.

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
shreddit-post:not([is-not-brand-safe])[post-type="video"][domain="v.redd.it"][icon*="/snoovatar/avatars/"]
```

What each clause buys:

- `:not([is-not-brand-safe])` - explicitly NOT brand-unsafe (subtype gate; excludes outrage content)
- `[post-type="video"]` - shill format
- `[domain="v.redd.it"]` - re-hosted on platform CDN
- `[icon*="/snoovatar/avatars/"]` - default-snoovatar account

False-positive risk: HIGH. Plenty of real users post wholesome videos to feel-good subs from default-snoovatar accounts. Without title-text matching to discriminate "excited about [product]" from "excited about [my kid]", this rule will over-remove real wholesome content.

### Recommended deployment order

1. Ship Subtype A first. Lower false-positive risk because the brand-safety flag is restrictive. Watch for a day, measure FP rate.
2. HOLD Subtype B until either (a) more samples confirm precision is acceptable, or (b) Hush grows a text-content matching layer that can add a title-regex clause. Without that, B will feel intrusive.
3. If Subtype A under-performs precision after live testing, add S7's icon-path clause as a stricter requirement (already included), or scope by subreddit.

### Inverted approach: whitelist trust signals

A complementary direction: instead of detecting shill shape, protect posts that contain trust signals. Conceptually:

```
shreddit-post[is-not-brand-safe]:not(:has(a[href*="apnews.com"])):not(:has(a[href*="reuters.com"])):not(:has(a[href*="bbc.com"]))
```

Pros: clean semantics ("kill not-brand-safe posts UNLESS they link to a known news outlet"), a stable whitelist of major outlets ages well.

Cons: maintaining the news-domain whitelist is ongoing work, the selector grows linearly with whitelist length, and Hush has no first-class "exception" or "do-not-remove" rule type today. The per-subtype positive forms above are more practical to ship without engine changes.

Worth revisiting if Hush grows an exception layer.

## Why network blocking does not help (specific to this case)

Sample 1's video is on `v.redd.it`, Reddit's first-party CDN. A `block` rule against `v.redd.it` would break ALL Reddit videos, including legitimate ones. The shill content shares its delivery infrastructure with everything else on the platform. Same logic as why we cannot block `i.redd.it` to stop image spam.

For shill content that DOES embed third-party media or affiliate links, network blocking remains the strongest layer. But the trend is toward platform-CDN re-hosting precisely to deny that defense.

## Verification steps before shipping any rule

1. ~~Capture Sample 2 and diff against Sample 1.~~ Done.
2. ~~Capture more samples to test stacked-AND.~~ Done at sample size 3. Confirmed two distinct shill subtypes (outrage-shape with `[is-not-brand-safe]`, wholesome-shape without). Single combined rule is no longer the goal; per-subtype rules are.
3. Capture 5 to 10 MORE samples per subtype to test each rule independently. For each, record:
   - `is-not-brand-safe` presence (sorts into Subtype A vs Subtype B bucket)
   - `post-type`
   - `domain`
   - `icon` URL path (default snoovatar vs custom upload)
   - Subreddit
   - Subjective shill / not-shill judgment
   - Title text (for future title-regex rule design - capture the exact string verbatim)
   Subtype A is viable if precision is high on the outrage-shape subset. Subtype B will likely need title-text matching to be viable; capture title patterns aggressively.
4. On a live feed with Subtype A rule active, watch for false positives over a full day. Wholesome real content is NOT at risk from Subtype A (it lacks the brand-safety flag). Outrage real content (war, politics, controversy) IS at risk - estimate the rate.
5. Hold Subtype B rule until Hush grows a text-content matching layer (S3+). Without title-regex support, Subtype B will likely over-remove real wholesome content.
6. Check whether `is-not-brand-safe` appears on Reddit's own Promoted (paid) posts. If yes, the existing `is-post-commercial-communication` rule already handles them.
7. Escalation paths if both subtype rules underperform:
   - Tighten the `domain` clause on Subtype A (e.g. `[domain="v.redd.it"]` to exclude self-posts)
   - Add the inverted news-domain whitelist as `:not(:has(...))` exclusions on Subtype A
   - Pursue the S6 scoring-pass feature as a multi-signal weighted-sum approach
   - Build the text-matching engine extension - this looks increasingly load-bearing for Subtype B

## Out of scope for this doc

- Account-history scraping (would require fetching user profile pages, expensive and rate-limited)
- Comment-thread analysis (different DOM, different problem shape)
- Cross-session pattern learning (would need persistent storage of post fingerprints)
- Old Reddit (`old.reddit.com`) - separate DOM, not investigated here

## References

- `docs/reddit.md` - shipped rules for disclosed commercial content
- `sites.json` - current rule config; the `reddit.com` entry is the integration point
- `docs/architecture.md` - rule shape and selector engine constraints (CSS only, no `:contains()`)
