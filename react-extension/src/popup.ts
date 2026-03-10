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
  memoized?: boolean;
  familyId: string;
  familyLabel: string;
  enabled: boolean;
  color: string;
}

interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
  detail: {
    memoized?: boolean;
    familyId?: string;
    familyLabel?: string;
  } | null;
}

interface FindResult {
  isReact: boolean;
  families: FamilyItem[];
  components: ComponentItem[];
  root: TreeNode;
}

const COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#f59e0b', '#22d3ee', '#fb7185'];

const state = {
  families: [] as FamilyItem[],
  components: [] as ComponentItem[],
  root: null as TreeNode | null,
  sort: 'name' as 'name' | 'count',
  filter: '',
  labelPosition: 'topLeft' as 'topLeft' | 'topRight',
  coverEnabled: false,
  previewComponentName: null as string | null,
  selectedMermaidRootKey: '',
  graph: {
    scale: 1,
    tx: 20,
    ty: 20,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0
  }
};

const byName = (a: ComponentItem, b: ComponentItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
const byCount = (a: ComponentItem, b: ComponentItem) => b.count - a.count || byName(a, b);
const $ = (id: string) => document.getElementById(id) as HTMLElement;

async function queryActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send<T = any>(type: string, payload?: any): Promise<T> {
  const tab = await queryActiveTab();
  return chrome.tabs.sendMessage(tab.id!, { type, payload });
}

function randomColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return `#${(hash & 0x00ffffff).toString(16).padStart(6, '0')}`;
}

function sanitizeMermaidToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function safeLabel(value: string): string {
  return value.replace(/[()]/g, '');
}

function componentKey(component: Pick<ComponentItem, 'familyId' | 'name'>): string {
  return `${component.familyId}::${component.name}`;
}

function findMermaidRoot(node: TreeNode, selectedKey: string): TreeNode | null {
  if (!selectedKey) return null;
  const [selectedFamilyId, ...nameParts] = selectedKey.split('::');
  const selectedName = nameParts.join('::');

  const queue: TreeNode[] = [node];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.name === selectedName && current.detail?.familyId === selectedFamilyId) {
      return current;
    }
    current.children.forEach(child => queue.push(child));
  }

  return null;
}

function getCurrentGraphRoot(): TreeNode | null {
  if (!state.root) return null;
  return findMermaidRoot(state.root, state.selectedMermaidRootKey) || state.root;
}

function updateMermaid(): void {
  const mermaidRoot = getCurrentGraphRoot();
  if (!mermaidRoot) return;
  ($('mermaid') as HTMLTextAreaElement).value = buildMermaid(mermaidRoot);
}

function buildMermaid(node: TreeNode): string {
  const lines = ['flowchart TD', 'classDef memoClass fill:#2e1065,stroke:#a78bfa,stroke-width:2px,color:#ede9fe;'];
  const memoNodes: string[] = [];

  function walk(parentId: string, parentLabel: string, current: TreeNode): void {
    const currentId = `${sanitizeMermaidToken(current.name)}_${sanitizeMermaidToken(current.id)}`;
    const currentLabel = safeLabel(current.name);
    lines.push(`${parentId}[${parentLabel}] --> ${currentId}[${currentLabel}]`);
    if (current.detail?.memoized) memoNodes.push(currentId);
    current.children.forEach(child => walk(currentId, currentLabel, child));
  }

  const rootId = `${sanitizeMermaidToken(node.name)}_${sanitizeMermaidToken(node.id)}`;
  const rootLabel = safeLabel(node.name || 'Root');
  lines.push(`${rootId}[${rootLabel}]`);

  node.children.forEach(child => walk(rootId, rootLabel, child));
  if (memoNodes.length) lines.push(`class ${memoNodes.join(',')} memoClass`);

  return lines.join('\n');
}

