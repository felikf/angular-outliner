(function reactOutlinerBootstrap() {
  const TAGS = {
    FunctionComponent: 0,
    ClassComponent: 1,
    HostComponent: 5,
    MemoComponent: 14,
    SimpleMemoComponent: 15,
    ForwardRef: 11
  };

  const overlayState = {
    nodes: [],
    prefixes: [],
    components: [],
    labelPosition: 'topLeft',
    labelMode: 'name',
    coverEnabled: false,
    canvas: null
  };

  function isReactAvailable() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    return Boolean(hook && hook.renderers && hook.renderers.size);
  }

  function getNameFromFiber(fiber) {
    const type = fiber.type || fiber.elementType;
    if (!type) return null;
    if (typeof type === 'string') return type;
    return type.displayName || type.name || fiber.elementType?.displayName || fiber.elementType?.name || null;
  }

  function isComponentFiber(fiber) {
    return [
      TAGS.FunctionComponent,
      TAGS.ClassComponent,
      TAGS.MemoComponent,
      TAGS.SimpleMemoComponent,
      TAGS.ForwardRef
    ].includes(fiber.tag);
  }

  function isMemoizedFiber(fiber) {
    return fiber.tag === TAGS.MemoComponent || fiber.tag === TAGS.SimpleMemoComponent;
  }

  function findHostNode(fiber) {
    let current = fiber;
    while (current) {
      if (current.tag === TAGS.HostComponent && current.stateNode instanceof Element) {
        return current.stateNode;
      }
      if (current.child) {
        const childResult = findHostNode(current.child);
        if (childResult) return childResult;
      }
      current = current.sibling;
    }
    return null;
  }

  function traverseFiber(fiber, parentTreeNode, acc, level = 0) {
    let current = fiber;

    while (current) {
      let nextParent = parentTreeNode;

      if (isComponentFiber(current)) {
        const name = getNameFromFiber(current);
        if (name) {
          const hostElement = findHostNode(current.child);
          if (hostElement) {
            const id = `${name}-${acc.counter++}`;
            const selector = hostElement.tagName.toLowerCase();
            const prefix = selector.split('-')[0] || selector;
            const rect = hostElement.getBoundingClientRect();

            const node = {
              id,
              name,
              selector,
              prefix,
              rect,
              level,
              memoized: isMemoizedFiber(current)
            };

            acc.nodes.push(node);
            acc.componentStats.set(name, {
              name,
              count: (acc.componentStats.get(name)?.count || 0) + 1,
              selectors: Array.from(new Set([...(acc.componentStats.get(name)?.selectors || []), selector])),
              memoized: acc.componentStats.get(name)?.memoized || node.memoized
            });
            acc.prefixStats.set(prefix, (acc.prefixStats.get(prefix) || 0) + 1);

            const treeNode = {
              id,
              name,
              children: [],
              detail: {
                selector: [selector],
                memoized: node.memoized
              }
            };
            parentTreeNode.children.push(treeNode);
            nextParent = treeNode;
          }
        }
      }

      if (current.child) {
        traverseFiber(current.child, nextParent, acc, level + 1);
      }

      current = current.sibling;
    }
  }

  function getRoots() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook?.renderers?.size) return [];

    const roots = [];
    hook.renderers.forEach((_, id) => {
      const rendererRoots = hook.getFiberRoots(id);
      if (rendererRoots?.size) rendererRoots.forEach(root => roots.push(root));
    });

    return roots;
  }

  function findReactComponents() {
    if (!isReactAvailable()) {
      return { isReact: false, prefixes: [], components: [], root: { id: 'root', name: 'Root', children: [], detail: null } };
    }

    const acc = {
      nodes: [],
      counter: 0,
      prefixStats: new Map(),
      componentStats: new Map()
    };

    const rootTree = { id: 'root', name: 'Root', children: [], detail: null };

    getRoots().forEach(root => {
      const fiberRoot = root.current;
      if (fiberRoot?.child) traverseFiber(fiberRoot.child, rootTree, acc, 0);
    });

    overlayState.nodes = acc.nodes;

    const prefixes = Array.from(acc.prefixStats.entries()).map(([prefix, count]) => ({
      prefix,
      count,
      enabled: true,
      color: '#60a5fa'
    }));

    const components = Array.from(acc.componentStats.values()).map(component => ({
      ...component,
      enabled: false,
      color: '#a78bfa'
    }));

    return {
      isReact: true,
      prefixes,
      components,
      root: rootTree
    };
  }

  function clearCanvas() {
    if (overlayState.canvas?.parentElement) {
      overlayState.canvas.parentElement.removeChild(overlayState.canvas);
    }
    overlayState.canvas = null;
  }

  function ensureCanvas() {
    if (overlayState.canvas) return overlayState.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
    document.body.appendChild(canvas);
    overlayState.canvas = canvas;
    return canvas;
  }

  function drawLabel(ctx, text, x, y, width, color) {
    ctx.save();
    ctx.font = '12px Inter, Segoe UI, sans-serif';
    const textWidth = ctx.measureText(text).width + 8;
    const boxX = overlayState.labelPosition === 'topRight' ? x + Math.max(0, width - textWidth) : x;
    const boxY = y;
    ctx.fillStyle = color;
    ctx.fillRect(boxX, boxY, textWidth, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, boxX + 4, boxY + 2);
    ctx.restore();
  }

  function drawOverlay() {
    clearCanvas();
    const canvas = ensureCanvas();
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (overlayState.coverEnabled) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const prefixMap = new Map(overlayState.prefixes.map(item => [item.prefix, item]));
    const componentMap = new Map(overlayState.components.map(item => [item.name, item]));

    overlayState.nodes
      .slice()
      .sort((a, b) => a.level - b.level)
      .forEach(node => {
        const prefixRule = prefixMap.get(node.prefix);
        const componentRule = componentMap.get(node.name);

        const isVisible = prefixRule?.enabled || componentRule?.enabled;
        if (!isVisible) return;

        const color = componentRule?.enabled ? componentRule.color : prefixRule?.color || '#60a5fa';
        const rect = node.rect;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

        drawLabel(ctx, overlayState.labelMode === 'selector' ? node.selector : node.name, rect.left, rect.top, rect.width, color);
      });
  }

  function togglePrefix(payload) {
    overlayState.prefixes = payload.prefixes || [];
    overlayState.components = payload.components || [];
    overlayState.labelPosition = payload.textPosition || 'topLeft';
    overlayState.labelMode = payload.nameOrSelector || 'name';
    overlayState.coverEnabled = Boolean(payload.coverEnabled);
    drawOverlay();
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message.type === 'findReactComponents') {
        sendResponse(findReactComponents());
        return;
      }

      if (message.type === 'togglePrefix') {
        sendResponse(togglePrefix(message.payload || {}));
        return;
      }

      sendResponse({ ok: false });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  });

  window.addEventListener('scroll', drawOverlay, { passive: true });
  window.addEventListener('resize', drawOverlay);
})();
