//! Which posts go in the panel and what vote each one starts on.
//! Pure Rust, no browser calls, so `cargo test` covers it natively.

use serde::{Deserialize, Serialize};

/// Subreddit upit collects from, as Reddit writes it in
/// `subreddit-prefixed-name`.
pub const SUBREDDIT: &str = "r/vmware";
/// Random wait between two votes, inclusive.
pub const WAIT_MIN_MS: u32 = 3_000;
pub const WAIT_MAX_MS: u32 = 30_000;

/// One post as the content script reads it off the page.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Post {
    pub permalink: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    pub subreddit: String,
    #[serde(default)]
    pub score: i64,
    /// `vote-type` attribute: "upvote", "downvote", or empty when the
    /// user has not voted.
    #[serde(default)]
    pub vote_type: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Vote {
    Up,
    Down,
    Skip,
}

impl Vote {
    /// Attribute name of Reddit's vote button for this vote.
    /// `None` for Skip: nothing is sent.
    pub fn button(self) -> Option<&'static str> {
        match self {
            Vote::Up => Some("upvote"),
            Vote::Down => Some("downvote"),
            Vote::Skip => None,
        }
    }
}

/// Up when the title or post text contains any upvote string
/// (ignoring case), otherwise Down.
pub fn suggest(post: &Post, upvote_strings: &[String]) -> Vote {
    let title = post.title.to_lowercase();
    let body = post.body.to_lowercase();
    let hit = upvote_strings.iter().any(|s| {
        let s = s.trim().to_lowercase();
        !s.is_empty() && (title.contains(&s) || body.contains(&s))
    });
    if hit { Vote::Up } else { Vote::Down }
}

/// Posts from `SUBREDDIT` the user has not voted on yet and the panel
/// does not already list (`known` permalinks), in page order, without
/// repeats.
pub fn pick(posts: Vec<Post>, known: &[String]) -> Vec<Post> {
    let mut picked: Vec<Post> = Vec::new();
    for post in posts {
        let wanted = post.subreddit.eq_ignore_ascii_case(SUBREDDIT)
            && post.vote_type.is_empty()
            && !post.permalink.is_empty()
            && !known.contains(&post.permalink)
            && !picked.iter().any(|p| p.permalink == post.permalink);
        if wanted {
            picked.push(post);
        }
    }
    picked
}

/// Wait before the next vote. `random` is in [0, 1), as from
/// `Math.random()`.
pub fn wait_ms(random: f64) -> u32 {
    let span = f64::from(WAIT_MAX_MS - WAIT_MIN_MS + 1);
    (WAIT_MIN_MS + (random * span) as u32).min(WAIT_MAX_MS)
}

/// One upvote string per line, blank lines dropped.
pub fn parse_strings(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn post(permalink: &str, title: &str, subreddit: &str, vote_type: &str) -> Post {
        Post {
            permalink: permalink.into(),
            title: title.into(),
            body: String::new(),
            subreddit: subreddit.into(),
            score: 0,
            vote_type: vote_type.into(),
        }
    }

    fn strings() -> Vec<String> {
        vec!["esxi".to_string(), "powercli".to_string()]
    }

    #[test]
    fn title_match_ignores_case() {
        let p = post("/a", "ESXi host keeps disconnecting", "r/vmware", "");
        assert_eq!(suggest(&p, &strings()), Vote::Up);
    }

    #[test]
    fn body_match_suggests_up() {
        let mut p = post("/a", "Automation question", "r/vmware", "");
        p.body = "My PowerCLI script times out".into();
        assert_eq!(suggest(&p, &strings()), Vote::Up);
    }

    #[test]
    fn no_match_suggests_down() {
        let p = post("/a", "Broadcom licensing again", "r/vmware", "");
        assert_eq!(suggest(&p, &strings()), Vote::Down);
    }

    #[test]
    fn no_strings_suggests_down() {
        let p = post("/a", "anything", "r/vmware", "");
        assert_eq!(suggest(&p, &[]), Vote::Down);
    }

    #[test]
    fn blank_strings_never_match() {
        let p = post("/a", "anything", "r/vmware", "");
        assert_eq!(suggest(&p, &["  ".to_string()]), Vote::Down);
    }

    #[test]
    fn pick_keeps_only_unvoted_vmware_posts() {
        let posts = vec![
            post("/a", "a", "r/vmware", ""),
            post("/b", "b", "r/homelab", ""),
            post("/c", "c", "r/vmware", "upvote"),
            post("/a", "a again", "r/vmware", ""),
            post("/d", "d", "r/VMware", ""),
        ];
        let got: Vec<_> = pick(posts, &[]).into_iter().map(|p| p.permalink).collect();
        assert_eq!(got, vec!["/a", "/d"]);
    }

    #[test]
    fn pick_has_no_limit() {
        let posts = (0..25)
            .map(|i| post(&format!("/{i}"), "t", "r/vmware", ""))
            .collect();
        assert_eq!(pick(posts, &[]).len(), 25);
    }

    #[test]
    fn pick_skips_posts_the_panel_already_lists() {
        let posts = vec![post("/a", "a", "r/vmware", ""), post("/b", "b", "r/vmware", "")];
        let got: Vec<_> = pick(posts, &["/a".to_string()]).into_iter().map(|p| p.permalink).collect();
        assert_eq!(got, vec!["/b"]);
    }

    #[test]
    fn wait_stays_in_range() {
        assert_eq!(wait_ms(0.0), WAIT_MIN_MS);
        assert_eq!(wait_ms(0.999_999_999), WAIT_MAX_MS);
        let mid = wait_ms(0.5);
        assert!((WAIT_MIN_MS..=WAIT_MAX_MS).contains(&mid));
    }

    #[test]
    fn parse_strings_drops_blank_lines() {
        assert_eq!(parse_strings("esxi\n\n  powercli  \r\nnsx\n"), vec!["esxi", "powercli", "nsx"]);
    }
}
