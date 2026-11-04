// Opens the in-page picker from the toolbar button or the keyboard command.
const toggle = (tab) => {
  if (tab?.id && tab.url?.startsWith('https://claude.ai/')) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle-picker' }).catch(() => {});
  }
};

chrome.action.onClicked.addListener(toggle);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-picker') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggle(tab);
});
