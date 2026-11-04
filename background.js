// Opens the in-page picker from the toolbar button or the keyboard command.
const SITES = ['https://claude.ai/', 'https://chatgpt.com/'];
const toggle = (tab) => {
  if (tab?.id && SITES.some((site) => tab.url?.startsWith(site))) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle-picker' }).catch(() => {});
  }
};

chrome.action.onClicked.addListener(toggle);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-picker') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggle(tab);
});
