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

interface InspectorEventPayload {
  kind: 'hover' | 'select';
  name: string | null;
  familyId: string | null;
  familyLabel: string | null;
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
  inspectModeEnabled: false,
  inspectProjectOnlyEnabled: false,
  projectOnlyEnabled: false
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


function isProjectFamilyId(familyId: string): boolean {
  return familyId.startsWith('app:');
}

function isComponentVisible(component: ComponentItem): boolean {
  const matcher = state.filter.trim().toLowerCase();
  const matcherOk = !matcher || component.name.toLowerCase().includes(matcher) || component.familyLabel.toLowerCase().includes(matcher);
  const projectOk = !state.projectOnlyEnabled || isProjectFamilyId(component.familyId);
  return matcherOk && projectOk;
}

function getVisibleComponents(): ComponentItem[] {
  return state.components.filter(isComponentVisible);
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

  const candidate = findMermaidRoot(state.root, state.selectedMermaidRootKey) || state.root;
  if (!state.projectOnlyEnabled) return candidate;

  if (candidate.detail?.familyId && isProjectFamilyId(candidate.detail.familyId)) {
    return candidate;
  }

  const firstProject = state.components.find(component => isProjectFamilyId(component.familyId));
  if (!firstProject) return candidate;

  state.selectedMermaidRootKey = componentKey(firstProject);
  return findMermaidRoot(state.root, state.selectedMermaidRootKey) || candidate;
}

function buildProjectOnlyTree(node: TreeNode): TreeNode | null {
  const children = node.children
    .map(child => buildProjectOnlyTree(child))
    .filter((child): child is TreeNode => Boolean(child));

  const isProjectNode = Boolean(node.detail?.familyId && isProjectFamilyId(node.detail.familyId));
  if (!isProjectNode && !children.length) return null;

  return {
    ...node,
    children
  };
}

async function persistGraphSnapshot(): Promise<void> {
  const root = getCurrentGraphRoot();
  const snapshotRoot = state.projectOnlyEnabled && root ? buildProjectOnlyTree(root) || root : root;

  await chrome.storage.local.set({
    reactOutlinerGraphSnapshot: {
      root: snapshotRoot,
      selectedMermaidRootKey: state.selectedMermaidRootKey,
      savedAt: Date.now()
    }
  });
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

async function updateMermaidAndGraphSnapshot(): Promise<void> {
  const root = getCurrentGraphRoot();
  if (!root) return;

  const displayRoot = state.projectOnlyEnabled ? buildProjectOnlyTree(root) || root : root;
  ($('mermaid') as HTMLTextAreaElement).value = buildMermaid(displayRoot);
  await persistGraphSnapshot();
}

function scrollToComponentRow(component: Pick<ComponentItem, 'familyId' | 'name'>): void {
  const key = componentKey(component);
  const row = $('componentList').querySelector(`[data-component-key="${CSS.escape(key)}"]`) as HTMLElement | null;
  if (!row) return;

  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.add('row--flash');
  setTimeout(() => row.classList.remove('row--flash'), 700);
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
  row.dataset.componentKey = componentKey(component);

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
      updateMermaidAndGraphSnapshot();
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
  const visibleComponents = getVisibleComponents();
  const enabledComponents = state.components.filter(c => c.enabled && (!state.projectOnlyEnabled || isProjectFamilyId(c.familyId))).length;
  const enabledFamilies = state.families.filter(f => f.enabled && (!state.projectOnlyEnabled || isProjectFamilyId(f.id))).length;
  $('summary').textContent = `${visibleComponents.length}/${state.components.length} komponent, aktivní: ${enabledComponents} | rodiny: ${enabledFamilies}`;
}

function renderFamilies(): void {
  const host = $('familyList');
  host.innerHTML = '';

  state.families
    .filter(family => !state.projectOnlyEnabled || isProjectFamilyId(family.id))
    .slice()
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .forEach(family => host.append(createFamilyRow(family)));
}

function renderComponents(): void {
  const host = $('componentList');
  host.innerHTML = '';

  const sorted = [...state.components].sort(state.sort === 'count' ? byCount : byName);
  const filtered = sorted.filter(isComponentVisible);

  filtered.forEach(component => host.append(createComponentRow(component)));
  updateSummary();
}

function handleInspectorEvent(payload: InspectorEventPayload): void {
  if (!state.inspectModeEnabled) return;
  if (!payload?.name || !payload?.familyId) return;
  if (state.inspectProjectOnlyEnabled && !isProjectFamilyId(payload.familyId)) return;

  const component = state.components.find(c => c.name === payload.name && c.familyId === payload.familyId);
  if (!component) return;

  if (payload.kind === 'hover') {
    state.previewComponentName = component.name;
    syncToPage();
    return;
  }

  if (payload.kind === 'select') {
    component.enabled = true;
    state.previewComponentName = component.name;
    renderComponents();
    updateSummary();
    scrollToComponentRow(component);
    syncToPage();
  }
}

async function syncToPage(): Promise<void> {
  await chrome.storage.local.set({
    reactOutlinerCoverEnabled: state.coverEnabled,
    reactOutlinerLabelPosition: state.labelPosition,
    reactOutlinerMermaidRoot: state.selectedMermaidRootKey,
    reactOutlinerInspectModeEnabled: state.inspectModeEnabled,
    reactOutlinerInspectProjectOnlyEnabled: state.inspectProjectOnlyEnabled,
    reactOutlinerProjectOnlyEnabled: state.projectOnlyEnabled
  });

  const families = state.projectOnlyEnabled
    ? state.families.map(f => (isProjectFamilyId(f.id) ? f : { ...f, enabled: false }))
    : state.families;

  const components = state.projectOnlyEnabled
    ? state.components.map(c => (isProjectFamilyId(c.familyId) ? c : { ...c, enabled: false }))
    : state.components;

  await send('togglePrefix', {
    families,
    components,
    textPosition: state.labelPosition,
    coverEnabled: state.coverEnabled,
    previewComponentName: state.previewComponentName,
    inspectModeEnabled: state.inspectModeEnabled,
    inspectProjectOnlyEnabled: state.inspectProjectOnlyEnabled
  });
}

function openFullscreenGraph(): void {
  const url = chrome.runtime.getURL('graph.html');
  window.open(url, '_blank', 'width=1600,height=900');
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

    state.components.forEach(component => {
      if (isComponentVisible(component)) {
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

  ($('inspectFromPageCbx') as HTMLInputElement).addEventListener('change', event => {
    state.inspectModeEnabled = Boolean((event.target as HTMLInputElement).checked);
    if (!state.inspectModeEnabled) {
      state.previewComponentName = null;
    }
    syncToPage();
  });

  ($('inspectProjectOnlyCbx') as HTMLInputElement).addEventListener('change', event => {
    state.inspectProjectOnlyEnabled = Boolean((event.target as HTMLInputElement).checked);
    syncToPage();
  });


  ($('projectOnlyCbx') as HTMLInputElement).addEventListener('change', event => {
    state.projectOnlyEnabled = Boolean((event.target as HTMLInputElement).checked);

    if (state.projectOnlyEnabled && state.selectedMermaidRootKey) {
      const selected = state.components.find(c => componentKey(c) === state.selectedMermaidRootKey);
      if (selected && !isProjectFamilyId(selected.familyId)) {
        const firstProject = state.components.find(c => isProjectFamilyId(c.familyId));
        state.selectedMermaidRootKey = firstProject ? componentKey(firstProject) : '';
      }
    }

    renderFamilies();
    renderComponents();
    updateMermaidAndGraphSnapshot();
    syncToPage();
  });

  $('openGraphWindow').addEventListener('click', () => {
    openFullscreenGraph();
  });
}

async function init(): Promise<void> {
  wireEvents();

  const [saved, result] = await Promise.all([
    chrome.storage.local.get([
      'reactOutlinerCoverEnabled',
      'reactOutlinerLabelPosition',
      'reactOutlinerMermaidRoot',
      'reactOutlinerInspectModeEnabled',
      'reactOutlinerInspectProjectOnlyEnabled',
      'reactOutlinerProjectOnlyEnabled'
    ]),
    send<FindResult>('findReactComponents')
  ]);

  if (!result?.isReact) {
    $('error').textContent = 'Na této stránce nebyl nalezen React root.';
    return;
  }

  state.coverEnabled = Boolean(saved.reactOutlinerCoverEnabled);
  state.labelPosition = (saved.reactOutlinerLabelPosition as 'topLeft' | 'topRight') || 'topLeft';
  state.inspectModeEnabled = Boolean(saved.reactOutlinerInspectModeEnabled);
  state.inspectProjectOnlyEnabled = Boolean(saved.reactOutlinerInspectProjectOnlyEnabled);
  state.projectOnlyEnabled = Boolean(saved.reactOutlinerProjectOnlyEnabled);

  ($('coverEnabled') as HTMLInputElement).checked = state.coverEnabled;
  ($('labelPosition') as HTMLSelectElement).value = state.labelPosition;
  ($('inspectFromPageCbx') as HTMLInputElement).checked = state.inspectModeEnabled;
  ($('inspectProjectOnlyCbx') as HTMLInputElement).checked = state.inspectProjectOnlyEnabled;
  ($('projectOnlyCbx') as HTMLInputElement).checked = state.projectOnlyEnabled;

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
  await updateMermaidAndGraphSnapshot();
  $('controls').classList.remove('hidden');

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'reactInspectorEvent') {
      handleInspectorEvent(message.payload as InspectorEventPayload);
    }
  });

  await syncToPage();
}

init().catch(err => {
  $('error').textContent = `Nepodařilo se načíst data: ${err?.message || String(err)}`;
});

export {};
