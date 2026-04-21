//! Pure-function cores extracted from `background.rs` handlers so
//! they're testable without standing up wasm-bindgen-test + a
//! headless Chrome harness. Everything here is a synchronous
//! state mutation or a pure map; nothing touches `chrome.*` APIs,
//! `STATE`, or `spawn_local`.
//!
//! The handlers in `background.rs` wrap these with JS-value
//! parsing, state-lock acquisition, and response-shipping; this
//! module is what carries the logic those wrappers preserve.
//!
//! Keeping the pure layer here also means that when a new handler
//! is written, its state-mutation core can land here first with
//! tests, and the JS bridge can be added on top without shadowing
//! the semantics.
//!
//! Tests live at the bottom of the file (Rust convention).
//!
//! The pure-logic / JS-bridge split mirrors `compute.rs` /
//! `lib.rs::compute_suggestions_wasm` - pure engine in a testable
//! module, thin wasm-bindgen wrapper on top.

#![forbid(unsafe_code)]

use crate::types::{Allowlist, BehaviorState, BrokenSelectors};
use std::collections::VecDeque;

/// Push `item` onto `deque`, then evict from the front until the
/// length is at most `max`. Returns the number of evictions.
///
/// Generic so every FIFO in background.rs
/// (`firewall_log`, `log_buffer`, `bootstrap_errors`) funnels
/// through one cap-and-push function with one test. Zero-alloc on
/// the hot path (VecDeque pop_front is O(1)).
pub fn push_capped<T>(deque: &mut VecDeque<T>, item: T, max: usize) -> usize {
    deque.push_back(item);
    let mut evictions = 0;
    while deque.len() > max {
        deque.pop_front();
        evictions += 1;
    }
    evictions
}

/// Apply a "dismiss suggestion" action to a tab's behavior state.
/// Records `key` in the dismissed list (idempotent: won't duplicate
/// an already-dismissed key) and removes any suggestion whose
/// `key` matches.
///
/// Returns true iff the state was actually mutated - lets the
/// caller decide whether to fire a persist or badge-update. An
/// empty key is a no-op; the caller should validate before the
/// call but we guard defensively too.
pub fn apply_dismiss_suggestion(state: &mut BehaviorState, key: &str) -> bool {
    if key.is_empty() {
        return false;
    }
    let mut changed = false;
    if !state.dismissed.iter().any(|k| k == key) {
        state.dismissed.push(key.to_string());
        changed = true;
    }
    let before = state.suggestions.len();
    state.suggestions.retain(|s| s.key != key);
    if state.suggestions.len() != before {
        changed = true;
    }
    changed
}

/// Apply an "allow suggestion" action to the allowlist cache.
/// Records `key` in `allowlist.suggestions` iff not already
/// present. Returns true iff the list actually changed.
pub fn apply_allowlist_add(allowlist: &mut Allowlist, key: &str) -> bool {
    if key.is_empty() {
        return false;
    }
    if allowlist.suggestions.iter().any(|k| k == key) {
        return false;
    }
    allowlist.suggestions.push(key.to_string());
    true
}

/// Drop every suggestion whose `key` matches the argument from
/// every tab's behavior state. Used after an "Allow" accept so
/// the suggestion disappears from every open popup, not just the
/// tab it was accepted on. Returns the list of tab_ids whose
/// state actually changed (so the caller can trigger badge
/// updates per-tab without spurious refreshes).
pub fn drop_suggestion_across_tabs<'a>(
    tab_states: impl Iterator<Item = (&'a i32, &'a mut BehaviorState)>,
    key: &str,
) -> Vec<i32> {
    if key.is_empty() {
        return Vec::new();
    }
    let mut mutated = Vec::new();
    for (tab_id, state) in tab_states {
        let before = state.suggestions.len();
        state.suggestions.retain(|s| s.key != key);
        if state.suggestions.len() != before {
            mutated.push(*tab_id);
        }
    }
    mutated
}