function renderTreeGraph(): void {
  const root = getCurrentGraphRoot();
  const svg = $('treeGraph') as unknown as SVGSVGElement;
  const viewport = $('treeGraphViewport');

  if (!root) {
    viewport.classList.add('hidden');
    return;
  }

  viewport.classList.remove('hidden');
  svg.innerHTML = '';

  const H_GAP = 180;
  const V_GAP = 88;
  const NODE_W = 148;
  const NODE_H = 38;

  const nodes: Array<{ n: TreeNode; x: number; y: number }> = [];
  const edges: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
  let leafIndex = 0;

  function layout(node: TreeNode, depth: number): { x: number; y: number } {
    const childPoints = node.children.map(child => layout(child, depth + 1));
    const y = depth * V_GAP;
    let x: number;

    if (!childPoints.length) {
      x = leafIndex * H_GAP;
      leafIndex += 1;
    } else {
      x = childPoints.reduce((acc, p) => acc + p.x, 0) / childPoints.length;
      childPoints.forEach(cp => {
        edges.push({ from: { x, y }, to: cp });
      });
    }

    const point = { x, y };
    nodes.push({ n: node, x, y });
    return point;
  }

  layout(root, 0);

  const maxX = Math.max(...nodes.map(n => n.x), 0) + NODE_W;
  const maxY = Math.max(...nodes.map(n => n.y), 0) + NODE_H;
  svg.setAttribute('viewBox', `0 0 ${maxX + 80} ${maxY + 80}`);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', 'graphLayer');
  svg.appendChild(g);

  edges.forEach(edge => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const sx = edge.from.x + NODE_W / 2;
    const sy = edge.from.y + NODE_H;
    const tx = edge.to.x + NODE_W / 2;
    const ty = edge.to.y;
    const cy = (sy + ty) / 2;
    path.setAttribute('d', `M ${sx} ${sy} C ${sx} ${cy}, ${tx} ${cy}, ${tx} ${ty}`);
    path.setAttribute('stroke', '#4b5b9a');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');
    g.appendChild(path);
  });

  nodes.forEach(({ n, x, y }) => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(NODE_W));
    rect.setAttribute('height', String(NODE_H));
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', n.detail?.memoized ? '#2e1065' : '#1f2a4f');
    rect.setAttribute('stroke', n.detail?.memoized ? '#a78bfa' : '#40508b');
    rect.setAttribute('stroke-width', '1.5');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x + NODE_W / 2));
    text.setAttribute('y', String(y + NODE_H / 2 + 4));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#e8edff');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-family', 'Roboto, Segoe UI, sans-serif');
    text.textContent = n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name;

    group.append(rect, text);
    g.appendChild(group);
  });

  applyGraphTransform();
}

function applyGraphTransform(): void {
  const graphLayer = document.getElementById('graphLayer');
  if (!graphLayer) return;
  graphLayer.setAttribute('transform', `translate(${state.graph.tx} ${state.graph.ty}) scale(${state.graph.scale})`);
}

function setupGraphInteractions(): void {
  const svg = $('treeGraph') as unknown as SVGSVGElement;

  svg.addEventListener('wheel', event => {
    event.preventDefault();
    const nextScale = event.deltaY < 0 ? state.graph.scale * 1.08 : state.graph.scale / 1.08;
    state.graph.scale = Math.max(0.4, Math.min(2.8, nextScale));
    applyGraphTransform();
  });

  svg.addEventListener('pointerdown', event => {
    state.graph.dragging = true;
    state.graph.dragStartX = event.clientX - state.graph.tx;
    state.graph.dragStartY = event.clientY - state.graph.ty;
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', event => {
    if (!state.graph.dragging) return;
    state.graph.tx = event.clientX - state.graph.dragStartX;
    state.graph.ty = event.clientY - state.graph.dragStartY;
    applyGraphTransform();
  });

  svg.addEventListener('pointerup', event => {
    state.graph.dragging = false;
    svg.releasePointerCapture(event.pointerId);
  });

  $('zoomIn').addEventListener('click', () => {
    state.graph.scale = Math.min(2.8, state.graph.scale * 1.15);
    applyGraphTransform();
  });

  $('zoomOut').addEventListener('click', () => {
    state.graph.scale = Math.max(0.4, state.graph.scale / 1.15);
    applyGraphTransform();
  });

  $('zoomReset').addEventListener('click', () => {
    state.graph.scale = 1;
    state.graph.tx = 20;
    state.graph.ty = 20;
    applyGraphTransform();
  });
}

function createFamilyRow(family: FamilyItem): HTMLElement {
  const row = document.createElement('label');
  row.className = 'row row-family';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = family.enabled;
  checkbox.addEventListener('change', () => {
    family.enabled = checkbox.checked;
    renderComponents();
    updateSummary();
    syncToPage();
  });

  const text = document.createElement('span');
  text.textContent = family.label;

  const right = document.createElement('small');
  right.innerHTML = `<span class="badge">${family.count}</span>`;

  const color = document.createElement('input');
  color.type = 'color';
  color.value = family.color;
  color.addEventListener('change', () => {
    family.color = color.value;
    syncToPage();
  });

  row.append(checkbox, text, right, color);
  return row;
}

function createComponentRow(component: ComponentItem): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row row-component';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = component.enabled;
  checkbox.addEventListener('change', () => {
    component.enabled = checkbox.checked;
    updateSummary();
    syncToPage();
  });

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'mermaid-root';
  radio.checked = state.selectedMermaidRootKey === componentKey(component);
  radio.title = 'Použít jako root grafu';
  radio.addEventListener('change', () => {
    if (radio.checked) {
      state.selectedMermaidRootKey = componentKey(component);
      updateMermaid();
      renderTreeGraph();
    }
  });

  const name = document.createElement('span');
  name.textContent = component.name;

  const right = document.createElement('small');
  right.innerHTML = `<span class="badge">${component.count}</span> <span class="badge">${component.familyLabel}</span>`;

  const color = document.createElement('input');
  color.type = 'color';
  color.value = component.color;
  color.addEventListener('change', () => {
    component.color = color.value;
    syncToPage();
  });

  row.addEventListener('mouseenter', () => {
    state.previewComponentName = component.name;
    syncToPage();
  });

  row.addEventListener('mouseleave', () => {
    state.previewComponentName = null;
    syncToPage();
  });

  row.append(checkbox, radio, name, right, color);
  return row;
}

