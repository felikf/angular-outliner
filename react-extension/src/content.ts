(() => {
  type ComponentTag = 0 | 1 | 5 | 11 | 14 | 15;

  interface FiberNode {
    tag: ComponentTag;
    type?: any;
    elementType?: any;
    stateNode?: any;
    child?: FiberNode | null;
    sibling?: FiberNode | null;
  }

  interface TreeNode {
    id: string;
    name: string;
    children: TreeNode[];
    detail: {
      selector: string[];
      memoized: boolean;
    } | null;
  }

  interface OverlayNode {
    id: string;
    name: string;
    selector: string;
    prefix: string;
    rect: DOMRect;
    level: number;
    memoized: boolean;
  }

  interface PrefixItem {
    prefix: string;
    count: number;
    enabled: boolean;
    color: string;
  }

  interface ComponentItem {
    name: string;
    count: number;
    selectors: string[];
    memoized: boolean;
    enabled: boolean;
    color: string;
  }

  interface TogglePayload {
    prefixes: PrefixItem[];
    components: ComponentItem[];
    textPosition: 'topLeft' | 'topRight';
    nameOrSelector: 'name' | 'selector';
    coverEnabled: boolean;
  }

  const TAGS = {
    FunctionComponent: 0,
    ClassComponent: 1,
    HostComponent: 5,
    ForwardRef: 11,
    MemoComponent: 14,
    SimpleMemoComponent: 15
  } as const;

  const state = {
    nodes: [] as OverlayNode[],
    prefixes: [] as PrefixItem[],
    components: [] as ComponentItem[],
    labelPosition: 'topLeft' as 'topLeft' | 'topRight',
    labelMode: 'name' as 'name' | 'selector',
    coverEnabled: false,
    canvas: null as HTMLCanvasElement | null
  };

  function isReactAvailable(): boolean {
    const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    return Boolean(hook?.renderers?.size);
  }

  function getNameFromFiber(fiber: FiberNode): string | null {
    const type = fiber.type || fiber.elementType;
    if (!type) return null;
    if (typeof type === 'string') return type;
    return type.displayName || type.name || fiber.elementType?.displayName || fiber.elementType?.name || null;
  }

  function isComponentFiber(fiber: FiberNode): boolean {
    const componentTags: number[] = [
      TAGS.FunctionComponent,
      TAGS.ClassComponent,
      TAGS.MemoComponent,
      TAGS.SimpleMemoComponent,
      TAGS.ForwardRef
    ];
    return componentTags.includes(fiber.tag as number);
  }

  function isMemoizedFiber(fiber: FiberNode): boolean {
    return fiber.tag === TAGS.MemoComponent || fiber.tag === TAGS.SimpleMemoComponent;
  }

  function findHostNode(fiber: FiberNode | null | undefined): Element | null {
    let current = fiber;
    while (current) {
      if (current.tag === TAGS.HostComponent && current.stateNode instanceof Element) {
        return current.stateNode;
      }
      if (current.child) {
        const childResult = findHostNode(current.child);
        if (childResult) return childResult;
      }
      current = current.sibling || null;
    }
    return null;
  }

  function traverseFiber(
    fiber: FiberNode | null | undefined,
    parentTreeNode: TreeNode,
    acc: {
      nodes: OverlayNode[];
      counter: number;
      prefixStats: Map<string, number>;
      componentStats: Map<string, Omit<ComponentItem, 'enabled' | 'color'>>;
    },
    level = 0
  ): void {
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

            const node: OverlayNode = {
              id,
              name,
              selector,
              prefix,
              rect,
              level,
              memoized: isMemoizedFiber(current)
            };

            acc.nodes.push(node);
            const existing = acc.componentStats.get(name);
            acc.componentStats.set(name, {
              name,
              count: (existing?.count || 0) + 1,
              selectors: Array.from(new Set([...(existing?.selectors || []), selector])),
              memoized: existing?.memoized || node.memoized
            });
            acc.prefixStats.set(prefix, (acc.prefixStats.get(prefix) || 0) + 1);

            const treeNode: TreeNode = {
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

      current = current.sibling || null;
    }
  }

  function getRoots(): any[] {
    const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook?.renderers?.size) return [];

    const roots: any[] = [];
    hook.renderers.forEach((_: unknown, id: number) => {
      const rendererRoots = hook.getFiberRoots(id);
      if (rendererRoots?.size) rendererRoots.forEach((root: any) => roots.push(root));
    });

    return roots;
  }

  function findReactComponents() {
    if (!isReactAvailable()) {
      return { isReact: false, prefixes: [], components: [], root: { id: 'root', name: 'Root', children: [], detail: null } };
    }

    const acc = {
      nodes: [] as OverlayNode[],
      counter: 0,
      prefixStats: new Map<string, number>(),
      componentStats: new Map<string, Omit<ComponentItem, 'enabled' | 'color'>>()
    };

    const rootTree: TreeNode = { id: 'root', name: 'Root', children: [], detail: null };

    getRoots().forEach(root => {
      const fiberRoot = root.current as FiberNode;
      if (fiberRoot?.child) traverseFiber(fiberRoot.child, rootTree, acc, 0);
    });

    state.nodes = acc.nodes;

    const prefixes: PrefixItem[] = Array.from(acc.prefixStats.entries()).map(([prefix, count]) => ({
      prefix,
      count,
      enabled: true,
      color: '#60a5fa'
    }));

    const components: ComponentItem[] = Array.from(acc.componentStats.values()).map(component => ({
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

  function clearCanvas(): void {
    if (state.canvas?.parentElement) {
      state.canvas.parentElement.removeChild(state.canvas);
    }
    state.canvas = null;
  }

  function ensureCanvas(): HTMLCanvasElement {
    if (state.canvas) return state.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
    document.body.appendChild(canvas);
    state.canvas = canvas;
    return canvas;
  }

  function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, color: string): void {
    ctx.save();
    ctx.font = '12px Inter, Segoe UI, sans-serif';
    const textWidth = ctx.measureText(text).width + 8;
    const boxX = state.labelPosition === 'topRight' ? x + Math.max(0, width - textWidth) : x;
    const boxY = y;
    ctx.fillStyle = color;
    ctx.fillRect(boxX, boxY, textWidth, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, boxX + 4, boxY + 2);
    ctx.restore();
  }

  function drawOverlay(): void {
    clearCanvas();
    const canvas = ensureCanvas();
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.coverEnabled) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const prefixMap = new Map(state.prefixes.map(item => [item.prefix, item]));
    const componentMap = new Map(state.components.map(item => [item.name, item]));

    state.nodes
      .slice()
      .sort((a, b) => a.level - b.level)
      .forEach(node => {
        const prefixRule = prefixMap.get(node.prefix);
        const componentRule = componentMap.get(node.name);
        if (!prefixRule?.enabled && !componentRule?.enabled) return;

        const color = componentRule?.enabled ? componentRule.color : prefixRule?.color || '#60a5fa';
        const rect = node.rect;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

        drawLabel(ctx, state.labelMode === 'selector' ? node.selector : node.name, rect.left, rect.top, rect.width, color);
      });
  }

  function togglePrefix(payload: TogglePayload) {
    state.prefixes = payload.prefixes || [];
    state.components = payload.components || [];
    state.labelPosition = payload.textPosition || 'topLeft';
    state.labelMode = payload.nameOrSelector || 'name';
    state.coverEnabled = Boolean(payload.coverEnabled);
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
        sendResponse(togglePrefix(message.payload as TogglePayload));
        return;
      }

      sendResponse({ ok: false });
    } catch (error: any) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  });

  window.addEventListener('scroll', drawOverlay, { passive: true });
  window.addEventListener('resize', drawOverlay);
})();