/// Union the broken-selector sets from any number of per-tab
/// `BrokenSelectors` into one deduplicated `BrokenSelectors`.
/// Order within each bucket is first-seen (stable across wakes
/// given deterministic iteration over the input).
pub fn union_broken_selectors<'a, I>(entries: I) -> BrokenSelectors
where
    I: IntoIterator<Item = &'a BrokenSelectors>,
{
    let mut out = BrokenSelectors::default();
    for entry in entries {
        for sel in &entry.remove {
            if !out.remove.contains(sel) {
                out.remove.push(sel.clone());
            }
        }
        for sel in &entry.hide {
            if !out.hide.contains(sel) {
                out.hide.push(sel.clone());
            }
        }
        for sel in &entry.allow {
            if !out.allow.contains(sel) {
                out.allow.push(sel.clone());
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Suggestion, SuggestionDiag, SuggestionLayer};
    use std::sync::Arc;

    fn mk_suggestion(key: &str) -> Suggestion {
        Suggestion {
            key: key.to_string(),
            layer: SuggestionLayer::Block,
            value: "||example.com".to_string(),
            reason: "test".to_string(),
            confidence: 50,
            count: 1,
            evidence: Vec::new(),
            from_iframe: false,
            frame_hostname: None,
            diag: SuggestionDiag {
                value: "||example.com".to_string(),
                layer: SuggestionLayer::Block,
                tab_hostname: "example.com".to_string(),
                frame_hostname: String::new(),
                is_from_iframe: false,
                matched_key: None,
                config_has_site: false,
                existing_block_count: 0,
                existing_block_sample: Vec::new(),
                dedup_result: "new".to_string(),
            },
            learn: String::new(),
            kind: "beacon".to_string(),
        }
    }

    // ---- push_capped -------------------------------------------

    #[test]
    fn push_capped_below_cap_no_evictions() {
        let mut d: VecDeque<i32> = VecDeque::new();
        assert_eq!(push_capped(&mut d, 1, 3), 0);
        assert_eq!(push_capped(&mut d, 2, 3), 0);
        assert_eq!(push_capped(&mut d, 3, 3), 0);
        assert_eq!(d.len(), 3);
    }

    #[test]
    fn push_capped_at_cap_evicts_oldest() {
        let mut d: VecDeque<i32> = VecDeque::from([1, 2, 3]);
        assert_eq!(push_capped(&mut d, 4, 3), 1);
        assert_eq!(d.into_iter().collect::<Vec<_>>(), vec![2, 3, 4]);
    }

    #[test]
    fn push_capped_over_cap_evicts_until_bound() {
        // Start 5 over: the push + 5 evictions brings it back to max.
        let mut d: VecDeque<i32> = VecDeque::from([1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(push_capped(&mut d, 9, 3), 6);
        assert_eq!(d.into_iter().collect::<Vec<_>>(), vec![7, 8, 9]);
    }

    #[test]
    fn push_capped_zero_cap_always_evicts_inserted_too() {
        let mut d: VecDeque<i32> = VecDeque::new();
        assert_eq!(push_capped(&mut d, 1, 0), 1);
        assert!(d.is_empty());
    }

    // ---- apply_dismiss_suggestion -------------------------------

    #[test]
    fn dismiss_records_key_and_removes_matching_suggestion() {
        let mut state = BehaviorState::default();
        state.suggestions.push(mk_suggestion("block::a"));
        state.suggestions.push(mk_suggestion("block::b"));

        let changed = apply_dismiss_suggestion(&mut state, "block::a");
        assert!(changed);
        assert_eq!(state.dismissed, vec!["block::a".to_string()]);
        assert_eq!(state.suggestions.len(), 1);
        assert_eq!(state.suggestions[0].key, "block::b");
    }

    #[test]
    fn dismiss_is_idempotent_on_already_dismissed_key() {
        let mut state = BehaviorState::default();
        state.dismissed.push("block::a".to_string());

        let changed = apply_dismiss_suggestion(&mut state, "block::a");
        assert!(
            !changed,
            "no-op: key already dismissed, no suggestion to remove"
        );
        assert_eq!(state.dismissed.len(), 1, "dismissed list not duplicated");
    }

    #[test]
    fn dismiss_without_matching_suggestion_still_records_key() {
        // Key arrives from the popup for a suggestion that was
        // already removed (e.g. by a sibling detector re-run).
        // Dismissed list grows; suggestions unchanged.
        let mut state = BehaviorState::default();
        state.suggestions.push(mk_suggestion("other"));

        let changed = apply_dismiss_suggestion(&mut state, "block::a");
        assert!(changed);
        assert_eq!(state.dismissed, vec!["block::a".to_string()]);
        assert_eq!(state.suggestions.len(), 1);
        assert_eq!(state.suggestions[0].key, "other");
    }

    #[test]
    fn dismiss_empty_key_is_noop() {
        let mut state = BehaviorState::default();
        state.suggestions.push(mk_suggestion("any"));
        assert!(!apply_dismiss_suggestion(&mut state, ""));
        assert!(state.dismissed.is_empty());
        assert_eq!(state.suggestions.len(), 1);
    }

    // ---- apply_allowlist_add ------------------------------------

    #[test]
    fn allowlist_add_appends_new_key() {
        let mut al = Allowlist::default();
        assert!(apply_allowlist_add(&mut al, "block::a"));
        assert_eq!(al.suggestions, vec!["block::a".to_string()]);
    }

    #[test]
    fn allowlist_add_is_idempotent() {
        let mut al = Allowlist::default();
        al.suggestions.push("block::a".to_string());
        assert!(!apply_allowlist_add(&mut al, "block::a"));
        assert_eq!(al.suggestions.len(), 1);
    }

    #[test]
    fn allowlist_add_preserves_other_fields() {
        let mut al = Allowlist::default();
        al.iframes.push("captcha.com".to_string());
        al.overlays.push(".modal".to_string());
        apply_allowlist_add(&mut al, "block::a");
        assert_eq!(al.iframes, vec!["captcha.com".to_string()]);
        assert_eq!(al.overlays, vec![".modal".to_string()]);
    }

    #[test]
    fn allowlist_add_empty_key_noop() {
        let mut al = Allowlist::default();
        assert!(!apply_allowlist_add(&mut al, ""));
        assert!(al.suggestions.is_empty());
    }

    // ---- drop_suggestion_across_tabs ----------------------------

    #[test]
    fn drop_across_tabs_returns_only_mutated_tabs() {
        let mut a = BehaviorState::default();
        a.suggestions.push(mk_suggestion("target"));
        a.suggestions.push(mk_suggestion("other"));
        let mut b = BehaviorState::default();
        b.suggestions.push(mk_suggestion("target"));
        let mut c = BehaviorState::default();
        c.suggestions.push(mk_suggestion("other"));

        let mut entries: Vec<(i32, BehaviorState)> = vec![(1, a), (2, b), (3, c)];
        let iter = entries.iter_mut().map(|(k, v)| (&*k, v));
        let mutated = drop_suggestion_across_tabs(iter, "target");

        assert_eq!(mutated, vec![1, 2]);
        assert_eq!(entries[0].1.suggestions.len(), 1); // tab 1: only 'other' left
        assert_eq!(entries[0].1.suggestions[0].key, "other");
        assert!(entries[1].1.suggestions.is_empty()); // tab 2: both dropped
        assert_eq!(entries[2].1.suggestions.len(), 1); // tab 3: unchanged
    }

    #[test]
    fn drop_across_tabs_empty_key_noop() {
        let mut state = BehaviorState::default();
        state.suggestions.push(mk_suggestion("x"));
        let mut entries = vec![(1, state)];
        let iter = entries.iter_mut().map(|(k, v)| (&*k, v));
        assert!(drop_suggestion_across_tabs(iter, "").is_empty());
        assert_eq!(entries[0].1.suggestions.len(), 1);
    }

    // ---- union_broken_selectors ---------------------------------

    #[test]
    fn union_dedups_across_buckets() {
        let a = BrokenSelectors {
            remove: vec!["bad1".to_string()],
            hide: vec!["bad2".to_string()],
            allow: Vec::new(),
        };
        let b = BrokenSelectors {
            remove: vec!["bad1".to_string(), "bad3".to_string()],
            hide: Vec::new(),
            allow: vec!["bad4".to_string()],
        };
        let out = union_broken_selectors([&a, &b]);
        assert_eq!(out.remove, vec!["bad1".to_string(), "bad3".to_string()]);
        assert_eq!(out.hide, vec!["bad2".to_string()]);
        assert_eq!(out.allow, vec!["bad4".to_string()]);
    }

    #[test]
    fn union_empty_input_returns_empty_sets() {
        let empty: [&BrokenSelectors; 0] = [];
        let out = union_broken_selectors(empty);
        assert!(out.remove.is_empty());
        assert!(out.hide.is_empty());
        assert!(out.allow.is_empty());
    }

    #[test]
    fn union_preserves_first_seen_order_within_each_bucket() {
        let a = BrokenSelectors {
            remove: vec!["z".to_string(), "a".to_string()],
            hide: Vec::new(),
            allow: Vec::new(),
        };
        let b = BrokenSelectors {
            remove: vec!["a".to_string(), "m".to_string()],
            hide: Vec::new(),
            allow: Vec::new(),
        };
        let out = union_broken_selectors([&a, &b]);
        // First-seen order: z, a (from a), then m (new in b).
        assert_eq!(
            out.remove,
            vec!["z".to_string(), "a".to_string(), "m".to_string()]
        );
    }

    // ---- Arc<[String]> imports used in mk_suggestion ------------
    // (purely to silence the unused import warning in release builds
    // while keeping the import available for future tests that need
    // to populate BuildSuggestionInput)
    #[allow(dead_code)]
    fn _keep_arc_in_scope() -> Arc<[String]> {
        Arc::from(Vec::<String>::new())
    }
}
