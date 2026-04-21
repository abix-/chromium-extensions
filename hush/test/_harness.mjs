// Shared test harness for mainworld.js behavior tests.
//
// Builds a Node vm context with the minimum DOM + Web API stubs
// mainworld needs to install every hook it shipped, runs
// mainworld.js in that context, and returns handles for the
// tests to reach into.
//
// Consumers:
//   - emit_contract.test.mjs  -- asserts the shape of what each
//     hook emits into window.__hush_stub_q__.
//   - kill_switch.test.mjs    -- asserts the always-on spoof
//     branches (sendbeacon, clipboard-read, bluetooth, usb, hid,
//     serial) return spec-compliant denial values when their kind
//     tag is present in `document.documentElement.dataset.hushSpoof`.

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainworldSource = readFileSync(
  resolve(__dirname, "..", "mainworld.js"),
  "utf8"
);

export function makeContext() {
  class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  }

  // EventTarget.prototype.addEventListener is hooked by mainworld, and
  // the hook checks `this === document` / `this === window`. To exercise
  // that path, document and window must inherit from EventTarget.prototype
  // so calls on them dispatch through the hooked prototype method.
  class EventTarget {
    addEventListener() {}
    removeEventListener() {}
  }

  // document needs a documentElement.dataset so mainworld's
  // hasSpoofTag / datasetFilters helpers can read hushSpoof,
  // hushNeuter, hushSilence at hook call time.
  const documentElement = {
    dataset: {},
  };
  const document = Object.create(EventTarget.prototype);
  Object.assign(document, {
    readyState: "complete",
    documentElement,
    dispatchEvent() {
      return true;
    },
  });

  class HTMLCanvasElement {
    constructor(opts) {
      opts = opts || {};
      this.id = opts.id || "";
      this.className = opts.className || "";
      this._rect = opts.rect || { x: 0, y: 0, width: 300, height: 150 };
      this._cs = opts.computedStyle || {};
    }
    toDataURL() {
      return "data:image/png;base64,";
    }
    toBlob(cb) {
      if (cb) cb(null);
    }
    getBoundingClientRect() {
      const r = this._rect;
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        left: r.x,
        top: r.y,
        right: r.x + r.width,
        bottom: r.y + r.height,
      };
    }
  }
  class CanvasRenderingContext2D {
    constructor(canvas) {
      this.canvas = canvas || new HTMLCanvasElement();
      this.font = "10px sans-serif";
    }
    getImageData() {
      return { data: new Uint8ClampedArray(4) };
    }
    measureText() {
      return { width: 0 };
    }
    fillRect() {}
    strokeRect() {}
    clearRect() {}
    drawImage() {}
    fill() {}
    stroke() {}
    putImageData() {}
  }
  class WebGLRenderingContext {
    getParameter() {
      return null;
    }
  }
  class WebGL2RenderingContext {
    getParameter() {
      return null;
    }
  }
  class OfflineAudioContext {
    constructor(channels, length, sampleRate) {
      this.channels = channels;
      this.numberOfChannels = channels;
      this.length = length;
      this.sampleRate = sampleRate;
    }
    // Real-rendering marker so tests can distinguish the spoof
    // path (silent buffer via createBuffer) from the original path.
    startRendering() {
      return Promise.resolve({
        __marker: "REAL_RENDERING",
        numberOfChannels: this.numberOfChannels,
        length: this.length,
        sampleRate: this.sampleRate,
      });
    }
    // mainworld's audio spoof calls `this.createBuffer(...)` to
    // synthesize a silent AudioBuffer.
    createBuffer(numberOfChannels, length, sampleRate) {
      return {
        numberOfChannels,
        length,
        sampleRate,
        getChannelData() {
          return new Float32Array(length);
        },
      };
    }
  }
  class XMLHttpRequest {
    open(method, url) {
      this._method = method;
      this._url = url;
    }
    send() {}
  }
  class WebSocket {
    constructor(url) {
      this.url = url || "wss://stub/";
    }
    send() {}
  }

  // Clipboard + device-probe API stubs. mainworld's typeof-guard checks
  // skip hook installation when these are absent; we provide them so
  // every hook gets installed and tests can cover all six kill-switch
  // branches (sendbeacon, clipboard-read, bluetooth, usb, hid, serial).
  //
  // `originalCalled` counters let tests prove the original
  // implementation was (or wasn't) invoked, independent of what the
  // hook returned.
  const originalCalled = {
    sendBeacon: 0,
    clipboardRead: 0,
    bluetoothRequest: 0,
    usbRequest: 0,
    hidRequest: 0,
    serialRequest: 0,
  };

  // ImageData stub: mainworld's canvas spoof returns `new ImageData(w, h)`
  // when hushSpoof tag is 'canvas'. Supports both ImageData(w, h) and
  // ImageData(data, w, h) signatures per the spec.
  class ImageData {
    constructor(widthOrData, heightOrWidth, maybeHeight) {
      if (typeof widthOrData === "number") {
        this.width = widthOrData;
        this.height = heightOrWidth;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = widthOrData;
        this.width = heightOrWidth;
        this.height = maybeHeight;
      }
    }
  }

  class Clipboard {
    readText() {
      originalCalled.clipboardRead += 1;
      return Promise.resolve("ORIGINAL_CLIPBOARD_TEXT");
    }
    writeText() {
      return Promise.resolve();
    }
  }
  class Bluetooth {
    requestDevice() {
      originalCalled.bluetoothRequest += 1;
      return Promise.resolve({ id: "real-bluetooth-device" });
    }
  }
  class USB {
    requestDevice() {
      originalCalled.usbRequest += 1;
      return Promise.resolve({ id: "real-usb-device" });
    }
  }
  class HID {
    requestDevice() {
      originalCalled.hidRequest += 1;
      return Promise.resolve([{ id: "real-hid-device" }]);
    }
  }
  class Serial {
    requestPort() {
      originalCalled.serialRequest += 1;
      return Promise.resolve({ id: "real-serial-port" });
    }
  }

  const navigator = {
    sendBeacon(url, body) {
      originalCalled.sendBeacon += 1;
      return true;
    },
    clipboard: new Clipboard(),
    bluetooth: new Bluetooth(),
    usb: new USB(),
    hid: new HID(),
    serial: new Serial(),
  };

  async function fetchStub() {
    return { ok: true };
  }

  // window also inherits from EventTarget.prototype so `this === window`
  // checks inside the addEventListener hook evaluate correctly.
  const window = Object.create(EventTarget.prototype);
  Object.assign(window, {
    fetch: fetchStub,
    innerWidth: 1280,
    innerHeight: 800,
    HTMLCanvasElement,
    CanvasRenderingContext2D,
    WebGLRenderingContext,
    WebGL2RenderingContext,
    OfflineAudioContext,
    XMLHttpRequest,
    WebSocket,
    EventTarget,
    CustomEvent,
    ImageData,
    Clipboard,
    Bluetooth,
    USB,
    HID,
    Serial,
    DOMException,
    document,
    navigator,
    getComputedStyle(el) {
      return (
        (el && el._cs) || {
          display: "block",
          visibility: "visible",
          opacity: "1",
        }
      );
    },
  });

  const ctx = {
    window,
    document,
    navigator,
    CustomEvent,
    HTMLCanvasElement,
    CanvasRenderingContext2D,
    WebGLRenderingContext,
    WebGL2RenderingContext,
    OfflineAudioContext,
    XMLHttpRequest,
    WebSocket,
    EventTarget,
    ImageData,
    Clipboard,
    Bluetooth,
    USB,
    HID,
    Serial,
    DOMException,
    Uint8ClampedArray,
    Uint8Array,
    fetch: fetchStub,
    setTimeout,
    clearTimeout,
    Reflect,
    Date,
    Error,
    Array,
    ArrayBuffer,
    Promise,
    FormData: class FormData {
      [Symbol.iterator]() {
        return [][Symbol.iterator]();
      }
    },
    URLSearchParams: class URLSearchParams {
      toString() {
        return "";
      }
    },
    Blob: class Blob {
      constructor(parts, options) {
        this.type = (options && options.type) || "";
        this.size = 0;
      }
    },
    console,
  };
  ctx.globalThis = ctx;

  vm.createContext(ctx);
  vm.runInContext(mainworldSource, ctx);

  const captured = ctx.window.__hush_stub_q__ || [];
  return { ctx, captured, originalCalled };
}
