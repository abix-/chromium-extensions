//! Thin async wrappers over the `chrome.*` calls upit needs, resolved
//! through `js_sys::Reflect` the same way hush's `chrome_bridge` does.

use crate::rules::Post;
use js_sys::{Array, Function, Object, Promise, Reflect};
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

const STRINGS_KEY: &str = "upvoteStrings";

fn get(target: &JsValue, key: &str) -> Result<JsValue, JsValue> {
    Reflect::get(target, &JsValue::from_str(key))
}

fn chrome_path(path: &[&str]) -> Result<JsValue, JsValue> {
    let window = web_sys::window().ok_or_else(|| JsValue::from_str("no window"))?;
    let mut value = get(&window, "chrome")?;
    for key in path {
        value = get(&value, key)?;
    }
    Ok(value)
}

/// Call `chrome.<namespace>.<method>(args...)` and await its Promise.
async fn call(namespace: &[&str], method: &str, args: &Array) -> Result<JsValue, JsValue> {
    let this = chrome_path(namespace)?;
    let func: Function = get(&this, method)?
        .dyn_into()
        .map_err(|_| JsValue::from_str(&format!("chrome.{}.{method} is not a function", namespace.join("."))))?;
    let promise: Promise = func
        .apply(&this, args)?
        .dyn_into()
        .map_err(|_| JsValue::from_str(&format!("chrome.{}.{method} did not return a Promise", namespace.join("."))))?;
    JsFuture::from(promise).await
}

pub async fn load_upvote_strings() -> Result<Vec<String>, JsValue> {
    let reply = call(&["storage", "local"], "get", &Array::of1(&JsValue::from_str(STRINGS_KEY))).await?;
    let stored = get(&reply, STRINGS_KEY)?;
    if stored.is_undefined() || stored.is_null() {
        return Ok(Vec::new());
    }
    serde_wasm_bindgen::from_value(stored).map_err(|e| JsValue::from_str(&format!("stored upvote strings: {e}")))
}

pub async fn save_upvote_strings(strings: &[String]) -> Result<(), JsValue> {
    let items = Object::new();
    let value = serde_wasm_bindgen::to_value(strings).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Reflect::set(&items, &JsValue::from_str(STRINGS_KEY), &value)?;
    call(&["storage", "local"], "set", &Array::of1(&items)).await?;
    Ok(())
}

/// Tab id of the active tab in the window the panel belongs to.
pub async fn active_tab_id() -> Result<i32, JsValue> {
    let query = Object::new();
    Reflect::set(&query, &JsValue::from_str("active"), &JsValue::TRUE)?;
    Reflect::set(&query, &JsValue::from_str("currentWindow"), &JsValue::TRUE)?;
    let tabs: Array = call(&["tabs"], "query", &Array::of1(&query)).await?.dyn_into()?;
    get(&tabs.get(0), "id")?
        .as_f64()
        .map(|id| id as i32)
        .ok_or_else(|| JsValue::from_str("no active tab"))
}

async fn send_to_tab<M: Serialize, R: for<'de> Deserialize<'de>>(tab_id: i32, msg: &M) -> Result<R, JsValue> {
    let payload = serde_wasm_bindgen::to_value(msg).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let reply = call(&["tabs"], "sendMessage", &Array::of2(&JsValue::from(tab_id), &payload))
        .await
        .map_err(|_| JsValue::from_str("the tab did not answer; open a www.reddit.com page and reload it"))?;
    serde_wasm_bindgen::from_value(reply).map_err(|e| JsValue::from_str(&format!("reply from tab: {e}")))
}

#[derive(Serialize)]
struct CollectMsg {
    #[serde(rename = "type")]
    type_: &'static str,
}

#[derive(Deserialize)]
struct CollectReply {
    posts: Vec<Post>,
}

pub async fn collect(tab_id: i32) -> Result<Vec<Post>, JsValue> {
    let reply: CollectReply = send_to_tab(tab_id, &CollectMsg { type_: "upit:collect" }).await?;
    Ok(reply.posts)
}

#[derive(Serialize)]
struct VoteMsg<'a> {
    #[serde(rename = "type")]
    type_: &'static str,
    permalink: &'a str,
    button: &'a str,
}

#[derive(Deserialize)]
struct VoteReply {
    ok: bool,
    #[serde(default)]
    error: String,
}

pub async fn vote(tab_id: i32, permalink: &str, button: &str) -> Result<(), JsValue> {
    let reply: VoteReply = send_to_tab(
        tab_id,
        &VoteMsg {
            type_: "upit:vote",
            permalink,
            button,
        },
    )
    .await?;
    if reply.ok { Ok(()) } else { Err(JsValue::from_str(&reply.error)) }
}

#[derive(Deserialize)]
struct PostsMsg {
    #[serde(rename = "type")]
    type_: String,
    #[serde(default)]
    posts: Vec<Post>,
}

/// Call `handler(tab_id, posts)` for every `upit:posts` message a
/// content script sends. Lives as long as the page.
pub fn on_posts(handler: impl Fn(i32, Vec<Post>) + 'static) -> Result<(), JsValue> {
    let listener = Closure::<dyn Fn(JsValue, JsValue)>::new(move |msg: JsValue, sender: JsValue| {
        let Ok(msg) = serde_wasm_bindgen::from_value::<PostsMsg>(msg) else { return };
        if msg.type_ != "upit:posts" {
            return;
        }
        let tab_id = get(&sender, "tab").and_then(|tab| get(&tab, "id")).ok().and_then(|id| id.as_f64());
        if let Some(tab_id) = tab_id {
            handler(tab_id as i32, msg.posts);
        }
    });
    let on_message = chrome_path(&["runtime", "onMessage"])?;
    let add: Function = get(&on_message, "addListener")?
        .dyn_into()
        .map_err(|_| JsValue::from_str("chrome.runtime.onMessage.addListener is not a function"))?;
    add.call1(&on_message, listener.as_ref())?;
    listener.forget();
    Ok(())
}

/// Call `handler()` whenever the user switches tabs, in any window.
pub fn on_tab_switch(handler: impl Fn() + 'static) -> Result<(), JsValue> {
    let listener = Closure::<dyn Fn()>::new(handler);
    let on_activated = chrome_path(&["tabs", "onActivated"])?;
    let add: Function = get(&on_activated, "addListener")?
        .dyn_into()
        .map_err(|_| JsValue::from_str("chrome.tabs.onActivated.addListener is not a function"))?;
    add.call1(&on_activated, listener.as_ref())?;
    listener.forget();
    Ok(())
}

pub async fn sleep_ms(ms: u32) {
    let promise = Promise::new(&mut |resolve, _reject| {
        if let Some(window) = web_sys::window() {
            let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(&resolve, ms as i32);
        }
    });
    let _ = JsFuture::from(promise).await;
}

/// Random number in [0, 1) from `crypto.getRandomValues`.
pub fn random_unit() -> Result<f64, JsValue> {
    let window = web_sys::window().ok_or_else(|| JsValue::from_str("no window"))?;
    let mut bytes = [0u8; 4];
    window.crypto()?.get_random_values_with_u8_array(&mut bytes)?;
    Ok(f64::from(u32::from_le_bytes(bytes)) / 4_294_967_296.0)
}

/// Error text for the panel.
pub fn error_text(err: &JsValue) -> String {
    err.as_string().unwrap_or_else(|| format!("{err:?}"))
}