function updateSummary(): void {
  const enabledComponents = state.components.filter(c => c.enabled).length;
  const enabledFamilies = state.families.filter(f => f.enabled).length;
  $('summary').textContent = `${state.components.length} komponent, aktivní: ${enabledComponents} | rodiny: ${enabledFamilies}`;
}

function renderFamilies(): void {
  const host = $('familyList');
  host.innerHTML = '';

  state.families
    .slice()
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .forEach(family => host.append(createFamilyRow(family)));
}

function renderComponents(): void {
  const host = $('componentList');
  host.innerHTML = '';

  const matcher = state.filter.trim().toLowerCase();
  const sorted = [...state.components].sort(state.sort === 'count' ? byCount : byName);

  const filtered = sorted.filter(component => {
    if (!matcher) return true;
    return component.name.toLowerCase().includes(matcher) || component.familyLabel.toLowerCase().includes(matcher);
  });

  filtered.forEach(component => host.append(createComponentRow(component)));
  updateSummary();
}

async function syncToPage(): Promise<void> {
  await chrome.storage.local.set({
    reactOutlinerCoverEnabled: state.coverEnabled,
    reactOutlinerLabelPosition: state.labelPosition,
    reactOutlinerMermaidRoot: state.selectedMermaidRootKey
  });

  await send('togglePrefix', {
    families: state.families,
    components: state.components,
    textPosition: state.labelPosition,
    coverEnabled: state.coverEnabled,
    previewComponentName: state.previewComponentName
  });
}

function wireEvents(): void {
  ($('componentFilter') as HTMLInputElement).addEventListener('input', event => {
    state.filter = (event.target as HTMLInputElement).value;
    renderComponents();
  });

  $('sortByName').addEventListener('click', () => {
    state.sort = 'name';
    $('sortByName').classList.add('sort-btn--active');
    $('sortByCount').classList.remove('sort-btn--active');
    renderComponents();
  });

  $('sortByCount').addEventListener('click', () => {
    state.sort = 'count';
    $('sortByCount').classList.add('sort-btn--active');
    $('sortByName').classList.remove('sort-btn--active');
    renderComponents();
  });

  ($('selectAll') as HTMLInputElement).addEventListener('change', event => {
    const shouldEnable = Boolean((event.target as HTMLInputElement).checked);
    const matcher = state.filter.trim().toLowerCase();

    state.components.forEach(component => {
      if (!matcher || component.name.toLowerCase().includes(matcher) || component.familyLabel.toLowerCase().includes(matcher)) {
        component.enabled = shouldEnable;
      }
    });

    renderComponents();
    syncToPage();
  });

  ($('labelPosition') as HTMLSelectElement).addEventListener('change', event => {
    state.labelPosition = (event.target as HTMLSelectElement).value as 'topLeft' | 'topRight';
    syncToPage();
  });

  ($('coverEnabled') as HTMLInputElement).addEventListener('change', event => {
    state.coverEnabled = Boolean((event.target as HTMLInputElement).checked);
    syncToPage();
  });
}

async function init(): Promise<void> {
  wireEvents();
  setupGraphInteractions();

  const [saved, result] = await Promise.all([
    chrome.storage.local.get(['reactOutlinerCoverEnabled', 'reactOutlinerLabelPosition', 'reactOutlinerMermaidRoot']),
    send<FindResult>('findReactComponents')
  ]);

  if (!result?.isReact) {
    $('error').textContent = 'Na této stránce nebyl nalezen React root.';
    return;
  }

  state.coverEnabled = Boolean(saved.reactOutlinerCoverEnabled);
  state.labelPosition = (saved.reactOutlinerLabelPosition as 'topLeft' | 'topRight') || 'topLeft';

  ($('coverEnabled') as HTMLInputElement).checked = state.coverEnabled;
  ($('labelPosition') as HTMLSelectElement).value = state.labelPosition;

  state.root = result.root;
  state.families = result.families.map((family, index) => ({
    ...family,
    color: COLORS[index] || randomColor(family.id),
    enabled: false
  }));

  state.components = result.components.map((component, index) => ({
    ...component,
    color: COLORS[index] || randomColor(`${component.familyId}-${component.name}`),
    enabled: false
  }));

  if (saved.reactOutlinerMermaidRoot && state.components.some(c => componentKey(c) === saved.reactOutlinerMermaidRoot)) {
    state.selectedMermaidRootKey = saved.reactOutlinerMermaidRoot;
  } else if (state.components.length) {
    state.selectedMermaidRootKey = componentKey(state.components[0]);
  }

  renderFamilies();
  renderComponents();
  updateMermaid();
  renderTreeGraph();
  $('controls').classList.remove('hidden');

  await syncToPage();
}

init().catch(err => {
  $('error').textContent = `Nepodařilo se načíst data: ${err?.message || String(err)}`;
});
