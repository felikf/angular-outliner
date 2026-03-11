interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
  detail: {
    memoized?: boolean;
  } | null;
}

const state = {
  scale: 1,
  tx: 40,
  ty: 40,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  root: null as TreeNode | null
};

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function applyTransform(): void {
  const layer = document.getElementById('graphLayer');
  if (!layer) return;
  layer.setAttribute('transform', `translate(${state.tx} ${state.ty}) scale(${state.scale})`);
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
  svg.setAttribute('viewBox', `0 0 ${maxX + 120} ${maxY + 120}`);

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

  applyTransform();
}

function setupInteractions(): void {
  const svg = $('fullTreeGraph') as unknown as SVGSVGElement;

  svg.addEventListener('wheel', event => {
    event.preventDefault();
    const next = event.deltaY < 0 ? state.scale * 1.1 : state.scale / 1.1;
    state.scale = Math.max(0.35, Math.min(3.2, next));
    applyTransform();
  });

  svg.addEventListener('pointerdown', event => {
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
    svg.releasePointerCapture(event.pointerId);
  });

  $('fullZoomIn').addEventListener('click', () => {
    state.scale = Math.min(3.2, state.scale * 1.12);
    applyTransform();
  });

  $('fullZoomOut').addEventListener('click', () => {
    state.scale = Math.max(0.35, state.scale / 1.12);
    applyTransform();
  });

  $('fullZoomReset').addEventListener('click', () => {
    state.scale = 1;
    state.tx = 40;
    state.ty = 40;
    applyTransform();
  });

  $('reloadGraph').addEventListener('click', () => {
    loadGraph();
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
  $('status').textContent = `Root: ${state.root.name}`;
  renderGraph(state.root);
}

setupInteractions();
loadGraph();


export {};
