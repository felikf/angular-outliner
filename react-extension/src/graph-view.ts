interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
  detail: {
    memoized?: boolean;
  } | null;
}

interface Point {
  x: number;
  y: number;
}

const MIN_SCALE = 0.08;
const MAX_SCALE = 12;
const ZOOM_FACTOR = 1.16;

const state = {
  scale: 1,
  tx: 40,
  ty: 40,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  root: null as TreeNode | null,
  contentWidth: 0,
  contentHeight: 0
};

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function applyTransform(): void {
  const layer = document.getElementById('graphLayer');
  if (!layer) return;
  layer.setAttribute('transform', `translate(${state.tx} ${state.ty}) scale(${state.scale})`);
  $('status').textContent = `Zoom ${(state.scale * 100).toFixed(0)} %`;
}

function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}

function clientToWorld(point: Point): Point {
  return {
    x: (point.x - state.tx) / state.scale,
    y: (point.y - state.ty) / state.scale
  };
}

function zoomAt(client: Point, desiredScale: number): void {
  const nextScale = clampScale(desiredScale);
  const before = clientToWorld(client);

  state.scale = nextScale;
  state.tx = client.x - before.x * state.scale;
  state.ty = client.y - before.y * state.scale;
  applyTransform();
}

function fitToViewport(padding = 50): void {
  const svg = $('fullTreeGraph') as unknown as SVGSVGElement;
  const svgRect = svg.getBoundingClientRect();
  const usableWidth = Math.max(svgRect.width - padding * 2, 100);
  const usableHeight = Math.max(svgRect.height - padding * 2, 100);

  const scaleX = usableWidth / Math.max(state.contentWidth, 1);
  const scaleY = usableHeight / Math.max(state.contentHeight, 1);
  state.scale = clampScale(Math.min(scaleX, scaleY));

  const contentScaledWidth = state.contentWidth * state.scale;
  const contentScaledHeight = state.contentHeight * state.scale;

  state.tx = (svgRect.width - contentScaledWidth) / 2;
  state.ty = (svgRect.height - contentScaledHeight) / 2;
  applyTransform();
}

function renderGraph(root: TreeNode): void {
  const svg = $('fullTreeGraph') as unknown as SVGSVGElement;
  svg.innerHTML = '';

  const H_GAP = 220;
  const V_GAP = 110;
  const NODE_W = 180;
  const NODE_H = 46;

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
      childPoints.forEach(cp => edges.push({ from: { x, y }, to: cp }));
    }

    nodes.push({ n: node, x, y });
    return { x, y };
  }

  layout(root, 0);

  const maxX = Math.max(...nodes.map(n => n.x), 0) + NODE_W;
  const maxY = Math.max(...nodes.map(n => n.y), 0) + NODE_H;
  state.contentWidth = maxX + 120;
  state.contentHeight = maxY + 120;

  svg.setAttribute('viewBox', `0 0 ${state.contentWidth} ${state.contentHeight}`);

  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.setAttribute('id', 'graphLayer');
  svg.appendChild(layer);

  edges.forEach(edge => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const sx = edge.from.x + NODE_W / 2;
    const sy = edge.from.y + NODE_H;
    const tx = edge.to.x + NODE_W / 2;
    const ty = edge.to.y;
    const cy = (sy + ty) / 2;

    path.setAttribute('d', `M ${sx} ${sy} C ${sx} ${cy}, ${tx} ${cy}, ${tx} ${ty}`);
    path.setAttribute('stroke', '#5f7cf0');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    layer.appendChild(path);
  });

  nodes.forEach(({ n, x, y }) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(NODE_W));
    rect.setAttribute('height', String(NODE_H));
    rect.setAttribute('rx', '12');
    rect.setAttribute('fill', n.detail?.memoized ? '#2e1065' : '#1f2a4f');
    rect.setAttribute('stroke', n.detail?.memoized ? '#c4b5fd' : '#6b83d6');
    rect.setAttribute('stroke-width', '2');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x + NODE_W / 2));
    text.setAttribute('y', String(y + NODE_H / 2 + 4));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#f2f6ff');
    text.setAttribute('font-size', '13');
    text.setAttribute('font-family', 'Roboto, Segoe UI, sans-serif');
    text.textContent = n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name;

    g.append(rect, text);
    layer.appendChild(g);
  });

  fitToViewport();
}

function setupInteractions(): void {
  const svg = $('fullTreeGraph') as unknown as SVGSVGElement;

  svg.addEventListener('wheel', event => {
    event.preventDefault();

    const point = { x: event.clientX, y: event.clientY };
    const next = event.deltaY < 0 ? state.scale * ZOOM_FACTOR : state.scale / ZOOM_FACTOR;
    zoomAt(point, next);
  }, { passive: false });

  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 1) return;
    state.dragging = true;
    state.dragStartX = event.clientX - state.tx;
    state.dragStartY = event.clientY - state.ty;
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', event => {
    if (!state.dragging) return;
    state.tx = event.clientX - state.dragStartX;
    state.ty = event.clientY - state.dragStartY;
    applyTransform();
  });

  svg.addEventListener('pointerup', event => {
    state.dragging = false;
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  });

  svg.addEventListener('pointercancel', event => {
    state.dragging = false;
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  });

  $('fullZoomIn').addEventListener('click', () => {
    const rect = svg.getBoundingClientRect();
    zoomAt({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, state.scale * ZOOM_FACTOR);
  });

  $('fullZoomOut').addEventListener('click', () => {
    const rect = svg.getBoundingClientRect();
    zoomAt({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, state.scale / ZOOM_FACTOR);
  });

  $('fullZoomReset').addEventListener('click', () => {
    fitToViewport();
  });

  $('reloadGraph').addEventListener('click', () => {
    loadGraph();
  });

  window.addEventListener('resize', () => {
    if (state.root) {
      fitToViewport();
    }
  });
}

async function loadGraph(): Promise<void> {
  const data = await chrome.storage.local.get(['reactOutlinerGraphSnapshot']);
  const snap = data.reactOutlinerGraphSnapshot;

  if (!snap?.root) {
    $('status').textContent = 'Žádný graf není k dispozici. Vyber komponentu radiobuttonem v popupu.';
    return;
  }

  state.root = snap.root as TreeNode;
  renderGraph(state.root);
}

setupInteractions();
loadGraph();

export {};
