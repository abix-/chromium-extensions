//! Script-origin extraction from V8 stack frames.
//!
//! The main-world hooks capture a call-stack as an array of strings;
//! each frame looks like
//! `  at name (https://cdn.example.com/tracker.js:10:5)`.
//! To attribute an observation to the script that fired it, find the
//! first frame whose URL has an http/https anchor and parse its host.
//!
//! Hush's own frames are `chrome-extension://<id>/mainworld.js`.
//! they carry no http/https anchor, so [`extract_host`] returns
//! `None` for them naturally and they're skipped without a
//! dedicated filename check. A prior substring filter on
//! `"mainworld.js"` also mis-skipped any page that hosted its own
//! file by that name; removed here.
//!
//! URL parsing goes through the `url` crate so punycode/IDN/encoded
//! hosts are handled correctly. Empty or unparseable input returns an
//! empty string; caller treats that as "unknown script."

use url::Url;

/// Given a stack captured by the main-world hook, return the hostname
/// of the first http/https script frame. Returns empty string when no
/// parseable frame is found.
pub fn script_origin_from_stack<S: AsRef<str>>(stack: &[S]) -> String {
    for frame in stack {
        let frame = frame.as_ref();
        if let Some(host) = extract_host(frame) {
            return host;
        }
    }
    String::new()
}

/// Pull the first http/https URL out of a frame string and return its
/// host. None when no URL is present or the substring isn't parseable.
fn extract_host(frame: &str) -> Option<String> {
    let http_idx = frame.find("http://");
    let https_idx = frame.find("https://");
    let start = match (http_idx, https_idx) {
        (Some(a), Some(b)) => a.min(b),
        (Some(a), None) => a,
        (None, Some(b)) => b,
        (None, None) => return None,
    };
    let rest = &frame[start..];
    // URL ends at first whitespace or closing paren (V8 wraps URLs in
    // parens for named frames).
    let end = rest
        .find(|c: char| c == ')' || c.is_whitespace())
        .unwrap_or(rest.len());
    let candidate = &rest[..end];
    // V8 appends `:line:col` to every URL. `url::Url` parses that fine
    // as part of the path/port segment - we only read `.host_str()`,
    // which is unaffected.
    Url::parse(candidate)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_from_typical_v8_frame() {
        let frame = "    at emitBeacon (https://cdn.example.com/tracker.js:10:5)";
        assert_eq!(extract_host(frame).as_deref(), Some("cdn.example.com"));
    }

    #[test]
    fn extract_handles_http_and_https() {
        assert_eq!(
            extract_host("    at x (http://plain.test/a.js:1:1)").as_deref(),
            Some("plain.test")
        );
    }

    #[test]
    fn hush_extension_frames_are_skipped_by_anchor_miss() {
        // Hush's own `chrome-extension://<id>/mainworld.js` frames
        // carry no http/https anchor, so extract_host returns None
        // and the frame is skipped without a filename-based check.
        let stack = vec![
            "    at emit (chrome-extension://abcdef/mainworld.js:80:3)",
            "    at fingerprint (https://trackers.test/fp.js:20:8)",
            "    at main (https://site.test/app.js:5:1)",
        ];
        assert_eq!(script_origin_from_stack(&stack), "trackers.test");
    }

    #[test]
    fn site_hosted_mainworld_js_is_not_mistaken_for_hush() {
        // Regression lock: a page that hosts its own `mainworld.js`
        // at an http/https URL is a legitimate calling origin. The
        // old substring filter skipped these too and returned the
        // wrong origin.
        let stack = vec![
            "    at emit (https://site.test/mainworld.js:80:3)",
            "    at main (https://site.test/app.js:5:1)",
        ];
        assert_eq!(script_origin_from_stack(&stack), "site.test");
    }

    #[test]
    fn empty_stack_returns_empty() {
        let stack: Vec<&str> = vec![];
        assert_eq!(script_origin_from_stack(&stack), "");
    }

    #[test]
    fn all_extension_frames_return_empty() {
        let stack = vec!["at emit (chrome-extension://abc/mainworld.js:1:1)"];
        assert_eq!(script_origin_from_stack(&stack), "");
    }

    #[test]
    fn frame_without_url_is_skipped() {
        let stack = vec![
            "    at [native code]",
            "    at realFrame (https://good.test/a.js:1:1)",
        ];
        assert_eq!(script_origin_from_stack(&stack), "good.test");
    }

    #[test]
    fn punycode_host_returns_ascii_form() {
        // url crate normalizes to ASCII; we get the xn--... back.
        let frame = "at fn (https://xn--bcher-kva.example/a.js:1:1)";
        assert_eq!(
            extract_host(frame).as_deref(),
            Some("xn--bcher-kva.example")
        );
    }

    // Cross-language contract test. The JSON fixture is shared
    // with `hush/test/stack_origin.test.mjs`; both tests iterate
    // over it and assert the same `expected` host for each case.
    // Adding a case here runs it in both languages. Drift between
    // Rust and JS implementations becomes a failing test in the
    // language that drifted.
    #[test]
    fn fixture_cases_match_expected() {
        use serde::Deserialize;

        #[derive(Deserialize)]
        struct Case {
            name: String,
            stack: Vec<String>,
            expected: String,
        }
        #[derive(Deserialize)]
        struct Fixture {
            cases: Vec<Case>,
        }

        let raw = include_str!("../test/stack_fixtures.json");
        let fx: Fixture = serde_json::from_str(raw).expect("fixture parses");
        assert!(!fx.cases.is_empty(), "fixture has at least one case");

        for case in fx.cases {
            let got = script_origin_from_stack(&case.stack);
            assert_eq!(
                got, case.expected,
                "fixture case `{}`: Rust returned `{}`, expected `{}`",
                case.name, got, case.expected
            );
        }
    }
}
