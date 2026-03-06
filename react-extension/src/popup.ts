interface PrefixItem {
  prefix: string;
  count: number;
  enabled: boolean;
  color: string;
}

interface ComponentItem {
  name: string;
  count: number;
  selectors?: string[];
  memoized?: boolean;
  enabled: boolean;
  color: string;
}

interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
  detail: {
    memoized?: boolean;
  } | null;
}

interface FindResult {
  isReact: boolean;
  prefixes: PrefixItem[];
  components: ComponentItem[];
  root: TreeNode;
}

const COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#f59e0b', '#22d3ee', '#fb7185'];

const state = {
  prefixes: [] as PrefixItem[],
  components: [] as ComponentItem[],
  root: null as TreeNode | null,
  sort: 'name' as 'name' | 'count',
  filter: '',
  labelMode: 'name' as 'name' | 'selector',
  labelPosition: 'topLeft' as 'topLeft' | 'topRight',
  coverEnabled: false
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

function createRow({ className = 'row', checked, label, right, color, onCheck, onColor }: any): HTMLElement {
  const row = document.createElement('label');
  row.className = className;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onCheck(checkbox.checked));

  const text = document.createElement('span');
  text.textContent = label;

  const rightEl = document.createElement('small');
  rightEl.innerHTML = right || '';

  const colorEl = document.createElement('input');
  colorEl.type = 'color';
  colorEl.value = color;
  colorEl.addEventListener('change', () => onColor(colorEl.value));

  row.append(checkbox, text, rightEl, colorEl);
  return row;
}

function updateSummary(): void {
  const enabled = state.components.filter(c => c.enabled).length;
  $('summary').textContent = `${state.components.length} komponent, aktivních ${enabled}`;
}

function buildMermaid(node: TreeNode): string {
  const lines = ['flowchart TD', 'classDef memoClass fill:#2e1065,stroke:#a78bfa,stroke-width:2px,color:#ede9fe;'];
  const memoNodes: string[] = [];

  function walk(parent: string, current: TreeNode): void {
    const currentId = `${current.name}-${current.id}`;
    lines.push(`${parent}[${parent}]-->${currentId}[${current.name}]`);
    if (current.detail?.memoized) memoNodes.push(currentId);
    current.children.forEach(child => walk(currentId, child));
  }

  node.children.forEach(child => walk('Root', child));
  if (memoNodes.length) lines.push(`class ${memoNodes.join(',')} memoClass`);
  return lines.join('\n');
}

function renderPrefixes(): void {
  const host = $('prefixList');
  host.innerHTML = '';

  state.prefixes.forEach(pref => {
    const row = createRow({
      className: 'row row-prefix',
      checked: pref.enabled,
      label: pref.prefix,
      right: `<span class="badge">${pref.count}</span>`,
      color: pref.color,
      onCheck: (checked: boolean) => {
        pref.enabled = checked;
        syncToPage();
      },
      onColor: (color: string) => {
        pref.color = color;
        syncToPage();
      }
    });

    host.append(row);
  });
}

function renderComponents(): void {
  const host = $('componentList');
  host.innerHTML = '';

  const matcher = state.filter.trim().toLowerCase();
  const sorted = [...state.components].sort(state.sort === 'count' ? byCount : byName);

  const filtered = sorted.filter(component => {
    if (!matcher) return true;
    const target = state.labelMode === 'selector' ? (component.selectors || []).join(', ') : component.name;
    return target.toLowerCase().includes(matcher);
  });

  filtered.forEach(component => {
    const label = state.labelMode === 'selector' ? (component.selectors || []).join(', ') || component.name : component.name;

    const row = createRow({
      checked: component.enabled,
      label,
      right: `<span class="badge">${component.count}</span> ${component.memoized ? '<span class="badge">memo</span>' : ''}`,
      color: component.color,
      onCheck: (checked: boolean) => {
        component.enabled = checked;
        updateSummary();
        syncToPage();
      },
      onColor: (color: string) => {
        component.color = color;
        syncToPage();
      }
    });

    host.append(row);
  });

  updateSummary();
}

async function syncToPage(): Promise<void> {
  await chrome.storage.local.set({
    reactOutlinerCoverEnabled: state.coverEnabled,
    reactOutlinerLabelMode: state.labelMode,
    reactOutlinerLabelPosition: state.labelPosition
  });

  await send('togglePrefix', {
    prefixes: state.prefixes,
    components: state.components,
    textPosition: state.labelPosition,
    nameOrSelector: state.labelMode,
    coverEnabled: state.coverEnabled
  });
}

function wireEvents(): void {
  ($('componentFilter') as HTMLInputElement).addEventListener('input', event => {
    state.filter = (event.target as HTMLInputElement).value;
    renderComponents();
    syncToPage();
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
      const target = state.labelMode === 'selector' ? (component.selectors || []).join(', ') : component.name;
      if (!matcher || target.toLowerCase().includes(matcher)) component.enabled = shouldEnable;
    });

    renderComponents();
    syncToPage();
  });

  ($('labelMode') as HTMLSelectElement).addEventListener('change', event => {
    state.labelMode = (event.target as HTMLSelectElement).value as 'name' | 'selector';
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

  const [saved, result] = await Promise.all([
    chrome.storage.local.get(['reactOutlinerCoverEnabled', 'reactOutlinerLabelMode', 'reactOutlinerLabelPosition']),
    send<FindResult>('findReactComponents')
  ]);

  if (!result?.isReact) {
    $('error').textContent = 'Na této stránce nebyl nalezen React root. Otevři localhost React appku v development režimu.';
    return;
  }

  state.coverEnabled = Boolean(saved.reactOutlinerCoverEnabled);
  state.labelMode = (saved.reactOutlinerLabelMode as 'name' | 'selector') || 'name';
  state.labelPosition = (saved.reactOutlinerLabelPosition as 'topLeft' | 'topRight') || 'topLeft';

  ( $('coverEnabled') as HTMLInputElement).checked = state.coverEnabled;
  ( $('labelMode') as HTMLSelectElement).value = state.labelMode;
  ( $('labelPosition') as HTMLSelectElement).value = state.labelPosition;

  state.root = result.root;
  state.prefixes = result.prefixes.map((prefix, index) => ({
    ...prefix,
    color: COLORS[index] || randomColor(prefix.prefix),
    enabled: true
  }));

  state.components = result.components.map((component, index) => ({
    ...component,
    color: COLORS[index] || randomColor(component.name),
    enabled: false
  }));

  renderPrefixes();
  renderComponents();
  ( $('mermaid') as HTMLTextAreaElement).value = buildMermaid(state.root);
  $('controls').classList.remove('hidden');

  await syncToPage();
}

init().catch(err => {
  $('error').textContent = `Nepodařilo se načíst data: ${err?.message || String(err)}`;
});
