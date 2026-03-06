(() => {
  type ComponentTag = 0 | 1 | 5 | 11 | 14 | 15;

  interface FiberNode {
    tag: ComponentTag;
    type?: any;
    elementType?: any;
    stateNode?: any;
    child?: FiberNode | null;
    sibling?: FiberNode | null;
    return?: FiberNode | null;
  }

  interface TreeNode {
    id: string;
    name: string;
    children: TreeNode[];
    detail: {
      selector: string[];
      memoized: boolean;
      familyId: string;
      familyLabel: string;
    } | null;
  }

  interface OverlayNode {
    id: string;
    name: string;
    selector: string;
    rect: DOMRect;
    level: number;
    memoized: boolean;
    familyId: string;
    familyLabel: string;
  }

  interface FamilyItem {
    id: string;
    label: string;
    count: number;
    enabled: boolean;
    color: string;
  }

  interface ComponentItem {
    name: string;
    count: number;
    selectors: string[];
    memoized: boolean;
    familyId: string;
    familyLabel: string;
    enabled: boolean;
    color: string;
  }

  interface TogglePayload {
    families: FamilyItem[];
    components: ComponentItem[];
    textPosition: 'topLeft' | 'topRight';
    coverEnabled: boolean;
    previewComponentName?: string | null;
  }

  interface FamilyInfo {
    id: string;
    label: string;
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
    families: [] as FamilyItem[],
    components: [] as ComponentItem[],
    labelPosition: 'topLeft' as 'topLeft' | 'topRight',
    coverEnabled: false,
    canvas: null as HTMLCanvasElement | null,
    previewComponentName: null as string | null
  };

  const LOG_PREFIX = '[react-outliner/page]';

  function log(...args: any[]) {
    console.log(LOG_PREFIX, ...args);
  }

  function sanitizeLabel(value: string): string {
    return value.replace(/[^a-zA-Z0-9@._/-]/g, '_');
  }

  function getTypeFromFiber(fiber: FiberNode): any {
    return fiber.type || fiber.elementType;
  }

  function getFamilyFromType(type: any): FamilyInfo {
    const fileName = type?._debugSource?.fileName as string | undefined;

    if (!fileName) {
      return { id: 'unknown', label: 'Unknown / runtime' };
    }

    const normalized = fileName.replace(/\\/g, '/');
    const nodeModulesMarker = '/node_modules/';
    const idx = normalized.indexOf(nodeModulesMarker);

    if (idx >= 0) {
      const rel = normalized.substring(idx + nodeModulesMarker.length);
      const parts = rel.split('/').filter(Boolean);
      if (parts.length) {
        const pkg = parts[0].startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
        return { id: `pkg:${sanitizeLabel(pkg)}`, label: pkg };
      }
      return { id: 'pkg:node_modules', label: 'node_modules' };
    }

    return { id: 'app:local', label: 'Application (local source)' };
  }

  function getReactHook(): any {
    return (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  }

  function isReactHookPresent(): boolean {
    const hook = getReactHook();
    return Boolean(hook?.supportsFiber);
  }

  function getNameFromFiber(fiber: FiberNode): string | null {
    const type = getTypeFromFiber(fiber);
    if (!type) return null;
    if (typeof type === 'string') return null;
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
      familyStats: Map<string, Omit<FamilyItem, 'enabled' | 'color'>>;
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
            const componentType = getTypeFromFiber(current);
            const family = getFamilyFromType(componentType);
            const id = `${name}-${acc.counter++}`;
            const selector = hostElement.tagName.toLowerCase();
            const rect = hostElement.getBoundingClientRect();

            const node: OverlayNode = {
              id,
              name,
              selector,
              rect,
              level,
              memoized: isMemoizedFiber(current),
              familyId: family.id,
              familyLabel: family.label
            };

            acc.nodes.push(node);

            const familyExisting = acc.familyStats.get(family.id);
            acc.familyStats.set(family.id, {
              id: family.id,
              label: family.label,
              count: (familyExisting?.count || 0) + 1
            });

            const componentKey = `${family.id}::${name}`;
            const componentExisting = acc.componentStats.get(componentKey);
            acc.componentStats.set(componentKey, {
              name,
              familyId: family.id,
              familyLabel: family.label,
              count: (componentExisting?.count || 0) + 1,
              selectors: Array.from(new Set([...(componentExisting?.selectors || []), selector])),
              memoized: componentExisting?.memoized || node.memoized
            });

            const treeNode: TreeNode = {
              id,
              name,
              children: [],
              detail: {
                selector: [selector],
                memoized: node.memoized,
                familyId: family.id,
                familyLabel: family.label
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

  function normalizeRootFiber(node: FiberNode | null | undefined): FiberNode | null {
    let current = node || null;
    while (current?.return) {
      current = current.return;
    }
    return current;
  }

  function getRootsFromHook(): FiberNode[] {
    const hook = getReactHook();
    if (!hook?.renderers?.size) return [];

    const roots: FiberNode[] = [];
    hook.renderers.forEach((_: unknown, id: number) => {
      const rendererRoots = hook.getFiberRoots?.(id);
      if (rendererRoots?.size) {
        rendererRoots.forEach((root: any) => {
          const rootFiber = root?.current as FiberNode;
          if (rootFiber) roots.push(rootFiber);
        });
      }
    });

    return roots;
  }

  function getReactFiberFromElement(el: Element): FiberNode | null {
    const anyEl = el as any;
    const keys = Object.keys(anyEl);

    for (const key of keys) {
      if (key.startsWith('__reactContainer$')) {
        const container = anyEl[key];
        if (container?.current) return container.current as FiberNode;
      }

      if (key.startsWith('__reactFiber$')) {
        return anyEl[key] as FiberNode;
      }
    }

    return null;
  }

  function getRootsFromDom(): FiberNode[] {
    const roots: FiberNode[] = [];
    const seen = new Set<FiberNode>();
    const allElements = document.querySelectorAll('*');

    allElements.forEach(el => {
      const foundFiber = getReactFiberFromElement(el);
      const rootFiber = normalizeRootFiber(foundFiber);
      if (rootFiber && !seen.has(rootFiber)) {
        seen.add(rootFiber);
        roots.push(rootFiber);
      }
    });

    return roots;
  }

  function getAllRoots(): FiberNode[] {
    const rootsFromHook = getRootsFromHook();
    if (rootsFromHook.length) return rootsFromHook;
    return getRootsFromDom();
  }

  function findReactComponents() {
    const hookPresent = isReactHookPresent();
    const roots = getAllRoots();

    if (!hookPresent && !roots.length) {
      return {
        isReact: false,
        families: [],
        components: [],
        root: { id: 'root', name: 'Root', children: [], detail: null }
      };
    }

    const acc = {
      nodes: [] as OverlayNode[],
      counter: 0,
      familyStats: new Map<string, Omit<FamilyItem, 'enabled' | 'color'>>(),
      componentStats: new Map<string, Omit<ComponentItem, 'enabled' | 'color'>>()
    };

    const rootTree: TreeNode = { id: 'root', name: 'Root', children: [], detail: null };

    roots.forEach(rootFiber => {
      const startFiber = rootFiber?.child ? rootFiber.child : rootFiber;
      if (startFiber) traverseFiber(startFiber, rootTree, acc, 0);
    });

    state.nodes = acc.nodes;

    const families: FamilyItem[] = Array.from(acc.familyStats.values()).map(family => ({
      ...family,
      enabled: false,
      color: '#60a5fa'
    }));

    const components: ComponentItem[] = Array.from(acc.componentStats.values()).map(component => ({
      ...component,
      enabled: false,
      color: '#a78bfa'
    }));

    log('findReactComponents result', {
      roots: roots.length,
      nodes: state.nodes.length,
      families: families.length,
      components: components.length
    });

    return {
      isReact: true,
      families,
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

    const familyMap = new Map(state.families.map(item => [item.id, item]));
    const componentMap = new Map(state.components.map(item => [`${item.familyId}::${item.name}`, item]));

    state.nodes
      .slice()
      .sort((a, b) => a.level - b.level)
      .forEach(node => {
        const familyRule = familyMap.get(node.familyId);
        const componentRule = componentMap.get(`${node.familyId}::${node.name}`);
        const previewMatches = state.previewComponentName && node.name === state.previewComponentName;

        if (!familyRule?.enabled && !componentRule?.enabled && !previewMatches) return;

        const color = previewMatches
          ? '#22d3ee'
          : componentRule?.enabled
            ? componentRule.color
            : familyRule?.color || '#60a5fa';

        const rect = node.rect;

        ctx.strokeStyle = color;
        ctx.lineWidth = previewMatches ? 2.5 : 1.5;
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

        drawLabel(ctx, node.name, rect.left, rect.top, rect.width, color);
      });
  }

  function togglePrefix(payload: TogglePayload) {
    state.families = payload.families || [];
    state.components = payload.components || [];
    state.labelPosition = payload.textPosition || 'topLeft';
    state.coverEnabled = Boolean(payload.coverEnabled);
    state.previewComponentName = payload.previewComponentName || null;
    drawOverlay();
    return { ok: true };
  }

  const HANDLERS = {
    findReactComponents: () => findReactComponents(),
    togglePrefix: (payload: TogglePayload) => togglePrefix(payload),
    ping: () => ({ ok: true, source: 'react-tracer' })
  };

  function handleMessage(e: MessageEvent) {
    if (!e.data || !Array.isArray(e.data)) {
      return;
    }

    const [id, data] = e.data;

    if (!data || data.type !== 'react_content_script' || !(data.action in HANDLERS)) {
      return;
    }

    try {
      const result = (HANDLERS as any)[data.action](data.payload);
      const messageToSend = [
        id,
        {
          type: 'react_tracer',
          payload: result
        }
      ];
      window.postMessage(messageToSend, '*');
    } catch (error: any) {
      log('Bridge action failed', { action: data.action, error: error?.message || String(error) });
      window.postMessage(
        [
          id,
          {
            type: 'react_tracer',
            payload: null
          },
          error?.message || String(error)
        ],
        '*'
      );
    }
  }

  window.addEventListener('message', handleMessage);
  window.addEventListener('scroll', drawOverlay, { passive: true });
  window.addEventListener('resize', drawOverlay);

  log('React tracer initialized', { url: location.href, hookPresent: isReactHookPresent() });
})();
