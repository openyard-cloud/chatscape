# Chrome Web Store listing

Everything the Chrome Web Store developer dashboard asks for, ready to paste. Upload `dist/chatscape-<version>.zip` (built by `sh scripts/build.sh`).

## Store listing

**Name:** Chatscape: live wallpapers for Claude and ChatGPT

**Summary (132 characters max):**
Live ASCII and pixel wallpapers behind your Claude and ChatGPT chat. 20 scenes, no account, nothing leaves your browser.

**Category:** Personalization (Themes)  
**Language:** English (add Vietnamese as a second language with the text below)

**Description:**

Give your AI chat a view. Chatscape paints a live ASCII and pixel scene behind the claude.ai and ChatGPT chat: drifting clouds, a koi pond, meteor showers, rain on the window, a neon city and more.

20 scenes in five groups
• Nature: Cloud Drift, Fireflies, Bamboo Grove, Sakura
• Water: Koi Pond, Jellyfish, Honu Lagoon, Paper Boats
• Night sky: Moonlit, Meteor Shower, Aurora, Night City
• Weather: Window Rain, Snowfall, Sunset Beach, Mid-Autumn Lanterns
• Tech: Code Rain, Neon Rain, Game of Life, Retro 8-bit

Easy to use
• Open the picker from the toolbar button, with Alt+Shift+T (Option+Shift+T on a Mac), or by typing /chatscape in the chat box and pressing Enter (the message is not sent).
• Arrow keys preview scenes live; Esc closes the picker.
• Dim keeps text readable, Glass sets how see-through the panels are, Speed 0 freezes the scene.
• Turn off restores the page exactly as it was.

Private by design
• One permission (storage) and it runs only on claude.ai and chatgpt.com.
• No network requests, no analytics, no remote code. It never reads your messages.

Light on your computer: up to 30 frames per second, paused when the tab is hidden, and a still frame when your system asks for reduced motion.

Free and open source (MIT): https://github.com/openyard-cloud/chatscape
Part of OpenYard: https://openyard.cloud

Chatscape is an independent project and is not affiliated with or endorsed by Anthropic.

**Vietnamese description:**

Cho khung chat AI của bạn một khung cảnh. Chatscape vẽ cảnh động bằng ký tự ASCII và pixel phía sau khung chat claude.ai và ChatGPT: mây trôi, hồ cá koi, mưa sao băng, mưa bên cửa sổ, phố đêm neon và nhiều cảnh khác.

• 20 cảnh trong 5 nhóm: thiên nhiên, mặt nước, bầu trời đêm, thời tiết, công nghệ.
• Mở bảng chọn bằng nút trên thanh công cụ, phím Alt+Shift+T (trên Mac là Option+Shift+T), hoặc gõ /chatscape trong ô chat rồi Enter (tin nhắn không bị gửi).
• Dim giữ chữ dễ đọc, Glass chỉnh độ trong của các khung, Speed 0 cho cảnh đứng yên.
• Chỉ một quyền (storage), chỉ chạy trên claude.ai và chatgpt.com, không gửi dữ liệu đi đâu, không đọc tin nhắn của bạn.

Miễn phí, mã nguồn mở (MIT). Một dự án của OpenYard: https://openyard.cloud

**Graphics** (in this folder):
- Icon 128×128: `../icons/icon-128.png`
- Screenshots 1280×800: `screenshots/1-cloud-drift.png` … `screenshots/5-sakura.png`
- Small promo tile 440×280: `promo-small-440x280.png`
- Marquee promo tile 1400×560: `promo-marquee-1400x560.png`

Regenerate them from `test/index.html` and `store/promo.html` (see the header comment in `promo.html`).

**Website:** https://chatscape.openyard.cloud  
**Support:** https://github.com/openyard-cloud/chatscape/issues

## Privacy practices tab

**Single purpose:** Show an animated wallpaper behind the claude.ai and ChatGPT chat interfaces and let the user pick and adjust it.

**Permission justification**
- `storage`: saves the user's chosen scene and the Dim, Glass and Speed settings, synced across the user's own Chrome profiles.
- Host permissions `https://claude.ai/*` and `https://chatgpt.com/*` (content script): the wallpaper is drawn only on those two sites, behind their chat interface.

**Remote code:** No, I am not using remote code.

**Data usage:** Chatscape does not collect or use any of the listed data types. Tick none of the boxes, then certify:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://chatscape.openyard.cloud/privacy
