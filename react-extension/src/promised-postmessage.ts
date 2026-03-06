let uniqueId = 1;

const DEFAULT_TIMEOUT_MS = 4000;

export function promisePostMessage() {
  const messageHandlers: {
    [key: string]: {
      callback: (result: any, error: any) => void;
      timeoutId: number;
    };
  } = {};

  function onMessage(message: MessageEvent) {
    if (message.source !== window) {
      return;
    }

    if (!Array.isArray(message.data)) {
      return;
    }

    const [messageId, result, error] = message.data;
    const item = messageHandlers[messageId];

    if (!item || !result || result.type !== 'react_tracer') {
      return;
    }

    window.clearTimeout(item.timeoutId);
    item.callback(result.payload, error);
    delete messageHandlers[messageId];
  }

  window.addEventListener('message', onMessage);

  return {
    postMessage: (action: string, message?: any, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> => {
      const id = uniqueId++;
      const messageToSend = [
        id,
        {
          type: 'react_content_script',
          action,
          payload: message
        }
      ];

      return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          delete messageHandlers[id];
          reject(new Error(`Timeout waiting for react tracer response for action: ${action}`));
        }, timeoutMs);

        messageHandlers[id] = {
          timeoutId,
          callback: (result, error) => {
            if (error) {
              reject(new Error(error));
              return;
            }

            resolve(result);
          }
        };

        window.postMessage(messageToSend, '*');
      });
    }
  };
}
