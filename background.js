// Opens the in-page picker from the toolbar button or the keyboard command.
// The extension may not be allowed to read the tab's URL, so it just asks the tab;
// tabs without Chatscape have no listener and the error is ignored.
const toggle = (tab) => {
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle-picker' }).catch(() => {});
};

chrome.action.onClicked.addListener(toggle);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-picker') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggle(tab);
});
