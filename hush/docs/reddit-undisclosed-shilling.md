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

## Sample 1 vs Sample 2 - what's the same, what differs

| Aspect | Sample 1 (probable shill) | Sample 2 (real, control) |
|---|---|---|
| `is-not-brand-safe` | present | present |
| `view-context` | AggregateFeed | AggregateFeed |
| `post-type` | video | multi_media |
| `domain` | v.redd.it | self.lazerpig |
| Subreddit | r/interestingasfuck (generic, ~13M subs) | r/lazerpig (niche fan sub) |
| Author username | Awkward_Lunch8016 (auto-suggested format) | Bionic_Redhead (personalized) |
| Profile icon CDN path | `/snoovatar/avatars/` (default) | `/styles/profileIcon_` (custom upload) |
| Body | bare media, no text | self-post text plus link to apnews.com |
| Score / comments | 668 / 147 | 57 / 8 |

The same-vs-different ratio confirms `is-not-brand-safe` cannot work as a single-attribute rule. It must be combined with attributes that fail on Sample 2. The strongest candidates are the post-type, the icon CDN path, and the body's outbound-link pattern.

## Candidate signals - ranked by durability and false-positive risk

### S1. `is-not-brand-safe` attribute presence (HIGH leverage, MEDIUM risk)

Reddit's frontend ships an internal classification flag indicating that a post is unsuitable for advertiser placement. The attribute is presence-only (boolean HTML attribute style) and queryable in CSS as `[is-not-brand-safe]`.

Pros:
- Stable: it is part of Reddit's own ad-system architecture, not a frontend utility class
- Discriminating: most regular content does not have this flag set
- Composable: combines cleanly with `[post-type]` and `[view-context]` to narrow scope

Cons:
- Not actually a "shill detector." It is a "won't sell ads against this" tag. False positives confirmed include:
  - Politically controversial posts (Sample 2 - confirmed on first non-shill capture, content was sarcastic political commentary about a Russian military parade)
  - Likely also: NSFW-adjacent content, gore/violence/shock content, profanity-heavy posts (predicted, not yet captured as samples)
- Single-attribute rule is dead on arrival. The flag fired on Sample 1 (probable shill) AND Sample 2 (real political commentary). Cannot discriminate.

Status: dead as a single-attribute rule. Useful as ONE clause in a stacked rule (see "Realistic rule shape" section below).

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

### S3. Title text patterns (NOT QUERYABLE in current Hush)

Reaction-bait titles ("It was worth every penny", "I can't believe this", "30 days later", "...changed my life") are strong human signals.

Hush rules are pure CSS selectors. CSS does not have `:contains()` or text-content matching. There is no way to write a title-text rule with the current engine.

To use title text as a signal, Hush would need:
- A text-content matching rule layer (regex or substring), separate from CSS selectors, evaluated in JS
- Or a scoring pass (see S6)

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

## Realistic rule shape: stacked weak signals

A single strong selector for "this is a shill" does not exist in the DOM. None of the candidate signals above is precise enough alone. The realistic approach is to stack multiple weak selectors with AND:

```
shreddit-post[is-not-brand-safe][post-type="video"][view-context="AggregateFeed"][icon*="/snoovatar/avatars/"]
```

What each clause buys:

- `[is-not-brand-safe]` - Reddit's own classifier flagged it advertiser-unsafe (broad, ~50 percent of false-positive shape on its own)
- `[post-type="video"]` - the format favored by shills in our captured samples (excludes self-posts and link posts that real users tend to favor)
- `[view-context="AggregateFeed"]` - showing in the home feed via algorithmic insertion, not because the user explicitly subscribed to the sub
- `[icon*="/snoovatar/avatars/"]` - author has not customized their profile icon (low-effort account signal)

Sample 1 satisfies all four. Sample 2 fails the `[icon*=]` clause cleanly. This composition trades recall (will miss shills that fail any clause - e.g. shills that customize their snoovatar, or shills using image format instead of video) for precision (very few real posts will satisfy all four).

Per-user filter tools are usually well-served by this tradeoff because false positives cause noticeable feed gaps while false negatives just mean "the shill got through, I see it like before." Recall-failure is recoverable; precision-failure erodes trust in the tool.

### Inverted approach: whitelist trust signals

A complementary direction: instead of detecting shill shape, protect posts that contain trust signals. Conceptually:

```
shreddit-post[is-not-brand-safe]:not(:has(a[href*="apnews.com"])):not(:has(a[href*="reuters.com"])):not(:has(a[href*="bbc.com"]))
```

Pros: clean semantics ("kill not-brand-safe posts UNLESS they link to a known news outlet"), a stable whitelist of major outlets ages well.

Cons: maintaining the news-domain whitelist is ongoing work, the selector grows linearly with whitelist length, and Hush has no first-class "exception" or "do-not-remove" rule type today. The stacked-AND positive form above is more practical to ship without engine changes.

Worth revisiting if Hush grows an exception layer.

## Why network blocking does not help (specific to this case)

Sample 1's video is on `v.redd.it`, Reddit's first-party CDN. A `block` rule against `v.redd.it` would break ALL Reddit videos, including legitimate ones. The shill content shares its delivery infrastructure with everything else on the platform. Same logic as why we cannot block `i.redd.it` to stop image spam.

For shill content that DOES embed third-party media or affiliate links, network blocking remains the strongest layer. But the trend is toward platform-CDN re-hosting precisely to deny that defense.

## Verification steps before shipping any rule

1. ~~Capture outerHTML of Sample 2 and diff against Sample 1.~~ Done. See Sample 2 section. Confirmed S1 is too broad as a single-attribute rule.
2. Capture 5 to 10 MORE samples (mix of suspected shills and known-real posts) to test the stacked-AND rule. For each, record:
   - `is-not-brand-safe` presence
   - `post-type`
   - `view-context`
   - `icon` URL path (default snoovatar vs custom upload)
   - Subjective shill / not-shill judgment
   The stacked rule is viable if it has high precision on the shill subset (most shills satisfy all four clauses) AND zero or near-zero hits on the real subset.
3. On a live feed with the stacked rule active, watch for false positives over a full day of typical browsing. Heads up: real users on niche subs who happen to have default snoovatars and post controversial videos to subs the user doesn't subscribe to are the realistic false-positive population. Estimate frequency before ship.
4. Check whether `is-not-brand-safe` appears on Reddit's own Promoted (paid) posts. If yes, the existing `is-post-commercial-communication` rule already handles them. If no, the stacked rule is targeting a clearly separate population.
5. If the stacked rule still has unacceptable false-positive rate, escalation paths:
   - Add S7's icon-path clause as a stricter requirement
   - Add the inverted whitelist (apnews.com, reuters.com, etc.) as `:not(:has(a[href*="..."]))` exclusions
   - Pursue the S6 scoring-pass feature as a multi-signal weighted-sum approach
   - Extend Hush with a regex-attribute or text-content matching layer (e.g. for title text patterns)

## Out of scope for this doc

- Account-history scraping (would require fetching user profile pages, expensive and rate-limited)
- Comment-thread analysis (different DOM, different problem shape)
- Cross-session pattern learning (would need persistent storage of post fingerprints)
- Old Reddit (`old.reddit.com`) - separate DOM, not investigated here

## References

- `docs/reddit.md` - shipped rules for disclosed commercial content
- `sites.json` - current rule config; the `reddit.com` entry is the integration point
- `docs/architecture.md` - rule shape and selector engine constraints (CSS only, no `:contains()`)
