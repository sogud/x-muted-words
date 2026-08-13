const SETTINGS_URL = 'https://x.com/settings/muted_keywords';
const words = document.querySelector('#words');
const editorActions = document.querySelector('#editor-actions');
const saveStatus = document.querySelector('#save-status');

function normalize(value) {
  return [...new Set(value.split(/\r?\n/).map((word) => word.trim()).filter(Boolean))];
}

async function loadPack() {
  const result = await chrome.storage.local.get({ mutedWords: [] });
  words.value = result.mutedWords.join('\n');
}

document.querySelector('#open-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: SETTINGS_URL });
  window.close();
});

document.querySelector('#edit-pack').addEventListener('click', async () => {
  await loadPack();
  words.hidden = false;
  editorActions.hidden = false;
});

document.querySelector('#save-pack').addEventListener('click', async () => {
  const pack = normalize(words.value);
  await chrome.storage.local.set({ mutedWords: pack });
  words.value = pack.join('\n');
  saveStatus.textContent = `已保存 ${pack.length} 个词`;
});
