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

## Sample 2

Pending. User has reported a second flagged post but the outerHTML has not been captured yet. Sample 2 capture is the next blocking step before any rule can be written.

## Candidate signals - ranked by durability and false-positive risk

### S1. `is-not-brand-safe` attribute presence (HIGH leverage, MEDIUM risk)

Reddit's frontend ships an internal classification flag indicating that a post is unsuitable for advertiser placement. The attribute is presence-only (boolean HTML attribute style) and queryable in CSS as `[is-not-brand-safe]`.

Pros:
- Stable: it is part of Reddit's own ad-system architecture, not a frontend utility class
- Discriminating: most regular content does not have this flag set
- Composable: combines cleanly with `[post-type]` and `[view-context]` to narrow scope

Cons:
- Not actually a "shill detector." It is a "won't sell ads against this" tag. False positives include:
  - NSFW-adjacent content
  - Gore, violence, or shock content
  - Politically controversial posts
  - Some profanity-heavy content
- Coverage of undisclosed shilling is unverified. Sample 1 has it, Sample 2 unknown.

Hypothetical selector:

```
shreddit-post[is-not-brand-safe][post-type="video"][view-context="AggregateFeed"]
```

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

## Why network blocking does not help (specific to this case)

Sample 1's video is on `v.redd.it`, Reddit's first-party CDN. A `block` rule against `v.redd.it` would break ALL Reddit videos, including legitimate ones. The shill content shares its delivery infrastructure with everything else on the platform. Same logic as why we cannot block `i.redd.it` to stop image spam.

For shill content that DOES embed third-party media or affiliate links, network blocking remains the strongest layer. But the trend is toward platform-CDN re-hosting precisely to deny that defense.

## Verification steps before shipping any rule

1. Capture outerHTML of Sample 2. Diff against Sample 1's attributes. Note what is constant and what rotates.
2. Spot-check 5 to 10 more flagged posts. Record `is-not-brand-safe` presence rate. If above ~70 percent, S1 is viable; if below ~40 percent, S1 is not the right hook.
3. On a live feed with a hypothetical S1 rule active, watch for false positives over a full day of typical browsing. Heads up: NSFW-adjacent and politics-heavy subs will get hit hard. Decide whether the AggregateFeed clause sufficiently scopes the rule.
4. Check whether `is-not-brand-safe` appears on Reddit's own promoted posts. If yes, the existing `is-post-commercial-communication` rule already handles them; if no, we know S1 is targeting a separate population.
5. If S1 fails verification, escalate to the S6 scoring pass design.

## Out of scope for this doc

- Account-history scraping (would require fetching user profile pages, expensive and rate-limited)
- Comment-thread analysis (different DOM, different problem shape)
- Cross-session pattern learning (would need persistent storage of post fingerprints)
- Old Reddit (`old.reddit.com`) - separate DOM, not investigated here

## References

- `docs/reddit.md` - shipped rules for disclosed commercial content
- `sites.json` - current rule config; the `reddit.com` entry is the integration point
- `docs/architecture.md` - rule shape and selector engine constraints (CSS only, no `:contains()`)
