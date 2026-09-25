//! Settings page: the upvote strings, one per line.

use crate::chrome;
use crate::rules;
use leptos::prelude::*;
use leptos::task::spawn_local;

#[component]
pub fn Options() -> impl IntoView {
    let text = RwSignal::new(String::new());
    let message = RwSignal::new(String::new());

    spawn_local(async move {
        match chrome::load_upvote_strings().await {
            Ok(strings) => text.set(strings.join("\n")),
            Err(e) => message.set(chrome::error_text(&e)),
        }
    });

    let on_save = move |_| {
        spawn_local(async move {
            let strings = rules::parse_strings(&text.get_untracked());
            match chrome::save_upvote_strings(&strings).await {
                Ok(()) => {
                    text.set(strings.join("\n"));
                    message.set(format!("Saved {} strings.", strings.len()));
                }
                Err(e) => message.set(chrome::error_text(&e)),
            }
        });
    };

    view! {
        <h1>"upit settings"</h1>
        <label for="strings">
            "Upvote strings, one per line. A post whose title or text contains one of them (ignoring case) starts on Up in the panel. Every other post starts on Down."
        </label>
        <textarea
            id="strings"
            rows="12"
            prop:value=move || text.get()
            on:input=move |ev| text.set(event_target_value(&ev))
        ></textarea>
        <div>
            <button on:click=on_save>"Save"</button>
            <span class="message">{move || message.get()}</span>
        </div>
    }
}
