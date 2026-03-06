import { promisePostMessage } from './promised-postmessage';

const promisedPostMessage = promisePostMessage();
const LOG_PREFIX = '[react-outliner/content]';

function log(...args: any[]) {
  console.log(LOG_PREFIX, ...args);
}

const script = document.createElement('script');
script.src = chrome.runtime.getURL('js/react-tracer.js');
(document.head || document.documentElement).appendChild(script);

script.onload = () => {
  log('Injected page tracer script', { src: script.src, url: location.href });
  script.remove();
};

script.onerror = () => {
  log('Failed to inject page tracer script', { src: script.src, url: location.href });
};

const HANDLERS: Record<string, (payload?: any) => Promise<any>> = {
  findReactComponents: () => promisedPostMessage.postMessage('findReactComponents'),
  togglePrefix: payload => promisedPostMessage.postMessage('togglePrefix', payload),
  pingReactTracer: () => promisedPostMessage.postMessage('ping')
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = HANDLERS[msg.type];

  if (!handler) {
    sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
    return false;
  }

  log('Received popup message', { type: msg.type });

  handler(msg.payload)
    .then(result => {
      log('Forwarded popup message successfully', { type: msg.type });
      sendResponse(result);
    })
    .catch(error => {
      log('Popup message forwarding failed', { type: msg.type, error: error?.message || String(error) });
      sendResponse({ ok: false, error: error?.message || String(error) });
    });

  return true;
});
