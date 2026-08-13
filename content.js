const PANEL_ID = 'x-muted-words-panel';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return [...new Set(value.split(/\r?\n/).map((word) => word.trim()).filter(Boolean))];
}

function pageText() {
  return document.body?.innerText?.toLocaleLowerCase() ?? '';
}

function findButton(pattern) {
  return [...document.querySelectorAll('button, [role="button"]')].find((node) => pattern.test(node.textContent?.trim() ?? ''));
}

function findTextInput() {
  return document.querySelector('input[type="text"], input:not([type]), textarea');
}

async function addWord(word) {
  const addButton = findButton(/^(add|添加|屏蔽词|mute)/i);
  if (!addButton) throw new Error('找不到“添加屏蔽词”按钮');
  addButton.click();
  await sleep(300);
  const input = findTextInput();
  if (!input) throw new Error('找不到屏蔽词输入框');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter && input instanceof HTMLInputElement) setter.call(input, word);
  else input.value = word;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(100);
  const saveButton = findButton(/^(save|保存|done|完成|添加)$/i);
  if (!saveButton) throw new Error('找不到保存按钮');
  saveButton.click();
  await sleep(500);
}

function createPanel(words) {
  document.querySelector(`#${PANEL_ID}`)?.remove();
  const panel = document.createElement('section');
  panel.id = PANEL_ID;
  const title = document.createElement('strong');
  title.textContent = 'X Muted Words';
  const summary = document.createElement('span');
  summary.className = 'x-muted-summary';
  const list = document.createElement('div');
  list.className = 'x-muted-list';
  const actions = document.createElement('div');
  actions.className = 'x-muted-actions';
  const refreshButton = document.createElement('button');
  refreshButton.dataset.action = 'refresh';
  refreshButton.textContent = '重新扫描';
  const addButton = document.createElement('button');
  addButton.dataset.action = 'add';
  addButton.textContent = '添加缺失词';
  const note = document.createElement('small');
  note.textContent = '只会添加，不会自动删除。提交前请检查差异。';
  actions.append(refreshButton, addButton);
  panel.append(title, summary, list, actions, note);
  document.body.append(panel);
  const render = () => {
    const existingText = pageText();
    const missing = words.filter((word) => !existingText.includes(word.toLocaleLowerCase()));
    summary.textContent = `词包 ${words.length} 个，页面未检测到 ${missing.length} 个`;
    list.replaceChildren();
    if (missing.length) {
      for (const word of missing) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.value = word;
        label.append(checkbox, document.createTextNode(` ${word}`));
        list.append(label);
      }
    } else {
      const empty = document.createElement('span');
      empty.textContent = '没有检测到缺失词，或页面尚未加载完成。';
      list.append(empty);
    }
    return missing;
  };
  refreshButton.addEventListener('click', render);
  addButton.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const selected = [...list.querySelectorAll('input:checked')].map((input) => input.value);
    button.disabled = true;
    for (const word of selected) {
      try { await addWord(word); }
      catch (error) { console.error(`[X Muted Words] ${word}`, error); }
    }
    button.disabled = false;
    render();
  });
  render();
}

chrome.storage.local.get({ mutedWords: [] }).then(({ mutedWords }) => {
  const words = normalize(mutedWords.join('\n'));
  if (words.length) createPanel(words);
  else console.info('[X Muted Words] 请先在扩展弹窗中编辑本地词包');
});
