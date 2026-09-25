//! Side panel: collect posts from the Reddit tab, let the user set each
//! one to up / down / skip, then cast the chosen votes one at a time with
//! a random wait between them.

use crate::chrome;
use crate::rules::{self, Post, Vote};
use leptos::prelude::*;
use leptos::task::spawn_local;

#[derive(Debug, Clone, PartialEq)]
enum Status {
    Idle,
    Waiting,
    Sent,
    Failed(String),
}

#[derive(Clone)]
struct Row {
    post: Post,
    vote: RwSignal<Vote>,
    status: RwSignal<Status>,
}

#[component]
pub fn Panel() -> impl IntoView {
    let rows = RwSignal::new(Vec::<Row>::new());
    let tab_id = RwSignal::new(None::<i32>);
    let message = RwSignal::new(String::from("Open r/vmware in this tab."));
    let sending = RwSignal::new(false);

    // Appends the posts from tab `id` the panel does not list yet. Dropped
    // if the user switched tabs meanwhile. Upvote strings are read each
    // time so a saved change applies to the next posts.
    let add_posts = move |id: i32, posts: Vec<Post>| {
        spawn_local(async move {
            let strings = match chrome::load_upvote_strings().await {
                Ok(strings) => strings,
                Err(e) => {
                    message.set(chrome::error_text(&e));
                    return;
                }
            };
            if tab_id.get_untracked() != Some(id) {
                return;
            }
            let known: Vec<String> = rows.with_untracked(|r| r.iter().map(|row| row.post.permalink.clone()).collect());
            let new_rows: Vec<Row> = rules::pick(posts, &known)
                .into_iter()
                .map(|post| Row {
                    vote: RwSignal::new(rules::suggest(&post, &strings)),
                    status: RwSignal::new(Status::Idle),
                    post,
                })
                .collect();
            rows.update(|r| r.extend(new_rows));
            if !sending.get_untracked() {
                let count = rows.with_untracked(Vec::len);
                message.set(format!("{count} posts from {} in the list.", rules::SUBREDDIT));
            }
        });
    };

    // Lists the active tab. Runs when the panel opens, on every tab switch,
    // and after a send. Does nothing while sending, or when the active tab
    // is already the listed one, so votes you have set are kept.
    let show_active_tab = move || {
        if sending.get_untracked() {
            return;
        }
        spawn_local(async move {
            let id = match chrome::active_tab_id().await {
                Ok(id) => id,
                Err(e) => {
                    message.set(chrome::error_text(&e));
                    return;
                }
            };
            if tab_id.get_untracked() == Some(id) {
                return;
            }
            tab_id.set(Some(id));
            rows.set(Vec::new());
            match chrome::collect(id).await {
                Ok(posts) => add_posts(id, posts),
                Err(e) => message.set(chrome::error_text(&e)),
            }
        });
    };

    // Posts the content script pushes while you scroll. Only the listed
    // (active) tab counts.
    let listening = chrome::on_posts(move |id, posts| {
        if tab_id.get_untracked() == Some(id) {
            add_posts(id, posts);
        }
    })
    .and_then(|()| chrome::on_tab_switch(show_active_tab));
    if let Err(e) = listening {
        message.set(chrome::error_text(&e));
    }
    show_active_tab();

    let on_submit = move |_| {
        let Some(id) = tab_id.get_untracked() else { return };
        let chosen: Vec<Row> = rows
            .get_untracked()
            .into_iter()
            .filter(|r| r.vote.get_untracked() != Vote::Skip && r.status.get_untracked() != Status::Sent)
            .collect();
        if chosen.is_empty() {
            message.set("No votes set. Every post is on skip.".into());
            return;
        }
        for row in &chosen {
            row.status.set(Status::Waiting);
        }
        sending.set(true);
        message.set("Sending. Keep this panel and the Reddit tab open.".into());
        spawn_local(async move {
            for (i, row) in chosen.iter().enumerate() {
                if i > 0 {
                    let random = match chrome::random_unit() {
                        Ok(r) => r,
                        Err(e) => {
                            message.set(format!("Stopped: {}", chrome::error_text(&e)));
                            sending.set(false);
                            return;
                        }
                    };
                    let mut left = rules::wait_ms(random).div_ceil(1000);
                    while left > 0 {
                        message.set(format!(
                            "Next vote in {left}s ({} of {} done). Keep this panel and the Reddit tab open.",
                            i,
                            chosen.len()
                        ));
                        chrome::sleep_ms(1000).await;
                        left -= 1;
                    }
                }
                let Some(button) = row.vote.get_untracked().button() else { continue };
                let status = match chrome::vote(id, &row.post.permalink, button).await {
                    Ok(()) => Status::Sent,
                    Err(e) => Status::Failed(chrome::error_text(&e)),
                };
                row.status.set(status);
            }
            sending.set(false);
            message.set("Done.".into());
            show_active_tab();
        });
    };

    view! {
        <div class="toolbar">
            <button class="submit" on:click=on_submit disabled=move || sending.get() || rows.with(Vec::is_empty)>
                "Submit"
            </button>
        </div>
        <p class="message">{move || message.get()}</p>
        <ul class="posts">
            <For
                each=move || rows.get()
                key=|row| row.post.permalink.clone()
                children=move |row| view! { <PostRow row=row sending=sending /> }
            />
        </ul>
    }
}

#[component]
fn PostRow(row: Row, sending: RwSignal<bool>) -> impl IntoView {
    let Row { post, vote, status } = row;
    let href = format!("https://www.reddit.com{}", post.permalink);
    let snippet: String = post.body.chars().take(200).collect();
    let pick = move |v: Vote| move |_| vote.set(v);
    let class_for = move |v: Vote| move || if vote.get() == v { "on" } else { "" };
    let locked = move || sending.get() || status.get() == Status::Sent;

    view! {
        <li>
            <a class="title" href=href target="_blank">{post.title.clone()}</a>
            <div class="meta">{format!("{} points", post.score)}</div>
            <div class="snippet">{snippet}</div>
            <div class="votes">
                <button class=class_for(Vote::Up) on:click=pick(Vote::Up) disabled=locked>"Up"</button>
                <button class=class_for(Vote::Down) on:click=pick(Vote::Down) disabled=locked>"Down"</button>
                <button class=class_for(Vote::Skip) on:click=pick(Vote::Skip) disabled=locked>"Skip"</button>
                <span class="status">
                    {move || match status.get() {
                        Status::Idle => String::new(),
                        Status::Waiting => "waiting".into(),
                        Status::Sent => "sent".into(),
                        Status::Failed(e) => format!("failed: {e}"),
                    }}
                </span>
            </div>
        </li>
    }
}
