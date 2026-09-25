//! upit: review Reddit posts in Chrome's side panel and cast the votes
//! you pick. The panel and settings page are Leptos; `content.js` reads
//! posts off the page and clicks Reddit's own vote buttons.

mod chrome;
mod options;
mod panel;
pub mod rules;

use leptos::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

fn root(id: &str) -> Result<web_sys::HtmlElement, JsValue> {
    web_sys::window()
        .and_then(|w| w.document())
        .and_then(|d| d.get_element_by_id(id))
        .ok_or_else(|| JsValue::from_str(&format!("no #{id} on the page")))?
        .dyn_into::<web_sys::HtmlElement>()
        .map_err(|_| JsValue::from_str(&format!("#{id} is not an HtmlElement")))
}

fn init() {
    #[cfg(feature = "panic-hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen(js_name = "upitPanelMain")]
pub fn panel_main() -> Result<(), JsValue> {
    init();
    std::mem::forget(leptos::mount::mount_to(root("upit-root")?, || {
        view! { <panel::Panel /> }
    }));
    Ok(())
}

#[wasm_bindgen(js_name = "upitOptionsMain")]
pub fn options_main() -> Result<(), JsValue> {
    init();
    std::mem::forget(leptos::mount::mount_to(root("upit-root")?, || {
        view! { <options::Options /> }
    }));
    Ok(())
}
